use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::Page,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Feedback {
    answer_id: Uuid,
    category: String,
    evidence_id: Option<Uuid>,
    comment: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FeedbackAction {
    status: String,
}
pub async fn delete_conversation(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<StatusCode> {
    let u = auth::member(&s, &h, i, false).await?;
    let affected=sqlx::query("DELETE FROM product.conversations c USING product.memberships m WHERE c.institution_id=$1 AND c.id=$2 AND c.user_id=$3 AND m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL")
        .bind(i).bind(id).bind(u.user_id).execute(s.pool()?).await?.rows_affected();
    if affected == 0 {
        return Err(Error("not_found"));
    }
    Ok(StatusCode::NO_CONTENT)
}
pub async fn feedback(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Json(b): Json<Feedback>,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::member(&s, &h, i, false).await?;
    if !["unsupported", "incorrect", "outdated", "other"].contains(&b.category.as_str())
        || b.comment.as_ref().is_some_and(|s| s.chars().count() > 2000)
    {
        return Err(Error("invalid_request"));
    }
    let row=sqlx::query_scalar("INSERT INTO product.feedback(id,institution_id,answer_id,user_id,evidence_id,category,comment) SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(SELECT 1 FROM product.answers a JOIN product.conversations c ON c.institution_id=a.institution_id AND c.id=a.conversation_id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL WHERE a.institution_id=$2 AND a.id=$3 AND c.user_id=$4 AND ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM product.citations e WHERE e.institution_id=$2 AND e.answer_id=$3 AND e.id=$5))) RETURNING to_jsonb(feedback)-'user_id'")
        .bind(Uuid::new_v4()).bind(i).bind(b.answer_id).bind(u.user_id).bind(b.evidence_id).bind(b.category).bind(b.comment).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok((StatusCode::CREATED, Json(row)))
}
pub async fn feedback_list(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Query(p): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    let scope = format!("feedback:{i}:{}", u.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (at, id) = p.decode(&scope, key)?;
    let limit = p.limit()?;
    let rows=sqlx::query_scalar("SELECT to_jsonb(f)-'user_id' FROM product.feedback f JOIN product.memberships m ON m.institution_id=f.institution_id AND m.user_id=$2 AND m.role='admin' AND m.revoked_at IS NULL WHERE f.institution_id=$1 AND (f.created_at,f.id)>($3,$4) ORDER BY f.created_at,f.id LIMIT $5")
        .bind(i).bind(u.user_id).bind(at).bind(id).bind(limit+1).fetch_all(s.pool()?).await?;
    crate::sources::finish_page(rows, limit, &scope, key)
}
pub async fn feedback_action(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Json(b): Json<FeedbackAction>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    if !["open", "reviewed", "resolved"].contains(&b.status.as_str()) {
        return Err(Error("invalid_request"));
    }
    let row=sqlx::query_scalar("UPDATE product.feedback f SET status=$4 FROM product.memberships m WHERE f.institution_id=$1 AND f.id=$2 AND m.institution_id=f.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL RETURNING to_jsonb(f)-'user_id'")
        .bind(i).bind(id).bind(u.user_id).bind(b.status).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
pub async fn budget(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    let row:Value=sqlx::query_scalar("SELECT jsonb_build_object('month',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'cap_micro_usd',50000000,'spent_micro_usd',coalesce((SELECT spent_micro_usd FROM product.ai_months WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0),'reserved_micro_usd',coalesce((SELECT sum(reserved_micro_usd) FROM product.ai_months),0),'currency','USD') WHERE EXISTS(SELECT 1 FROM product.memberships WHERE institution_id=$1 AND user_id=$2 AND role='admin' AND revoked_at IS NULL)")
        .bind(i).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
