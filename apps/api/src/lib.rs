pub mod accounts;
pub mod answers;
pub mod auth;
pub mod budget;
pub mod confidence;
pub mod config;
pub mod discovery;
pub mod error;
pub mod graph;
pub mod http;
pub mod ingestion;
pub mod input;
pub mod institutions;
pub mod invitations;
pub mod ontology;
pub mod pagination;
pub mod pdf;
pub mod personal;
pub mod pipeline;
#[cfg(test)]
#[path = "../../../tests/api/pipeline.rs"]
mod pipeline_tests;
pub mod provider_http;
pub mod providers;
pub mod rag;
pub mod retrieval;
pub mod sources;
pub mod ssrf;
pub mod tinyfish;
pub mod web;
pub mod worker;

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Request, State},
    http::{Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use error::{Error, Result};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{sync::Arc, time::Duration};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<config::Config>,
    pub db: Option<PgPool>,
    pub identity: reqwest::Client,
    pub slots: Arc<tokio::sync::Semaphore>,
    pub static_slots: Arc<tokio::sync::Semaphore>,
    pub identity_probe: Arc<auth::ProbeCache>,
    pub pipeline_slots: Arc<tokio::sync::Semaphore>,
    pub providers: provider_http::ProviderHttp,
    pub web: tinyfish::TinyFish,
    #[cfg(test)]
    pub(crate) pricing_at: Option<chrono::DateTime<chrono::Utc>>,
}
impl AppState {
    pub fn new(config: config::Config) -> Result<Self> {
        let db = config
            .database_url
            .as_ref()
            .map(|url| {
                sqlx::postgres::PgPoolOptions::new()
                    .max_connections(8)
                    .acquire_timeout(Duration::from_secs(2))
                    .connect_lazy(url)
            })
            .transpose()
            .map_err(|_| Error("core_unavailable"))?;
        let identity = reqwest::Client::builder()
            .no_proxy()
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| Error("core_unavailable"))?;
        Ok(Self {
            config: Arc::new(config),
            db,
            identity,
            slots: Arc::new(tokio::sync::Semaphore::new(8)),
            static_slots: Arc::new(tokio::sync::Semaphore::new(16)),
            identity_probe: Arc::new(tokio::sync::Mutex::new(None)),
            pipeline_slots: Arc::new(tokio::sync::Semaphore::new(2)),
            providers: provider_http::ProviderHttp::new()?,
            web: tinyfish::TinyFish::new()?,
            #[cfg(test)]
            pricing_at: None,
        })
    }
    pub fn pool(&self) -> Result<&PgPool> {
        self.db.as_ref().ok_or(Error("core_unavailable"))
    }
}
pub fn router(s: AppState) -> Router {
    Router::new()
        .route(
            "/healthz",
            get(|| async { Json(json!({"status":"ok","contract_version":"1"})) }),
        )
        .route("/readyz", get(ready))
        .route("/api/v1/capabilities", get(capabilities))
        .route("/api/v1/institutions", get(institutions))
        .route("/api/v1/me", get(me))
        .route(
            "/api/v1/me/personal-space",
            post(institutions::personal_space),
        )
        .route(
            "/api/v1/institutions/{institution_id}/domains",
            axum::routing::put(institutions::domains),
        )
        .route(
            "/api/v1/institutions/{institution_id}/web-documents",
            get(web::list),
        )
        .route(
            "/api/v1/institutions/{institution_id}/web-documents/{web_document_id}",
            axum::routing::patch(web::act),
        )
        .route("/internal/invitations/check", post(invitations::check))
        .route("/internal/invitations/redeem", post(invitations::redeem))
        .route("/internal/accounts/delete", post(accounts::delete))
        .route(
            "/api/v1/institutions/{institution_id}/conversations",
            get(accounts::conversations),
        )
        .route(
            "/api/v1/institutions/{institution_id}/graph",
            get(graph::list),
        )
        .route(
            "/api/v1/institutions/{institution_id}/graph/entities",
            post(graph::entity),
        )
        .route(
            "/api/v1/institutions/{institution_id}/graph/edges",
            post(graph::edge),
        )
        .route(
            "/api/v1/institutions/{institution_id}/graph/edges/{edge_id}",
            axum::routing::patch(graph::approve),
        )
        .route(
            "/api/v1/institutions/{institution_id}/sources",
            get(sources::list).post(sources::create),
        )
        .route(
            "/api/v1/institutions/{institution_id}/sources/{source_id}",
            get(sources::detail),
        )
        .route(
            "/api/v1/institutions/{institution_id}/sources/{source_id}/fetch",
            post(ingestion::fetch),
        )
        .route(
            "/api/v1/institutions/{institution_id}/sources/{source_id}/versions",
            get(sources::versions)
                .post(ingestion::upload)
                .layer(DefaultBodyLimit::max(21 * 1024 * 1024)),
        )
        .route(
            "/api/v1/institutions/{institution_id}/versions/{version_id}",
            get(sources::version),
        )
        .route(
            "/api/v1/institutions/{institution_id}/versions/{version_id}/file",
            get(ingestion::download),
        )
        .route(
            "/api/v1/institutions/{institution_id}/versions/{version_id}/chunks",
            get(retrieval::chunks),
        )
        .route(
            "/api/v1/institutions/{institution_id}/versions/{version_id}/actions",
            post(ingestion::action),
        )
        .route(
            "/api/v1/institutions/{institution_id}/jobs/{job_id}",
            get(sources::job),
        )
        .route(
            "/api/v1/institutions/{institution_id}/chunks/{chunk_id}",
            get(retrieval::chunk),
        )
        .route("/api/v1/search", post(retrieval::search))
        .route("/api/v1/answers", post(retrieval::ask))
        .route(
            "/api/v1/institutions/{institution_id}/answers/{answer_id}",
            get(answers::detail),
        )
        .route(
            "/api/v1/institutions/{institution_id}/conversations/{conversation_id}/answers",
            get(answers::list),
        )
        .route(
            "/api/v1/institutions/{institution_id}/citations/{citation_id}",
            get(answers::citation),
        )
        .route(
            "/api/v1/institutions/{institution_id}/conversations/{conversation_id}",
            delete(personal::delete_conversation),
        )
        .route(
            "/api/v1/institutions/{institution_id}/feedback",
            post(personal::feedback).get(personal::feedback_list),
        )
        .route(
            "/api/v1/institutions/{institution_id}/feedback/{feedback_id}",
            axum::routing::patch(personal::feedback_action),
        )
        .route(
            "/api/v1/institutions/{institution_id}/feedback/{feedback_id}/context",
            get(personal::feedback_context),
        )
        .route(
            "/api/v1/institutions/{institution_id}/budget",
            get(personal::budget),
        )
        .fallback(static_file)
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(middleware::from_fn_with_state(s.clone(), boundary))
        .with_state(s)
}
async fn boundary(State(s): State<AppState>, request: Request, next: Next) -> Response {
    let path = request.uri().path().to_owned();
    let path = path.as_str();
    if path == "/internal" || path.starts_with("/internal/") {
        if let Err(e) = auth::internal(request.headers(), s.config.secret.as_deref()) {
            return e.into_response();
        }
    } else if ![Method::GET, Method::HEAD, Method::OPTIONS].contains(request.method())
        && let Err(e) = auth::csrf(request.headers(), &s.config.origin)
    {
        return e.into_response();
    }
    // intent: /healthz is never throttled and static assets use their own slots, so product
    // saturation (or a slow client) cannot make the site or liveness probe unavailable.
    let product = path.starts_with("/api/") || path == "/api" || path.starts_with("/internal");
    let slots = if product || path == "/readyz" {
        &s.slots
    } else {
        &s.static_slots
    };
    let _permit = if path == "/healthz" {
        None
    } else {
        let Ok(permit) = slots.clone().try_acquire_owned() else {
            return Error("rate_limited").into_response();
        };
        Some(permit)
    };
    // A slow request body may hold a slot only for the short read allowance, not the 150s answer
    // allowance. Uploads stream so their handler can reject unauthenticated callers before the body.
    let upload = request.method() == Method::POST
        && path.starts_with("/api/v1/institutions/")
        && path.ends_with("/versions");
    let bodiless = [Method::GET, Method::HEAD, Method::OPTIONS].contains(request.method());
    let request = if bodiless || upload {
        request
    } else {
        let (parts, body) = request.into_parts();
        match tokio::time::timeout(
            Duration::from_secs(10),
            axum::body::to_bytes(body, 64 * 1024),
        )
        .await
        {
            Ok(Ok(bytes)) => Request::from_parts(parts, Body::from(bytes)),
            Ok(Err(_)) => return Error("payload_too_large").into_response(),
            Err(_) => return Error("invalid_request").into_response(),
        }
    };
    let timeout = if path == "/api/v1/answers" { 150 } else { 30 };
    let mut response =
        match tokio::time::timeout(Duration::from_secs(timeout), next.run(request)).await {
            Ok(r) => r,
            Err(_) => return Error("core_unavailable").into_response(),
        };
    if response.status().is_client_error()
        && response
            .headers()
            .get("content-type")
            .is_none_or(|v| v != "application/json")
    {
        response = Error(match response.status() {
            StatusCode::PAYLOAD_TOO_LARGE => "payload_too_large",
            StatusCode::NOT_FOUND | StatusCode::METHOD_NOT_ALLOWED => "not_found",
            _ => "invalid_request",
        })
        .into_response();
    }
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().unwrap());
    response
        .headers_mut()
        .insert("x-content-type-options", "nosniff".parse().unwrap());
    response
}
async fn core_ready(s: &AppState) -> bool {
    let Some(db) = &s.db else { return false };
    if s.config.secret.is_none() || sqlx::query("SELECT 1").execute(db).await.is_err() {
        return false;
    }
    auth::capabilities(s)
        .await
        .is_ok_and(|c| c["identity"]["state"] == "available")
}
async fn ready(State(s): State<AppState>) -> Response {
    let ok = core_ready(&s).await;
    (
        if ok {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        },
        Json(json!({"status":if ok{"degraded"}else{"unavailable"},"contract_version":"1"})),
    )
        .into_response()
}
async fn capabilities(State(s): State<AppState>) -> Json<Value> {
    let fail = json!({"state":"unavailable","reason":"core_failed"});
    let identity = auth::capabilities(&s).await.unwrap_or(
        json!({"identity":fail,"google":fail,"email":fail,"password":fail,"passkey":fail}),
    );
    let mut ai = json!({"state":"disabled","reason":"paid_calls_disabled"});
    if s.config.mode == "live" {
        ai = json!({"state":"unavailable","reason":"not_configured"});
        if let Ok((_, _, _)) = s.config.ai_keys()
            && let Some(db) = &s.db
        {
            let priced = budget::priced(&s).await.unwrap_or(false);
            let available: bool = sqlx::query_scalar("SELECT coalesce((SELECT spent_micro_usd FROM product.ai_months WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0)+coalesce((SELECT sum(reserved_micro_usd) FROM product.ai_months),0)<50000000").fetch_one(db).await.unwrap_or(false);
            ai = if identity["identity"]["state"] != "available" {
                fail.clone()
            } else if !priced {
                json!({"state":"unavailable","reason":"pricing_missing"})
            } else if !available {
                json!({"state":"unavailable","reason":"budget_exhausted"})
            } else if s.providers.failed(s.config.jev_dependency()) {
                json!({"state":"unavailable","reason":"provider_failed"})
            } else {
                json!({"state":"available","reason":"ready"})
            };
        }
    }
    let discovery = discovery_capability(&s, &ai).await;
    Json(
        json!({"mode":s.config.mode,"answers":ai,"indexing":ai,"discovery":discovery,
        "google":identity["google"],"email":identity["email"],"password":identity["password"],
        "passkey":identity["passkey"],"identity":identity["identity"]}),
    )
}
// Discovery needs live mode, TinyFish and Jev keys, Jev prices and budget (via answers) and both the
// provider allowance (402) and this application's daily self-limits.
async fn discovery_capability(s: &AppState, ai: &Value) -> Value {
    if s.config.mode != "live" {
        return json!({"state":"disabled","reason":"paid_calls_disabled"});
    }
    if s.config.tinyfish().is_none() || s.config.jev().is_none() {
        return json!({"state":"disabled","reason":"not_configured"});
    }
    if ai["state"] != "available" {
        return ai.clone();
    }
    let Some(db) = &s.db else {
        return json!({"state":"unavailable","reason":"core_failed"});
    };
    let left = web::usage_left(db, "search", s.config.tinyfish_daily_search_limit).await;
    let fetch = web::usage_left(db, "fetch", s.config.tinyfish_daily_fetch_limit).await;
    match (s.web.health(), left, fetch) {
        (_, Err(_), _) | (_, _, Err(_)) => json!({"state":"unavailable","reason":"core_failed"}),
        (Some(tinyfish::WebError::Quota), _, _) | (_, Ok(false), _) | (_, _, Ok(false)) => {
            json!({"state":"unavailable","reason":"quota_exhausted"})
        }
        (Some(_), _, _) => json!({"state":"unavailable","reason":"provider_failed"}),
        (None, Ok(true), Ok(true)) => json!({"state":"available","reason":"ready"}),
    }
}
async fn me(State(s): State<AppState>, h: axum::http::HeaderMap) -> Result<Json<Value>> {
    let identity = auth::session(&s, &h).await?;
    let memberships:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('institution_id',institution_id,'role',role) FROM product.memberships WHERE user_id=$1 AND revoked_at IS NULL ORDER BY institution_id").bind(&identity.user_id).fetch_all(s.pool()?).await?;
    Ok(Json(json!({"identity":identity,"memberships":memberships})))
}
async fn institutions(
    State(s): State<AppState>,
    axum::extract::Query(p): axum::extract::Query<pagination::Page>,
) -> Result<Json<Value>> {
    let n = p.limit()?;
    let key = s.config.secret.as_deref().unwrap_or("");
    if p.cursor.is_some() && key.is_empty() {
        return Err(Error("invalid_request"));
    }
    let (_, id) = p.decode("institutions", key)?;
    let Some(db) = &s.db else {
        return Ok(Json(json!({"items":[],"next_cursor":null})));
    };
    // Personal spaces are private to their owner and never listed publicly.
    let mut items: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT {} FROM product.institutions i WHERE i.kind='school' AND i.id>$1 ORDER BY i.id LIMIT $2", institutions::INSTITUTION_JSON)))
        .bind(id).bind(n+1).fetch_all(db).await?;
    let more = items.len() > n as usize;
    items.truncate(n as usize);
    let next = if more && !key.is_empty() {
        Some(pagination::encode(
            "institutions",
            chrono::DateTime::UNIX_EPOCH,
            serde_json::from_value(items.last().unwrap()["id"].clone()).map_err(error::invalid)?,
            key,
        ))
    } else {
        None
    };
    Ok(Json(json!({"items":items,"next_cursor":next})))
}
async fn static_file(State(s): State<AppState>, request: Request) -> Result<Response> {
    let path = request.uri().path();
    if path == "/api"
        || path.starts_with("/api/")
        || path == "/internal"
        || path.starts_with("/internal/")
        || ![Method::GET, Method::HEAD].contains(request.method())
        || path.contains(['%', '\\'])
        || path.split('/').any(|v| v.starts_with('.'))
    {
        return Err(Error("not_found"));
    }
    let root = tokio::fs::canonicalize(&s.config.web_dist)
        .await
        .map_err(|_| Error("not_found"))?;
    // Only a configured dist directory can be served, never an arbitrary project/storage root.
    if root.file_name().is_none_or(|n| n != "dist") || !root.join("index.html").is_file() {
        return Err(Error("not_found"));
    }
    let requested = root.join(path.trim_start_matches('/'));
    let selected = if requested.is_file() {
        requested
    } else if !path.rsplit('/').next().unwrap_or("").contains('.') {
        root.join("index.html")
    } else {
        return Err(Error("not_found"));
    };
    let selected = tokio::fs::canonicalize(selected)
        .await
        .map_err(|_| Error("not_found"))?;
    if !selected.starts_with(&root) {
        return Err(Error("not_found"));
    }
    let mime = match selected.extension().and_then(|v| v.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript",
        Some("css") => "text/css",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        _ => return Err(Error("not_found")),
    };
    if tokio::fs::metadata(&selected)
        .await
        .map_err(|_| Error("not_found"))?
        .len()
        > 20 * 1024 * 1024
    {
        return Err(Error("not_found"));
    }
    let bytes = if request.method() == Method::HEAD {
        vec![]
    } else {
        tokio::fs::read(selected)
            .await
            .map_err(|_| Error("not_found"))?
    };
    Ok(([("content-type", mime)], Body::from(bytes)).into_response())
}
