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
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Metadata {
    label: String,
    #[serde(deserialize_with = "required_nullable_time")]
    effective_from: Option<DateTime<Utc>>,
    #[serde(deserialize_with = "required_nullable_time")]
    effective_until: Option<DateTime<Utc>>,
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
    let text = std::str::from_utf8(bytes)
        .map_err(|_| Error("unsupported_media"))?
        .replace("\r\n", "\n");
    if text
        .chars()
        .any(|c| c == '\0' || (c.is_control() && !['\n', '\r', '\t'].contains(&c)))
    {
        return Err(Error("unsupported_media"));
    }
    let chars: Vec<char> = text.chars().collect();
    Ok(chars
        .chunks(4000)
        .map(|s| s.iter().collect::<String>())
        .filter(|s| !s.trim().is_empty())
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
    if b.label.trim().is_empty()
        || b.label.chars().count() > 100
        || b.effective_from
            .zip(b.effective_until)
            .is_some_and(|(a, z)| a >= z)
    {
        return Err(Error("invalid_request"));
    }
    let (mime, bytes) = file.ok_or(Error("invalid_request"))?;
    if mime == "application/pdf" && !bytes.starts_with(b"%PDF-") {
        return Err(Error("unsupported_media"));
    }
    let mut chunks: Vec<(Option<i32>, String)> = if mime == "text/plain" {
        text_chunks(&bytes)?
            .into_iter()
            .map(|t| (None, t))
            .collect()
    } else {
        vec![]
    };
    let sha = format!("{:x}", Sha256::digest(&bytes));
    let mut hash = Sha256::new();
    hash.update(source.as_bytes());
    hash.update(&metadata);
    hash.update(&bytes);
    let request_hash = format!("{:x}", hash.finalize());
    let mut tx = s.pool()?.begin().await?;
    let source_kind:Option<String>=sqlx::query_scalar("SELECT s.kind FROM product.sources s JOIN product.memberships m ON m.institution_id=s.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE s.institution_id=$1 AND s.id=$2 FOR SHARE OF m FOR UPDATE OF s")
        .bind(i).bind(source).bind(&u.user_id).fetch_optional(&mut *tx).await?;
    if source_kind.as_deref()
        != Some(if mime == "application/pdf" {
            "pdf"
        } else {
            "text"
        })
    {
        return Err(Error("not_found"));
    }
    let operation = Uuid::new_v4();
    let inserted=sqlx::query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state) VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING")
        .bind(i).bind(&u.user_id).bind(key).bind(&request_hash).bind(operation).execute(&mut *tx).await?.rows_affected();
    if inserted == 0 {
        let row=sqlx::query("SELECT request_sha256,state,response FROM product.idempotency_keys WHERE institution_id=$1 AND user_id=$2 AND key=$3 FOR UPDATE").bind(i).bind(&u.user_id).bind(key).fetch_one(&mut *tx).await?;
        if row.try_get::<String, _>("request_sha256")? != request_hash
            || row.try_get::<String, _>("state")? != "completed"
        {
            return Err(Error("conflict"));
        }
        return Ok((StatusCode::ACCEPTED, Json(row.try_get("response")?)));
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
        .write_all(&bytes)
        .await
        .map_err(|_| Error("core_unavailable"))?;
    output
        .sync_all()
        .await
        .map_err(|_| Error("core_unavailable"))?;
    drop(output);
    if mime == "application/pdf" {
        // Parse failures and scans retain the original in quarantine, with no evidence chunks.
        let extracted = crate::pdf::extract(&path).await;
        if extracted.as_ref().is_err_and(|e| e.0 == "rate_limited") {
            return Err(Error("rate_limited"));
        }
        if let Ok(pages) = extracted {
            for (page, text) in pages.into_iter().enumerate() {
                match text_chunks(text.as_bytes()) {
                    Ok(parts) => {
                        chunks.extend(parts.into_iter().map(|t| (Some(page as i32 + 1), t)))
                    }
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
    // An ambiguous DB commit retains the private orphan for operator reconciliation, never exposes it.
    sqlx::query("INSERT INTO product.source_versions(id,institution_id,source_id,label,sha256,storage_key,status,indexing,effective_from,effective_until) VALUES($1,$2,$3,$4,$5,$6,$7,'disabled',$8,$9)")
        .bind(version).bind(i).bind(source).bind(b.label).bind(sha).bind(storage).bind(status).bind(b.effective_from).bind(b.effective_until).execute(&mut *tx).await?;
    for (ordinal, (page, chunk)) in chunks.iter().enumerate() {
        sqlx::query("INSERT INTO product.chunks(id,institution_id,source_id,version_id,ordinal,content,language,page,section,start_char,end_char) VALUES($1,$2,$3,$4,$5,$6,'en',$8,'Text',0,$7)")
            .bind(Uuid::new_v4()).bind(i).bind(source).bind(version).bind(ordinal as i32).bind(chunk).bind(chunk.chars().count() as i32).bind(page).execute(&mut *tx).await?;
    }
    let job = json!({"id":operation,"institution_id":i,"version_id":version,"state":"disabled","error_code":"provider_unavailable"});
    sqlx::query("INSERT INTO product.ingestion_jobs(id,institution_id,version_id,state,error_code) VALUES($1,$2,$3,'disabled','provider_unavailable')").bind(operation).bind(i).bind(version).execute(&mut *tx).await?;
    sqlx::query("UPDATE product.idempotency_keys SET state='completed',response=$4 WHERE institution_id=$1 AND user_id=$2 AND key=$3").bind(i).bind(u.user_id).bind(key).bind(&job).execute(&mut *tx).await?;
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
    if b.action == "retry_index" {
        return Err(Error("provider_unavailable"));
    }
    let mut tx = s.pool()?.begin().await?;
    let row=sqlx::query("SELECT v.status,v.source_id FROM product.source_versions v JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE v.institution_id=$1 AND v.id=$2 FOR UPDATE OF v FOR SHARE OF m").bind(i).bind(id).bind(&u.user_id).fetch_optional(&mut *tx).await?.ok_or(Error("not_found"))?;
    let status: String = row.try_get("status")?;
    let source: Uuid = row.try_get("source_id")?;
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
        sqlx::query("UPDATE product.source_versions SET status='archived' WHERE institution_id=$1 AND source_id=$2 AND status='approved' AND id<>$3").bind(i).bind(source).bind(id).execute(&mut *tx).await?;
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
