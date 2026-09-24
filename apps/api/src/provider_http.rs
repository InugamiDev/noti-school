use crate::{
    budget::{Attempt, OperationKind},
    error::{Error, Result},
    providers,
};
use serde_json::Value;
use std::{collections::BTreeSet, time::Duration};

#[derive(Clone)]
pub struct ProviderHttp {
    client: reqwest::Client,
    #[cfg(test)]
    pub(crate) endpoint: Option<String>,
}
impl ProviderHttp {
    pub fn new() -> Result<Self> {
        Ok(Self {
            #[cfg(test)]
            endpoint: None,
            client: reqwest::Client::builder()
                .no_proxy()
                .retry(reqwest::retry::never())
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(30))
                .build()
                .map_err(|_| Error("core_unavailable"))?,
        })
    }
    pub async fn jev(
        &self,
        key: &str,
        body: &Value,
        ids: &BTreeSet<String>,
        attempt: Attempt,
    ) -> Result<providers::JevResponse> {
        if !attempt.is_for(OperationKind::Jev)
            || body["model"] != providers::JEV_MODEL
            || body["questions"]
                .as_object()
                .is_none_or(|m| m.keys().cloned().collect::<BTreeSet<_>>() != *ids)
            || ids.is_empty()
            || ids.len() > 32
            || serde_json::to_vec(body)
                .map_err(crate::error::invalid)?
                .len()
                > 30000
        {
            return Err(Error("invalid_request"));
        }
        let bytes = self
            .exchange(providers::JEV_URL, key, body, Duration::from_secs(15))
            .await?;
        let response = providers::validate_jev(&bytes, ids)?;
        attempt
            .settle(
                vec![response.usage.input_tokens, response.usage.output_tokens],
                serde_json::to_value(&response).map_err(crate::error::invalid)?,
            )
            .await?;
        Ok(response)
    }
    pub async fn embedding(&self, key: &str, input: &str, attempt: Attempt) -> Result<Vec<f32>> {
        if !attempt.is_for(OperationKind::Embedding) || input.is_empty() || input.len() > 8000 {
            return Err(Error("invalid_request"));
        }
        let body = serde_json::json!({"model":"text-embedding-3-small","input":input,"dimensions":1536,"encoding_format":"float"});
        let bytes = self
            .exchange(
                "https://api.openai.com/v1/embeddings",
                key,
                &body,
                Duration::from_secs(30),
            )
            .await?;
        let vector = providers::validate_embedding(&bytes)?;
        let response: Value =
            serde_json::from_slice(&bytes).map_err(|_| Error("provider_unavailable"))?;
        attempt
            .settle(
                vec![
                    response["usage"]["total_tokens"]
                        .as_u64()
                        .ok_or(Error("provider_unavailable"))?,
                ],
                serde_json::json!(vector),
            )
            .await?;
        Ok(vector)
    }
    pub async fn generate(
        &self,
        key: &str,
        body: &Value,
        model: &str,
        attempt: Attempt,
    ) -> Result<providers::Generated> {
        if !attempt.is_for(OperationKind::Generation) {
            return Err(Error("invalid_request"));
        }
        let bytes = self
            .exchange(
                "https://api.openai.com/v1/responses",
                key,
                body,
                Duration::from_secs(45),
            )
            .await?;
        let (result, usage) = providers::validate_generation(&bytes, model)?;
        attempt
            .settle(
                usage,
                serde_json::to_value(&result).map_err(crate::error::invalid)?,
            )
            .await?;
        Ok(result)
    }
    async fn exchange(
        &self,
        url: &str,
        key: &str,
        body: &Value,
        timeout: Duration,
    ) -> Result<Vec<u8>> {
        // Tests cannot reach production providers, even if the process inherited real credentials.
        #[cfg(test)]
        let mapped = self
            .endpoint
            .as_ref()
            .map(|base| format!("{base}{}", url::Url::parse(url).unwrap().path()));
        #[cfg(test)]
        let url = mapped.as_deref().unwrap_or(url);
        #[cfg(test)]
        if url::Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .as_deref()
            != Some("127.0.0.1")
        {
            return Err(Error("provider_unavailable"));
        }
        if serde_json::to_vec(body)
            .map_err(crate::error::invalid)?
            .len()
            > 64 * 1024
        {
            return Err(Error("invalid_request"));
        }
        let response = self
            .client
            .post(url)
            .bearer_auth(key)
            .json(body)
            .timeout(timeout)
            .send()
            .await
            .map_err(|_| Error("provider_unavailable"))?;
        if !response.status().is_success() {
            return Err(Error("provider_unavailable"));
        }
        crate::http::limited_body(response, 512 * 1024).await
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Json, Router, routing::post};
    #[tokio::test]
    async fn mocked_jev_http_contract() {
        let app=Router::new().route("/v1/systemone",post(|Json(b):Json<Value>|async move{
            assert_eq!(b["model"],"jev-1.13.0");assert_eq!(b["questions"]["support"]["type"],"noul");
            Json(serde_json::json!({"model":"jev-1.13.0","answers":{"support":{"type":"noul","noul":0.99}},"usage":{"input_tokens":10,"output_tokens":3}}))
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let body = providers::jev_request(
            serde_json::json!({"text":"Synthetic evidence"}),
            std::collections::BTreeMap::from([("support".into(), "Is this supported?".into())]),
        )
        .unwrap();
        let bytes = ProviderHttp::new()
            .unwrap()
            .exchange(
                &format!("http://{address}/v1/systemone"),
                "synthetic-test-key",
                &body,
                Duration::from_secs(1),
            )
            .await
            .unwrap();
        assert!(providers::validate_jev(&bytes, &BTreeSet::from(["support".into()])).is_ok());
        server.abort();
        let _ = server.await;
    }
    #[tokio::test]
    async fn mocked_http_rate_limit_does_not_retry() {
        let hits = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count = hits.clone();
        let app = Router::new().route(
            "/",
            post(move || {
                count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                async { axum::http::StatusCode::TOO_MANY_REQUESTS }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        assert!(
            ProviderHttp::new()
                .unwrap()
                .exchange(
                    &format!("http://{address}/"),
                    "synthetic",
                    &serde_json::json!({}),
                    Duration::from_secs(1)
                )
                .await
                .is_err()
        );
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        server.abort();
        let _ = server.await;
    }
}
