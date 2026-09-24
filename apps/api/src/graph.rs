use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::{self, Page},
    pipeline::{CURRENT, EVIDENCE_JSON},
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
pub struct Entity {
    kind: String,
    label: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edge {
    from_entity_id: Uuid,
    to_entity_id: Uuid,
    relation: String,
    evidence_chunk_id: Uuid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Approval {
    status: String,
}

pub async fn entity(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Json(b): Json<Entity>,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::member(&s, &h, i, true).await?;
    if ![
        "course",
        "procedure",
        "regulation",
        "office",
        "form",
        "program",
    ]
    .contains(&b.kind.as_str())
        || b.label.trim().is_empty()
        || b.label.chars().count() > 300
    {
        return Err(Error("invalid_request"));
    }
    let value: Value = sqlx::query_scalar("INSERT INTO product.graph_entities(id,institution_id,kind,label) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM product.memberships WHERE institution_id=$2 AND user_id=$5 AND role='admin' AND revoked_at IS NULL) RETURNING to_jsonb(graph_entities)")
        .bind(Uuid::new_v4()).bind(i).bind(b.kind).bind(b.label).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok((StatusCode::CREATED, Json(value)))
}
const READABLE: &str = "FROM product.graph_edges e JOIN product.chunks c ON c.institution_id=e.institution_id AND c.id=e.evidence_chunk_id JOIN product.source_versions v ON v.institution_id=c.institution_id AND v.id=c.version_id JOIN product.sources s ON s.institution_id=c.institution_id AND s.id=c.source_id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE e.institution_id=$1 AND (m.role='admin' OR (e.status='approved' AND s.visibility='institution' AND s.current_version_id=v.id AND v.status='approved' AND v.indexing='ready' AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now())))";
fn projection() -> String {
    format!(
        "jsonb_build_object('id',e.id,'institution_id',e.institution_id,'from_entity_id',e.from_entity_id,'to_entity_id',e.to_entity_id,'relation',e.relation,'status',e.status,'evidence',jsonb_build_array({EVIDENCE_JSON}))"
    )
}
async fn get(s: &AppState, i: Uuid, user: &str, id: Uuid) -> Result<Value> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {} {READABLE} AND e.id=$3",
        projection()
    )))
    .bind(i)
    .bind(user)
    .bind(id)
    .fetch_optional(s.pool()?)
    .await?
    .ok_or(Error("not_found"))
}
pub async fn edge(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Json(b): Json<Edge>,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::member(&s, &h, i, true).await?;
    if b.relation.trim().is_empty() || b.relation.chars().count() > 100 {
        return Err(Error("invalid_request"));
    }
    let id = Uuid::new_v4();
    let n = sqlx::query("INSERT INTO product.graph_edges(id,institution_id,from_entity_id,to_entity_id,relation,evidence_chunk_id) SELECT $1,$2,$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM product.chunks c JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=$7 AND m.role='admin' AND m.revoked_at IS NULL WHERE c.institution_id=$2 AND c.id=$6) AND EXISTS(SELECT 1 FROM product.graph_entities WHERE institution_id=$2 AND id=$3) AND EXISTS(SELECT 1 FROM product.graph_entities WHERE institution_id=$2 AND id=$4)")
        .bind(id).bind(i).bind(b.from_entity_id).bind(b.to_entity_id).bind(b.relation).bind(b.evidence_chunk_id).bind(&u.user_id).execute(s.pool()?).await?.rows_affected();
    if n != 1 {
        return Err(Error("not_found"));
    }
    Ok((StatusCode::CREATED, Json(get(&s, i, &u.user_id, id).await?)))
}
pub async fn approve(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Json(b): Json<Approval>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    if !["approved", "rejected"].contains(&b.status.as_str()) {
        return Err(Error("invalid_request"));
    }
    let mut tx = s.pool()?.begin().await?;
    let chunk: Uuid = sqlx::query_scalar("SELECT evidence_chunk_id FROM product.graph_edges WHERE institution_id=$1 AND id=$2 FOR UPDATE").bind(i).bind(id).fetch_optional(&mut *tx).await?.ok_or(Error("not_found"))?;
    if b.status == "approved" {
        let visible: Option<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT c.id {CURRENT} AND c.id=$3 AND m.role='admin' FOR SHARE OF s,v,m"
        )))
        .bind(i)
        .bind(&u.user_id)
        .bind(chunk)
        .fetch_optional(&mut *tx)
        .await?;
        if visible.is_none() {
            return Err(Error("conflict"));
        }
    }
    let n = sqlx::query("UPDATE product.graph_edges SET status=$3,approved_by=$4 WHERE institution_id=$1 AND id=$2 AND EXISTS(SELECT 1 FROM product.memberships WHERE institution_id=$1 AND user_id=$4 AND role='admin' AND revoked_at IS NULL)")
        .bind(i).bind(id).bind(&b.status).bind(&u.user_id).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(Error("not_found"));
    }
    tx.commit().await?;
    Ok(Json(get(&s, i, &u.user_id, id).await?))
}
pub async fn list(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Query(p): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let role: String = sqlx::query_scalar("SELECT role FROM product.memberships WHERE institution_id=$1 AND user_id=$2 AND revoked_at IS NULL").bind(i).bind(&u.user_id).fetch_one(s.pool()?).await?;
    let scope = format!("graph:{i}:{role}:{}", u.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (_, id) = p.decode(&scope, key)?;
    let n = p.limit()?;
    let mut rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {} {READABLE} AND e.id>$3 ORDER BY e.id LIMIT $4",
        projection()
    )))
    .bind(i)
    .bind(&u.user_id)
    .bind(id)
    .bind(n + 1)
    .fetch_all(s.pool()?)
    .await?;
    let more = rows.len() > n as usize;
    rows.truncate(n as usize);
    let cursor = if more {
        Some(pagination::encode(
            &scope,
            chrono::DateTime::UNIX_EPOCH,
            serde_json::from_value(rows.last().unwrap()["id"].clone())
                .map_err(crate::error::invalid)?,
            key,
        ))
    } else {
        None
    };
    Ok(Json(json!({"items":rows,"next_cursor":cursor})))
}
