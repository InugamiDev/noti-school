use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use uuid::Uuid;

#[derive(Debug)]
pub struct Error(pub &'static str);
pub type Result<T> = std::result::Result<T, Error>;
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let (status, message) = match self.0 {
            "invalid_request" => (StatusCode::BAD_REQUEST, "Invalid request"),
            "unauthenticated" => (StatusCode::UNAUTHORIZED, "Sign in required"),
            "forbidden" => (StatusCode::FORBIDDEN, "Request not permitted"),
            "not_found" => (StatusCode::NOT_FOUND, "Not found"),
            "conflict" => (
                StatusCode::CONFLICT,
                "State changed or operation already submitted",
            ),
            "payload_too_large" => (StatusCode::PAYLOAD_TOO_LARGE, "Input exceeds limit"),
            "unsupported_media" => (StatusCode::UNSUPPORTED_MEDIA_TYPE, "Unsupported document"),
            "rate_limited" => (StatusCode::TOO_MANY_REQUESTS, "Request capacity reached"),
            "provider_unavailable" => (StatusCode::SERVICE_UNAVAILABLE, "AI service unavailable"),
            "pricing_unavailable" => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Reviewed pricing unavailable",
            ),
            "budget_exhausted" => (StatusCode::SERVICE_UNAVAILABLE, "AI budget unavailable"),
            "core_unavailable" => (StatusCode::SERVICE_UNAVAILABLE, "Core service unavailable"),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, "Request failed"),
        };
        (status, Json(json!({"error":{"code":self.0,"message":message,
            "request_id":Uuid::new_v4(),"retryable":status == StatusCode::SERVICE_UNAVAILABLE || status == StatusCode::TOO_MANY_REQUESTS}}))).into_response()
    }
}
impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        if e.as_database_error()
            .is_some_and(|d| d.is_unique_violation())
        {
            Self("conflict")
        } else {
            Self("core_unavailable")
        }
    }
}
pub fn invalid<T>(_: T) -> Error {
    Error("invalid_request")
}
