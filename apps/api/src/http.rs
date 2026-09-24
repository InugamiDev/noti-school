use crate::error::{Error, Result};
pub async fn limited_body(mut response: reqwest::Response, max: usize) -> Result<Vec<u8>> {
    if response.content_length().is_some_and(|n| n > max as u64) {
        return Err(Error("payload_too_large"));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Error("provider_unavailable"))?
    {
        if body.len().saturating_add(chunk.len()) > max {
            return Err(Error("payload_too_large"));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
