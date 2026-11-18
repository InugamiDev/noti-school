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
    failures:
        std::sync::Arc<std::sync::Mutex<std::collections::BTreeMap<String, std::time::Instant>>>,
    #[cfg(test)]
    pub(crate) endpoint: Option<String>,
}
impl ProviderHttp {
    pub fn new() -> Result<Self> {
        Ok(Self {
            failures: Default::default(),
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
    pub fn failed(&self, selected: crate::config::EvidenceProvider) -> bool {
        self.failures
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .keys()
            .any(|p| p == "openai" || selected == crate::config::EvidenceProvider::Jev)
    }
    pub fn admit(&self, selected: crate::config::EvidenceProvider) -> Result<()> {
        if self
            .failures
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .any(|(p, at)| {
                (p == "openai" || selected == crate::config::EvidenceProvider::Jev)
                    && at.elapsed() < Duration::from_secs(30)
            })
        {
            return Err(Error("provider_unavailable"));
        }
        Ok(())
    }
    #[cfg(test)]
    pub(crate) fn expire_cooldown(&self) {
        for at in self.failures.lock().unwrap().values_mut() {
            *at = std::time::Instant::now() - Duration::from_secs(31);
        }
    }
    fn observe<T>(&self, provider: &str, result: Result<T>) -> Result<T> {
        let mut failures = self.failures.lock().unwrap_or_else(|e| e.into_inner());
        if result.is_ok() {
            failures.remove(provider);
        } else {
            failures.insert(provider.into(), std::time::Instant::now());
        }
        result
    }
    // A dispatched request may have been billed even when its reply is unusable: settle
    // validated usage without caching the result, otherwise keep an uncertain hold.
    async fn reject(attempt: Attempt, usage: Option<Vec<u64>>, error: Error) -> Error {
        let settled = match usage {
            Some(units) => attempt.settle_rejected(units).await,
            None => Err(Error(error.0)),
        };
        if settled.is_err() {
            // A failed transition leaves the hold 'dispatched', which reconciliation also accepts.
            let _ = attempt.uncertain().await;
        }
        error
    }
    // Local checks that fail before any HTTP is sent are verifiably uncharged: settle at zero
    // instead of parking the hold as uncertain for manual reconciliation.
    async fn unsent(attempt: Attempt, error: Error) -> Error {
        if attempt.settle_unsent().await.is_err() {
            let _ = attempt.uncertain().await;
        }
        error
    }
    pub async fn jev(
        &self,
        key: &str,
        body: &Value,
        ids: &BTreeSet<String>,
        model: &str,
        attempt: Attempt,
    ) -> Result<providers::JevResponse> {
        if !attempt.is_for(OperationKind::Jev)
            || body["model"] != model
            || body["questions"]
                .as_object()
                .is_none_or(|m| m.keys().cloned().collect::<BTreeSet<_>>() != *ids)
            || ids.is_empty()
            || ids.len() > providers::JEV_QUESTIONS
            || serde_json::to_vec(body)
                .map_err(crate::error::invalid)?
                .len()
                > providers::JEV_BODY_LIMIT
        {
            return Err(Self::unsent(attempt, Error("invalid_request")).await);
        }
        let bytes = match self
            .exchange(providers::JEV_URL, key, body, Duration::from_secs(15))
            .await
        {
            Ok(bytes) => bytes,
            Err(e) => return Err(Self::reject(attempt, None, e).await),
        };
        let response = match self.observe("jev", providers::validate_jev(&bytes, ids, model)) {
            Ok(response) => response,
            Err(e) => {
                let usage = providers::validated_jev_usage(&bytes, model);
                return Err(Self::reject(attempt, usage, e).await);
            }
        };
        attempt
            .settle(
                vec![response.usage.input_tokens, response.usage.output_tokens],
                serde_json::to_value(&response).map_err(crate::error::invalid)?,
            )
            .await?;
        Ok(response)
    }
    pub async fn embedding(&self, key: &str, input: &str, attempt: Attempt) -> Result<Vec<f32>> {
        if let Err(e) = crate::input::validate(input) {
            return Err(Self::unsent(attempt, e).await);
        }
        if !attempt.is_for(OperationKind::Embedding) {
            return Err(Self::unsent(attempt, Error("invalid_request")).await);
        }
        let body = serde_json::json!({"model":"text-embedding-3-small","input":input,"dimensions":1536,"encoding_format":"float"});
        let bytes = match self
            .exchange(
                "https://api.openai.com/v1/embeddings",
                key,
                &body,
                Duration::from_secs(30),
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(e) => return Err(Self::reject(attempt, None, e).await),
        };
        let usage = providers::validated_embedding_usage(&bytes);
        let vector = match self.observe("openai", providers::validate_embedding(&bytes)) {
            Ok(vector) => vector,
            Err(e) => return Err(Self::reject(attempt, usage.map(|n| vec![n]), e).await),
        };
        // validate_embedding already enforces the same usage checks.
        let Some(tokens) = usage else {
            return Err(Self::reject(attempt, None, Error("provider_unavailable")).await);
        };
        attempt
            .settle(vec![tokens], serde_json::json!(vector))
            .await?;
        Ok(vector)
    }
    pub async fn embedding_batch(
        &self,
        key: &str,
        inputs: &[String],
        attempt: Attempt,
    ) -> Result<Vec<Vec<f32>>> {
        let body = serde_json::json!({"model":"text-embedding-3-small","input":inputs,"dimensions":1536,"encoding_format":"float"});
        if !attempt.is_for(OperationKind::EmbeddingBatch)
            || inputs.is_empty()
            || inputs.len() > 40
            || inputs.iter().any(|i| crate::input::validate(i).is_err())
            || serde_json::to_vec(&body)
                .map_err(crate::error::invalid)?
                .len()
                > 60_000
        {
            return Err(Self::unsent(attempt, Error("invalid_request")).await);
        }
        let bytes = match self
            .exchange(
                "https://api.openai.com/v1/embeddings",
                key,
                &body,
                Duration::from_secs(30),
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(e) => return Err(Self::reject(attempt, None, e).await),
        };
        let usage = providers::validated_embeddings_usage(&bytes);
        let vectors = match self.observe(
            "openai",
            providers::validate_embeddings(&bytes, inputs.len()),
        ) {
            Ok(vectors) => vectors,
            Err(e) => return Err(Self::reject(attempt, usage.map(|n| vec![n]), e).await),
        };
        let Some(tokens) = usage else {
            return Err(Self::reject(attempt, None, Error("provider_unavailable")).await);
        };
        attempt
            .settle(vec![tokens], serde_json::json!(vectors))
            .await?;
        Ok(vectors)
    }
    pub async fn generate(
        &self,
        key: &str,
        body: &Value,
        model: &str,
        attempt: Attempt,
    ) -> Result<providers::Generated> {
        let allowed = body["input"]
            .as_str()
            .and_then(|input| serde_json::from_str::<Value>(input).ok())
            .and_then(|input| {
                input["evidence"]
                    .as_array()
                    .and_then(|e| crate::rag::ids(e).ok())
            });
        let Some(allowed) = allowed.filter(|_| attempt.is_for(OperationKind::Generation)) else {
            return Err(Self::unsent(attempt, Error("invalid_request")).await);
        };
        let bytes = match self
            .exchange(
                "https://api.openai.com/v1/responses",
                key,
                body,
                Duration::from_secs(45),
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(e) => return Err(Self::reject(attempt, None, e).await),
        };
        let (value, usage) =
            match self.observe("openai", providers::validate_response(&bytes, model)) {
                Ok(valid) => valid,
                Err(e) => {
                    let usage = providers::validated_response_usage(&bytes, model);
                    return Err(Self::reject(attempt, usage, e).await);
                }
            };
        // Content-level rejection (including citing unsent evidence) fails only this request;
        // it is not a provider outage and must not trip the shared cooldown.
        let result = match providers::generated(value).and_then(|result| {
            if result
                .claims
                .iter()
                .any(|c| c.evidence_ids.iter().any(|id| !allowed.contains(id)))
            {
                Err(Error("provider_unavailable"))
            } else {
                Ok(result)
            }
        }) {
            Ok(result) => result,
            Err(e) => return Err(Self::reject(attempt, Some(usage), e).await),
        };
        attempt
            .settle(
                usage,
                serde_json::to_value(&result).map_err(crate::error::invalid)?,
            )
            .await?;
        Ok(result)
    }
    pub async fn structured(
        &self,
        key: &str,
        body: &Value,
        model: &str,
        attempt: Attempt,
        validate: impl FnOnce(Value) -> Result<Value>,
    ) -> Result<Value> {
        if !attempt.is_for(OperationKind::Generation) {
            return Err(Self::unsent(attempt, Error("invalid_request")).await);
        }
        let bytes = match self
            .exchange(
                "https://api.openai.com/v1/responses",
                key,
                body,
                Duration::from_secs(15),
            )
            .await
        {
            Ok(bytes) => bytes,
            Err(e) => return Err(Self::reject(attempt, None, e).await),
        };
        let (value, usage) =
            match self.observe("openai", providers::validate_response(&bytes, model)) {
                Ok(valid) => valid,
                Err(e) => {
                    let usage = providers::validated_response_usage(&bytes, model);
                    return Err(Self::reject(attempt, usage, e).await);
                }
            };
        // rag::validate rejects request-specific content; it is not observed as an outage.
        let value = match validate(value) {
            Ok(value) => value,
            Err(e) => return Err(Self::reject(attempt, Some(usage), e).await),
        };
        attempt.settle(usage, value.clone()).await?;
        Ok(value)
    }
    async fn exchange(
        &self,
        url: &str,
        key: &str,
        body: &Value,
        timeout: Duration,
    ) -> Result<Vec<u8>> {
        let provider = if url.contains("typesafe") {
            "jev"
        } else {
            "openai"
        };
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
        let result = async {
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
        .await;
        // Successful HTTP alone does not clear failures; validated provider output does.
        if result.is_err() {
            self.failures
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(provider.into(), std::time::Instant::now());
        }
        result
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
            "jev-1.13.0",
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
        assert!(
            providers::validate_jev(&bytes, &BTreeSet::from(["support".into()]), "jev-1.13.0")
                .is_ok()
        );
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
