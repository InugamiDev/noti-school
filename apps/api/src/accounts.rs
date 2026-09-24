use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::Page,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DeleteAccount {
    user_id: String,
}
pub async fn delete(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(b): Json<DeleteAccount>,
) -> Result<Json<Value>> {
    auth::internal(&h, s.config.secret.as_deref())?;
    if b.user_id.is_empty() || b.user_id.len() > 256 {
        return Err(Error("invalid_request"));
    }
    let mut tx = s.pool()?.begin().await?;
    sqlx::query("SELECT institution_id FROM product.memberships WHERE user_id=$1 ORDER BY institution_id FOR UPDATE").bind(&b.user_id).fetch_all(&mut *tx).await?;
    sqlx::query("UPDATE product.invitations SET expires_at=least(expires_at,now()) WHERE created_by=$1 OR redeemed_by=$1").bind(&b.user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM product.feedback WHERE user_id=$1")
        .bind(&b.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM product.conversations WHERE user_id=$1")
        .bind(&b.user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(sqlx::AssertSqlSafe(format!("UPDATE product.pipeline_stages p SET result=NULL FROM product.idempotency_keys k WHERE k.operation_id=p.root_operation_id AND k.user_id=$1 AND NOT {recoverable}", recoverable=crate::budget::RECOVERABLE_EMBEDDING))).bind(&b.user_id).execute(&mut *tx).await?;
    sqlx::query("UPDATE product.idempotency_keys SET user_id='deleted:'||operation_id::text,state='failed',response='{}' WHERE user_id=$1").bind(&b.user_id).execute(&mut *tx).await?;
    sqlx::query("DELETE FROM product.memberships WHERE user_id=$1")
        .bind(&b.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(json!({"deleted":true})))
}
pub async fn conversations(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Query(p): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let scope = format!("conversations:{i}:{}", u.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (at, id) = p.decode(&scope, key)?;
    let n = p.limit()?;
    let rows: Vec<Value> = sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'institution_id',c.institution_id,'created_at',c.created_at) FROM product.conversations c JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL WHERE c.institution_id=$1 AND c.user_id=$2 AND c.created_at>now()-interval '30 days' AND (c.created_at,c.id)>($3,$4) ORDER BY c.created_at,c.id LIMIT $5")
        .bind(i).bind(&u.user_id).bind(at).bind(id).bind(n+1).fetch_all(s.pool()?).await?;
    crate::sources::finish_page(rows, n, &scope, key)
}
pub async fn retain(s: &AppState) -> Result<u64> {
    Ok(sqlx::query("DELETE FROM product.conversations WHERE id IN (SELECT id FROM product.conversations WHERE created_at<now()-interval '30 days' ORDER BY created_at LIMIT 100)").execute(s.pool()?).await?.rows_affected())
}
