use crate::{
    AppState, auth,
    error::{Error, Result},
};
use axum::{Json, extract::State, http::HeaderMap};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Check {
    token: String,
    email: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Redeem {
    token: String,
    email: String,
    user_id: String,
    email_verified: bool,
}
fn hashes(token: &str, email: &str, secret: &str) -> Result<(String, String)> {
    if token.is_empty()
        || token.len() > 256
        || email.len() > 254
        || !email.contains('@')
        || email.contains(['\r', '\n'])
    {
        return Err(Error("invalid_request"));
    }
    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(crate::error::invalid)?;
    mac.update(email.trim().to_lowercase().as_bytes());
    Ok((
        format!("{:x}", Sha256::digest(token.as_bytes())),
        format!("{:x}", mac.finalize().into_bytes()),
    ))
}
pub async fn check(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Check>,
) -> Result<Json<Value>> {
    auth::internal(&headers, s.config.secret.as_deref())?;
    let (token, email) = hashes(
        &body.token,
        &body.email,
        s.config.secret.as_deref().unwrap_or_default(),
    )?;
    let valid:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.invitations i JOIN product.memberships m ON m.institution_id=i.institution_id AND m.user_id=i.created_by AND m.role='admin' AND m.revoked_at IS NULL WHERE i.token_hash=$1 AND i.email_hash=$2 AND i.expires_at>now() AND i.redeemed_at IS NULL)")
        .bind(token).bind(email).fetch_one(s.pool()?).await?;
    if !valid {
        return Err(Error("forbidden"));
    }
    Ok(Json(json!({"valid":true})))
}
pub async fn redeem(
    State(s): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Redeem>,
) -> Result<Json<Value>> {
    auth::internal(&headers, s.config.secret.as_deref())?;
    if !body.email_verified || body.user_id.is_empty() || body.user_id.len() > 512 {
        return Err(Error("forbidden"));
    }
    let (token, email) = hashes(
        &body.token,
        &body.email,
        s.config.secret.as_deref().unwrap_or_default(),
    )?;
    let mut tx = s.pool()?.begin().await?;
    let row=sqlx::query("SELECT i.id,i.institution_id,i.role FROM product.invitations i JOIN product.memberships m ON m.institution_id=i.institution_id AND m.user_id=i.created_by AND m.role='admin' AND m.revoked_at IS NULL WHERE i.token_hash=$1 AND i.email_hash=$2 AND i.expires_at>now() AND i.redeemed_at IS NULL FOR UPDATE OF i FOR SHARE OF m")
        .bind(token).bind(email).fetch_optional(&mut *tx).await?.ok_or(Error("forbidden"))?;
    let id: uuid::Uuid = row.try_get("id")?;
    let institution: uuid::Uuid = row.try_get("institution_id")?;
    let role: String = row.try_get("role")?;
    // intent: role originates only from the locked invitation; replay cannot grant membership twice.
    sqlx::query("INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(institution_id,user_id) DO UPDATE SET role=EXCLUDED.role,revoked_at=NULL")
        .bind(institution).bind(&body.user_id).bind(&role).execute(&mut *tx).await?;
    sqlx::query("UPDATE product.invitations SET redeemed_at=now(),redeemed_by=$1 WHERE id=$2 AND institution_id=$3 AND redeemed_at IS NULL")
        .bind(&body.user_id).bind(id).bind(institution).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"institution_id":institution,"role":role})))
}
