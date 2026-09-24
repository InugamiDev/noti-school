use crate::{
    AppState,
    error::{Error, Result},
};
use axum::http::{HeaderMap, StatusCode};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Session {
    pub user_id: String,
    pub session_id: String,
    pub email_verified: bool,
    pub expires_at: DateTime<Utc>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Capability {
    state: String,
    reason: String,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityCapabilities {
    identity: Capability,
    google: Capability,
    email: Capability,
}
pub async fn capabilities(s: &AppState) -> Result<serde_json::Value> {
    let response = s
        .identity
        .post("http://127.0.0.1:3811/internal/capabilities")
        .bearer_auth(
            s.config
                .secret
                .as_deref()
                .ok_or(Error("core_unavailable"))?,
        )
        .body("")
        .send()
        .await
        .map_err(|_| Error("core_unavailable"))?;
    if response.status() != StatusCode::OK {
        return Err(Error("core_unavailable"));
    }
    let bytes = crate::http::limited_body(response, 4096).await?;
    let caps: IdentityCapabilities =
        serde_json::from_slice(&bytes).map_err(|_| Error("core_unavailable"))?;
    for c in [&caps.identity, &caps.google, &caps.email] {
        if !["available", "disabled", "unavailable"].contains(&c.state.as_str())
            || ![
                "ready",
                "not_configured",
                "paid_calls_disabled",
                "pricing_missing",
                "budget_exhausted",
                "provider_failed",
                "core_failed",
                "no_approved_evidence",
            ]
            .contains(&c.reason.as_str())
            || (c.state == "available") != (c.reason == "ready")
        {
            return Err(Error("core_unavailable"));
        }
    }
    serde_json::to_value(caps).map_err(crate::error::invalid)
}
pub fn csrf(headers: &HeaderMap, origin: &str) -> Result<()> {
    let exact = |key: &str, value: &str| {
        headers.get_all(key).iter().count() == 1 && headers.get(key).is_some_and(|v| v == value)
    };
    if !exact("origin", origin) || !exact("x-noti-csrf", "1") {
        return Err(Error("forbidden"));
    }
    if headers.get_all("sec-fetch-site").iter().count() > 1 {
        return Err(Error("forbidden"));
    }
    if let Some(v) = headers.get("sec-fetch-site")
        && v != "same-origin"
        && v != "none"
    {
        return Err(Error("forbidden"));
    }
    Ok(())
}
pub fn internal(headers: &HeaderMap, secret: Option<&str>) -> Result<()> {
    if headers.get_all("host").iter().count() != 1
        || headers.get("host").is_none_or(|v| v != "127.0.0.1:3810")
    {
        return Err(Error("not_found"));
    }
    let secret = secret.ok_or(Error("core_unavailable"))?;
    let expected = format!("Bearer {secret}");
    let actual = headers
        .get("authorization")
        .map(|v| v.as_bytes())
        .unwrap_or_default();
    if headers.get_all("authorization").iter().count() != 1
        || !bool::from(actual.ct_eq(expected.as_bytes()))
    {
        return Err(Error("not_found"));
    }
    Ok(())
}
pub async fn session(state: &AppState, headers: &HeaderMap) -> Result<Session> {
    let secret = state
        .config
        .secret
        .as_ref()
        .ok_or(Error("core_unavailable"))?;
    state.pool()?;
    let cookie = headers.get("cookie").ok_or(Error("unauthenticated"))?;
    if cookie.as_bytes().len() > 8192 || headers.get_all("cookie").iter().count() != 1 {
        return Err(Error("unauthenticated"));
    }
    let response = state
        .identity
        .post("http://127.0.0.1:3811/internal/session")
        .header("cookie", cookie)
        .bearer_auth(secret)
        .header("cache-control", "no-store")
        .body("")
        .send()
        .await
        .map_err(|_| Error("core_unavailable"))?;
    if response.status() == StatusCode::UNAUTHORIZED {
        return Err(Error("unauthenticated"));
    }
    if response.status() != StatusCode::OK {
        return Err(Error("core_unavailable"));
    }
    let bytes = crate::http::limited_body(response, 16_384).await?;
    let identity: Session =
        serde_json::from_slice(&bytes).map_err(|_| Error("core_unavailable"))?;
    if !identity.email_verified
        || identity.expires_at <= Utc::now()
        || identity.user_id.is_empty()
        || identity.user_id.len() > 512
        || identity.session_id.is_empty()
    {
        return Err(Error("unauthenticated"));
    }
    Ok(identity)
}
pub async fn member(
    state: &AppState,
    headers: &HeaderMap,
    institution: Uuid,
    admin: bool,
) -> Result<Session> {
    let user = session(state, headers).await?;
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM product.memberships WHERE institution_id=$1 AND user_id=$2 AND revoked_at IS NULL")
        .bind(institution).bind(&user.user_id).fetch_optional(state.pool()?).await?;
    match role.as_deref() {
        None => Err(Error("not_found")),
        Some("admin") => Ok(user),
        Some("student") if !admin => Ok(user),
        _ => Err(Error("forbidden")),
    }
}
