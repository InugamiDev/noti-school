use crate::{
    AppState, auth,
    error::{Error, Result},
};
use axum::{
    Json,
    extract::{Multipart, Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Metadata {
    label: String,
    #[serde(deserialize_with = "required_nullable_time")]
    effective_from: Option<DateTime<Utc>>,
    #[serde(deserialize_with = "required_nullable_time")]
    effective_until: Option<DateTime<Utc>>,
    #[serde(default = "default_language")]
    language: String,
}
fn default_language() -> String {
    "en".into()
}
pub async fn fetch(
    State(s): State<AppState>,
    Path((i, source)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Json(b): Json<Metadata>,
) -> Result<(StatusCode, Json<Value>)> {
    let user = auth::member(&s, &h, i, true).await?;
    let key = h
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or(Error("invalid_request"))?
        .parse()
        .map_err(crate::error::invalid)?;
    let url: String = sqlx::query_scalar(
        "SELECT original_url FROM product.sources WHERE institution_id=$1 AND id=$2 AND kind='url'",
    )
    .bind(i)
    .bind(source)
    .fetch_optional(s.pool()?)
    .await?
    .ok_or(Error("not_found"))?;
    let (mime, bytes) = crate::ssrf::fetch(&url, &crate::ssrf::allowed_hosts(&s, i).await?).await?;
    ingest(&s, i, source, &user.user_id, key, b, &mime, &bytes, true).await
}
fn required_nullable_time<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> std::result::Result<Option<DateTime<Utc>>, D::Error> {
    Option::deserialize(d)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    action: String,
    expected_status: String,
}
pub fn text_chunks(bytes: &[u8]) -> Result<Vec<String>> {
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(Error("payload_too_large"));
    }
    let text = std::str::from_utf8(bytes).map_err(|_| Error("unsupported_media"))?;
    if text
        .chars()
        .any(|c| c == '\0' || (c.is_control() && !['\n', '\r', '\t'].contains(&c)))
    {
        return Err(Error("unsupported_media"));
    }
    if text.trim().is_empty() {
        return Ok(vec![]);
    }
    let chars: Vec<char> = text.chars().collect();
    Ok(chars
        .chunks(2000)
        .map(|s| s.iter().collect::<String>())
        .collect())
}
pub async fn upload(
    State(s): State<AppState>,
    Path((i, source)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::member(&s, &h, i, true).await?;
    let key: Uuid = h
        .get("idempotency-key")
        .and_then(|h| h.to_str().ok())
        .ok_or(Error("invalid_request"))?
        .parse()
        .map_err(crate::error::invalid)?;
    let mut metadata = None;
    let mut file = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(crate::error::invalid)?
    {
        let name = field.name().unwrap_or("").to_owned();
        let mime = field.content_type().unwrap_or("").to_owned();
        match name.as_str() {
            "metadata" if metadata.is_none() => {
                let bytes = field.bytes().await.map_err(crate::error::invalid)?;
                if bytes.len() > 65536 {
                    return Err(Error("payload_too_large"));
                }
                metadata = Some(bytes);
            }
            "file" if file.is_none() => {
                if !["text/plain", "application/pdf"].contains(&mime.as_str()) {
                    return Err(Error("unsupported_media"));
                }
                let bytes = field.bytes().await.map_err(crate::error::invalid)?;
                if bytes.len() > 20 * 1024 * 1024 {
                    return Err(Error("payload_too_large"));
                }
                file = Some((mime, bytes));
            }
            _ => return Err(Error("invalid_request")),
        }
    }
    let metadata = metadata.ok_or(Error("invalid_request"))?;
    let b: Metadata = serde_json::from_slice(&metadata).map_err(crate::error::invalid)?;
    let (mime, bytes) = file.ok_or(Error("invalid_request"))?;
    ingest(&s, i, source, &u.user_id, key, b, &mime, &bytes, false).await
}

#[allow(clippy::too_many_arguments)]
async fn ingest(
    s: &AppState,
    i: Uuid,
    source: Uuid,
    user: &str,
    key: Uuid,
    b: Metadata,
    mime: &str,
    bytes: &[u8],
    fetched: bool,
) -> Result<(StatusCode, Json<Value>)> {
    if b.label.trim().is_empty()
        || b.label.chars().count() > 100
        || b.effective_from
            .zip(b.effective_until)
            .is_some_and(|(a, z)| a >= z)
        || !["en", "vi"].contains(&b.language.as_str())
    {
        return Err(Error("invalid_request"));
    }
    if mime == "application/pdf" && !bytes.starts_with(b"%PDF-") {
        return Err(Error("unsupported_media"));
    }
    let mut chunks: Vec<(Option<i32>, String)> = if mime == "text/plain" {
        text_chunks(bytes)?.into_iter().map(|t| (None, t)).collect()
    } else {
        vec![]
    };
    let sha = format!("{:x}", Sha256::digest(bytes));
    let mut hash = Sha256::new();
    hash.update(source.as_bytes());
    hash.update(serde_json::to_vec(&b).map_err(crate::error::invalid)?);
    hash.update(bytes);
    let request_hash = format!("{:x}", hash.finalize());
    let mut tx = s.pool()?.begin().await?;
    let source_kind:Option<String>=sqlx::query_scalar("SELECT s.kind FROM product.sources s JOIN product.memberships m ON m.institution_id=s.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE s.institution_id=$1 AND s.id=$2 FOR SHARE OF m FOR UPDATE OF s")
        .bind(i).bind(source).bind(user).fetch_optional(&mut *tx).await?;
    if source_kind.as_deref()
        != Some(if fetched {
            "url"
        } else if mime == "application/pdf" {
            "pdf"
        } else {
            "text"
        })
    {
        return Err(Error("not_found"));
    }
    let operation = Uuid::new_v4();
    let inserted=sqlx::query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state) VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING")
        .bind(i).bind(user).bind(key).bind(&request_hash).bind(operation).execute(&mut *tx).await?.rows_affected();
    if inserted == 0 {
        let row=sqlx::query("SELECT request_sha256,state,response FROM product.idempotency_keys WHERE institution_id=$1 AND user_id=$2 AND key=$3 AND expires_at>now() FOR UPDATE").bind(i).bind(user).bind(key).fetch_optional(&mut *tx).await?.ok_or(Error("conflict"))?;
        if row.try_get::<String, _>("request_sha256")? != request_hash
            || row.try_get::<String, _>("state")? != "completed"
        {
            return Err(Error("conflict"));
        }
        return Ok((StatusCode::ACCEPTED, Json(row.try_get("response")?)));
    }
    let duplicate: bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.source_versions WHERE institution_id=$1 AND source_id=$2 AND sha256=$3)")
        .bind(i).bind(source).bind(&sha).fetch_one(&mut *tx).await?;
    if duplicate {
        return Err(Error("conflict"));
    }
    let version = Uuid::new_v4();
    let storage = version.to_string();
    // Private immutable UUID filenames; original filenames never become paths.
    let mut dir = tokio::fs::DirBuilder::new();
    dir.recursive(true).mode(0o700);
    dir.create(&s.config.uploads)
        .await
        .map_err(|_| Error("core_unavailable"))?;
    let root = tokio::fs::canonicalize(&s.config.uploads)
        .await
        .map_err(|_| Error("core_unavailable"))?;
    use std::os::unix::fs::PermissionsExt;
    if tokio::fs::metadata(&root)
        .await
        .map_err(|_| Error("core_unavailable"))?
        .permissions()
        .mode()
        & 0o077
        != 0
    {
        return Err(Error("core_unavailable"));
    }
    if let Ok(web) = tokio::fs::canonicalize(&s.config.web_dist).await
        && (root.starts_with(&web) || web.starts_with(&root))
    {
        return Err(Error("core_unavailable"));
    }
    let path = root.join(&storage);
    let mut output = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&path)
        .await
        .map_err(|_| Error("core_unavailable"))?;
    output
        .write_all(bytes)
        .await
        .map_err(|_| Error("core_unavailable"))?;
    output
        .sync_all()
        .await
        .map_err(|_| Error("core_unavailable"))?;
    drop(output);
    if mime == "application/pdf" || mime == "text/html" {
        // Parse failures and scans retain the original in quarantine, with no evidence chunks.
        let extracted = if mime == "application/pdf" {
            crate::pdf::extract(&path).await
        } else {
            crate::pdf::extract_html(&path).await
        };
        if extracted.as_ref().is_err_and(|e| e.0 == "rate_limited") {
            return Err(Error("rate_limited"));
        }
        if let Ok(pages) = extracted {
            for (page, text) in pages.into_iter().enumerate() {
                match text_chunks(text.as_bytes()) {
                    Ok(parts) => chunks.extend(parts.into_iter().map(|t| {
                        (
                            if mime == "application/pdf" {
                                Some(page as i32 + 1)
                            } else {
                                None
                            },
                            t,
                        )
                    })),
                    Err(_) => {
                        chunks.clear();
                        break;
                    }
                }
            }
        }
    }
    let status = if chunks.is_empty() {
        "quarantined"
    } else {
        "pending_review"
    };
    if chunks.len() > 512 {
        return Err(Error("payload_too_large"));
    }
    let enabled = s.config.ai_keys().is_ok() && !chunks.is_empty();
    let indexing = if enabled { "pending" } else { "disabled" };
    // An ambiguous DB commit retains the private orphan for operator reconciliation, never exposes it.
    sqlx::query("INSERT INTO product.source_versions(id,institution_id,source_id,label,sha256,storage_key,status,indexing,effective_from,effective_until,language) VALUES($1,$2,$3,$4,$5,$6,$7,$10,$8,$9,$11)")
        .bind(version).bind(i).bind(source).bind(b.label).bind(sha).bind(storage).bind(status).bind(b.effective_from).bind(b.effective_until).bind(indexing).bind(&b.language).execute(&mut *tx).await?;
    let mut offsets = std::collections::BTreeMap::new();
    for (ordinal, (page, chunk)) in chunks.iter().enumerate() {
        let start = *offsets.get(page).unwrap_or(&0i32);
        let end = start + chunk.chars().count() as i32;
        offsets.insert(*page, end);
        if chunk.trim().is_empty() {
            continue;
        }
        sqlx::query("INSERT INTO product.chunks(id,institution_id,source_id,version_id,ordinal,content,language,page,section,start_char,end_char) VALUES($1,$2,$3,$4,$5,$6,$9,$8,'Text',$10,$7)")
            .bind(Uuid::new_v4()).bind(i).bind(source).bind(version).bind(ordinal as i32).bind(chunk).bind(end).bind(page).bind(&b.language).bind(start).execute(&mut *tx).await?;
    }
    let state = if enabled { "queued" } else { "disabled" };
    let error = if enabled {
        None
    } else {
        Some("provider_unavailable")
    };
    let job = json!({"id":operation,"institution_id":i,"version_id":version,"state":state,"error_code":error});
    sqlx::query("INSERT INTO product.ingestion_jobs(id,institution_id,version_id,state,error_code) VALUES($1,$2,$3,$4,$5)").bind(operation).bind(i).bind(version).bind(state).bind(error).execute(&mut *tx).await?;
    sqlx::query("UPDATE product.idempotency_keys SET state='completed',response=$4 WHERE institution_id=$1 AND user_id=$2 AND key=$3").bind(i).bind(user).bind(key).bind(&job).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok((StatusCode::ACCEPTED, Json(job)))
}
pub async fn action(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Json(b): Json<Action>,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::member(&s, &h, i, true).await?;
    if !["approve", "archive", "retry_index"].contains(&b.action.as_str())
        || ![
            "draft",
            "quarantined",
            "pending_review",
            "approved",
            "archived",
            "failed",
        ]
        .contains(&b.expected_status.as_str())
    {
        return Err(Error("invalid_request"));
    }
    let mut tx = s.pool()?.begin().await?;
    let row=sqlx::query("SELECT v.status,v.source_id FROM product.source_versions v JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE v.institution_id=$1 AND v.id=$2 FOR UPDATE OF v FOR SHARE OF m").bind(i).bind(id).bind(&u.user_id).fetch_optional(&mut *tx).await?.ok_or(Error("not_found"))?;
    let status: String = row.try_get("status")?;
    let source: Uuid = row.try_get("source_id")?;
    if b.action == "retry_index" {
        s.config.ai_keys()?;
        if status != b.expected_status || !["pending_review", "approved"].contains(&status.as_str())
        {
            return Err(Error("conflict"));
        }
        let job: Option<Uuid> = sqlx::query_scalar("UPDATE product.ingestion_jobs j SET state='queued',error_code=NULL,updated_at=now() WHERE j.institution_id=$1 AND j.version_id=$2 AND j.state IN ('failed','disabled') AND j.attempt<3 AND EXISTS(SELECT 1 FROM product.idempotency_keys k WHERE k.operation_id=j.id AND k.user_id=$3) AND NOT EXISTS(SELECT 1 FROM product.pipeline_stages p JOIN product.ai_reservations r ON r.operation_id=p.id WHERE p.root_operation_id=j.id AND r.state IN ('dispatched','uncertain')) RETURNING j.id")
            .bind(i).bind(id).bind(&u.user_id).fetch_optional(&mut *tx).await?;
        let job = job.ok_or(Error("conflict"))?;
        // Explicit administrator recovery extends the indexing operation, never an answer replay window.
        sqlx::query("UPDATE product.idempotency_keys SET expires_at=now()+interval '24 hours' WHERE operation_id=$1 AND user_id=$2 AND state='completed'").bind(job).bind(&u.user_id).execute(&mut *tx).await?;
        sqlx::query("UPDATE product.source_versions SET indexing='pending' WHERE institution_id=$1 AND id=$2").bind(i).bind(id).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok((
            StatusCode::ACCEPTED,
            Json(
                json!({"id":job,"institution_id":i,"version_id":id,"state":"queued","error_code":null}),
            ),
        ));
    }
    if status != b.expected_status
        || (b.action == "approve" && status != "pending_review")
        || (b.action == "archive" && !["approved", "pending_review"].contains(&status.as_str()))
    {
        return Err(Error("conflict"));
    }
    sqlx::query("SELECT id FROM product.sources WHERE institution_id=$1 AND id=$2 FOR UPDATE")
        .bind(i)
        .bind(source)
        .execute(&mut *tx)
        .await?;
    if b.action == "approve" {
        sqlx::query("UPDATE product.source_versions SET status='approved',approved_by=$3,approved_at=now() WHERE institution_id=$1 AND id=$2").bind(i).bind(id).bind(&u.user_id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE product.sources SET current_version_id=$3 WHERE institution_id=$1 AND id=$2",
        )
        .bind(i)
        .bind(source)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query("UPDATE product.source_versions SET status='archived' WHERE institution_id=$1 AND id=$2").bind(i).bind(id).execute(&mut *tx).await?;
        sqlx::query("UPDATE product.sources SET current_version_id=NULL WHERE institution_id=$1 AND id=$2 AND current_version_id=$3").bind(i).bind(source).bind(id).execute(&mut *tx).await?;
    }
    let job = Uuid::new_v4();
    sqlx::query("INSERT INTO product.ingestion_jobs(id,institution_id,version_id,state) VALUES($1,$2,$3,'succeeded')").bind(job).bind(i).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(
            json!({"id":job,"institution_id":i,"version_id":id,"state":"succeeded","error_code":null}),
        ),
    ))
}
pub async fn download(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Response> {
    let u = auth::member(&s, &h, i, false).await?;
    let key:String=sqlx::query_scalar("SELECT v.storage_key FROM product.source_versions v JOIN product.sources s ON s.institution_id=v.institution_id AND s.id=v.source_id JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$3 AND m.revoked_at IS NULL WHERE v.institution_id=$1 AND v.id=$2 AND (m.role='admin' OR (s.visibility='institution' AND v.status IN ('approved','archived')))")
        .bind(i).bind(id).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    if key != id.to_string() {
        return Err(Error("not_found"));
    }
    let root = tokio::fs::canonicalize(&s.config.uploads)
        .await
        .map_err(|_| Error("not_found"))?;
    let path = tokio::fs::canonicalize(root.join(key))
        .await
        .map_err(|_| Error("not_found"))?;
    if !path.starts_with(root)
        || tokio::fs::metadata(&path)
            .await
            .map_err(|_| Error("not_found"))?
            .len()
            > 20 * 1024 * 1024
    {
        return Err(Error("not_found"));
    }
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|_| Error("not_found"))?;
    Ok((
        [
            ("content-type", "application/octet-stream"),
            (
                "content-disposition",
                "attachment; filename=source-document",
            ),
            ("content-security-policy", "sandbox"),
        ],
        bytes,
    )
        .into_response())
}
