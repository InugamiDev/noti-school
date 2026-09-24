use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::{self, Page},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Create {
    title: String,
    kind: String,
    original_url: Option<String>,
    visibility: String,
}
pub async fn create(
    State(s): State<AppState>,
    Path(institution): Path<Uuid>,
    h: HeaderMap,
    Json(b): Json<Create>,
) -> Result<(StatusCode, Json<Value>)> {
    let user = auth::member(&s, &h, institution, true).await?;
    if b.title.trim().is_empty()
        || b.title.chars().count() > 300
        || !["pdf", "text", "url"].contains(&b.kind.as_str())
        || !["institution", "admin"].contains(&b.visibility.as_str())
        || (b.kind == "url") != b.original_url.is_some()
    {
        return Err(Error("invalid_request"));
    }
    if let Some(raw) = &b.original_url {
        crate::ssrf::validate_url(raw, &[])?;
    }
    let value:Value=sqlx::query_scalar("INSERT INTO product.sources(id,institution_id,title,kind,original_url,visibility) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM product.memberships WHERE institution_id=$2 AND user_id=$7 AND role='admin' AND revoked_at IS NULL) RETURNING to_jsonb(sources)")
        .bind(Uuid::new_v4()).bind(institution).bind(b.title).bind(b.kind).bind(b.original_url).bind(b.visibility).bind(user.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok((StatusCode::CREATED, Json(value)))
}
pub async fn list(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Query(page): Query<Page>,
) -> Result<Json<Value>> {
    let user = auth::member(&s, &h, i, false).await?;
    let scope = format!("sources:{i}:{}", user.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (at, id) = page.decode(&scope, key)?;
    let limit = page.limit()?;
    let rows:Vec<Value>=sqlx::query_scalar("SELECT to_jsonb(s) FROM product.sources s JOIN product.memberships m ON m.institution_id=s.institution_id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE s.institution_id=$1 AND (m.role='admin' OR s.visibility='institution') AND (s.created_at,s.id)>($3,$4) ORDER BY s.created_at,s.id LIMIT $5")
        .bind(i).bind(user.user_id).bind(at).bind(id).bind(limit+1).fetch_all(s.pool()?).await?;
    finish_page(rows, limit, &scope, key)
}
pub fn finish_page(
    mut rows: Vec<Value>,
    limit: i64,
    scope: &str,
    key: &str,
) -> Result<Json<Value>> {
    let more = rows.len() > limit as usize;
    rows.truncate(limit as usize);
    let cursor = if more {
        let last = rows.last().ok_or(Error("internal_error"))?;
        Some(pagination::encode(
            scope,
            serde_json::from_value(last["created_at"].clone())
                .map_err(|_| Error("internal_error"))?,
            serde_json::from_value(last["id"].clone()).map_err(|_| Error("internal_error"))?,
            key,
        ))
    } else {
        None
    };
    Ok(Json(json!({"items":rows,"next_cursor":cursor})))
}
pub async fn detail(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let row=sqlx::query_scalar("SELECT to_jsonb(s) FROM product.sources s JOIN product.memberships m ON m.institution_id=s.institution_id AND m.user_id=$3 AND m.revoked_at IS NULL WHERE s.institution_id=$1 AND s.id=$2 AND (m.role='admin' OR s.visibility='institution')")
        .bind(i).bind(id).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
pub async fn versions(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Query(page): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let scope = format!("versions:{i}:{id}:{}", u.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (at, last) = page.decode(&scope, key)?;
    let limit = page.limit()?;
    let rows=sqlx::query_scalar("SELECT to_jsonb(v)-'storage_key'-'approved_by'-'approved_at' FROM product.source_versions v JOIN product.sources s ON s.institution_id=v.institution_id AND s.id=v.source_id JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$3 AND m.revoked_at IS NULL WHERE v.institution_id=$1 AND v.source_id=$2 AND (m.role='admin' OR (s.visibility='institution' AND v.status IN ('approved','archived'))) AND (v.created_at,v.id)>($4,$5) ORDER BY v.created_at,v.id LIMIT $6")
        .bind(i).bind(id).bind(u.user_id).bind(at).bind(last).bind(limit+1).fetch_all(s.pool()?).await?;
    finish_page(rows, limit, &scope, key)
}
pub async fn version(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let row=sqlx::query_scalar("SELECT to_jsonb(v)-'storage_key'-'approved_by'-'approved_at' FROM product.source_versions v JOIN product.sources s ON s.institution_id=v.institution_id AND s.id=v.source_id JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$3 AND m.revoked_at IS NULL WHERE v.institution_id=$1 AND v.id=$2 AND (m.role='admin' OR (s.visibility='institution' AND v.status IN ('approved','archived')))")
        .bind(i).bind(id).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
pub async fn job(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    let row=sqlx::query_scalar("SELECT jsonb_build_object('id',j.id,'institution_id',j.institution_id,'version_id',j.version_id,'state',j.state,'error_code',j.error_code) FROM product.ingestion_jobs j JOIN product.memberships m ON m.institution_id=j.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE j.institution_id=$1 AND j.id=$2")
        .bind(i).bind(id).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
