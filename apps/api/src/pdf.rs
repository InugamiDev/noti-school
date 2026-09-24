use crate::error::{Error, Result};
use std::{path::Path, time::Duration};
pub(crate) static PARSERS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
struct ExtractionOutput(std::path::PathBuf);
impl Drop for ExtractionOutput {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
// intent: untrusted decompression runs in a disposable resource-limited process, not the API heap.
pub fn extract_child(input: &Path, output: &Path) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let bytes = std::fs::read(input).map_err(|_| Error("unsupported_media"))?;
    if bytes.len() > 20 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") {
        return Err(Error("unsupported_media"));
    }
    let doc = lopdf::Document::load_mem(&bytes).map_err(|_| Error("unsupported_media"))?;
    let count = doc.get_pages().len();
    if count == 0 || count > 500 || doc.is_encrypted() {
        return Err(Error("unsupported_media"));
    }
    drop(doc);
    let pages = pdf_extract::extract_text_from_mem_by_pages(&bytes)
        .map_err(|_| Error("unsupported_media"))?;
    if pages.len() != count || pages.iter().map(String::len).sum::<usize>() > 2 * 1024 * 1024 {
        return Err(Error("unsupported_media"));
    }
    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(output)
        .map_err(|_| Error("core_unavailable"))?;
    out.write_all(&serde_json::to_vec(&pages).map_err(crate::error::invalid)?)
        .map_err(|_| Error("core_unavailable"))?;
    Ok(())
}
pub fn extract_html_child(input: &Path, output: &Path) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let bytes = std::fs::read(input).map_err(|_| Error("unsupported_media"))?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(Error("payload_too_large"));
    }
    let text =
        html2text::from_read(bytes.as_slice(), 120).map_err(|_| Error("unsupported_media"))?;
    if text.len() > 2 * 1024 * 1024 {
        return Err(Error("payload_too_large"));
    }
    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(output)
        .map_err(|_| Error("core_unavailable"))?;
    out.write_all(&serde_json::to_vec(&vec![text]).map_err(crate::error::invalid)?)
        .map_err(|_| Error("core_unavailable"))?;
    Ok(())
}
pub async fn extract(input: &Path) -> Result<Vec<String>> {
    extract_process(input, "--extract-pdf").await
}
pub async fn extract_html(input: &Path) -> Result<Vec<String>> {
    extract_process(input, "--extract-html").await
}
async fn extract_process(input: &Path, flag: &str) -> Result<Vec<String>> {
    let _permit = PARSERS.try_acquire().map_err(|_| Error("rate_limited"))?;
    let output = input.with_extension("extracted");
    let _cleanup = ExtractionOutput(output.clone());
    let exe = std::env::current_exe().map_err(|_| Error("core_unavailable"))?;
    // Cargo's library test harness cannot serve the parser CLI; use the same-source native binary.
    #[cfg(test)]
    let exe = exe
        .parent()
        .and_then(Path::parent)
        .ok_or(Error("core_unavailable"))?
        .join("noti-school-api");
    let mut command = tokio::process::Command::new("/usr/bin/prlimit");
    command
        .args([
            "--as=536870912",
            "--cpu=5",
            "--fsize=4194304",
            "--nofile=32",
            "--",
        ])
        .arg(exe)
        .arg(flag)
        .arg(input)
        .arg(&output)
        .env_clear()
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    let outcome = tokio::time::timeout(Duration::from_secs(7), command.status()).await;
    if outcome.is_ok_and(|r| r.is_ok_and(|s| s.success())) {
        match tokio::fs::metadata(&output).await {
            Ok(m) if m.len() <= 4 * 1024 * 1024 => tokio::fs::read(&output)
                .await
                .map_err(|_| Error("unsupported_media"))
                .and_then(|v| serde_json::from_slice(&v).map_err(|_| Error("unsupported_media"))),
            _ => Err(Error("unsupported_media")),
        }
    } else {
        Err(Error("unsupported_media"))
    }
}
