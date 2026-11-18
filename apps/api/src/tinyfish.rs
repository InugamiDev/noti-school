// intent: TinyFish Search/Fetch client in the provider_http style: bounded bodies and deadlines, no
// automatic retry, strict required fields while tolerating unknown ones. Fetched text is untrusted
// data and only becomes evidence after SSRF host checks, chunking, embedding and Jev scoring.
// status: done | next: live allowance/latency verification | confidence: medium
use crate::error::{Error, Result};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

pub const SEARCH_URL: &str = "https://api.search.tinyfish.ai";
pub const FETCH_URL: &str = "https://api.fetch.tinyfish.ai";
pub const FETCH_BATCH: usize = 10;
const PAGE_TEXT_LIMIT: usize = 1024 * 1024;

// 402 means the free daily allowance is exhausted; 429 is rate limiting. Neither is retried.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WebError {
    Quota,
    RateLimited,
    Failed,
}
impl WebError {
    pub fn code(self) -> &'static str {
        match self {
            Self::Quota => "quota_exhausted",
            Self::RateLimited => "rate_limited",
            Self::Failed => "provider_unavailable",
        }
    }
}
pub fn status_error(status: u16) -> WebError {
    match status {
        402 => WebError::Quota,
        429 => WebError::RateLimited,
        _ => WebError::Failed,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SearchHit {
    pub position: u64,
    pub site_name: Option<String>,
    pub title: String,
    pub snippet: String,
    pub url: String,
    pub date: Option<String>,
}
impl SearchHit {
    pub fn to_value(&self) -> Value {
        json!({"position":self.position,"site_name":self.site_name,"title":self.title,"snippet":self.snippet,"url":self.url,"date":self.date})
    }
}
#[derive(Clone, Debug, PartialEq)]
pub struct Page {
    pub url: String,
    pub final_url: String,
    pub title: Option<String>,
    pub language: Option<String>,
    pub text: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub not_modified: bool,
}
#[derive(Debug, Default)]
pub struct Fetched {
    pub pages: Vec<Page>,
    pub failed: Vec<String>,
}

fn string(v: &Value, key: &str, max: usize, required: bool) -> Result<Option<String>> {
    match v.get(key) {
        None | Some(Value::Null) if !required => Ok(None),
        Some(Value::String(s)) if s.len() <= max => Ok(Some(s.clone())),
        _ => Err(Error("provider_unavailable")),
    }
}

// Search results are discovery hints, not evidence. Non-https hits are skipped, not trusted.
pub fn validate_search(bytes: &[u8]) -> Result<Vec<SearchHit>> {
    let v = crate::providers::unique_json(bytes).ok_or(Error("provider_unavailable"))?;
    let results = v["results"]
        .as_array()
        .filter(|r| r.len() <= 100)
        .ok_or(Error("provider_unavailable"))?;
    if !v["query"].is_string()
        || v["page"].as_u64().is_none()
        || v["total_results"].as_u64().is_none()
    {
        return Err(Error("provider_unavailable"));
    }
    let mut hits = Vec::new();
    for item in results {
        if !item.is_object() {
            return Err(Error("provider_unavailable"));
        }
        let url = string(item, "url", 2048, true)?.unwrap_or_default();
        let hit = SearchHit {
            position: item["position"]
                .as_u64()
                .ok_or(Error("provider_unavailable"))?,
            site_name: string(item, "site_name", 300, false)?,
            title: string(item, "title", 1000, true)?.unwrap_or_default(),
            snippet: string(item, "snippet", 4000, false)?.unwrap_or_default(),
            date: string(item, "date", 100, false)?,
            url,
        };
        if hit.url.starts_with("https://") {
            hits.push(hit);
        }
    }
    Ok(hits)
}

// Every result must answer one requested URL exactly once; text is mandatory unless not_modified.
pub fn validate_fetch(bytes: &[u8], requested: &[String]) -> Result<Fetched> {
    let v = crate::providers::unique_json(bytes).ok_or(Error("provider_unavailable"))?;
    let results = v["results"]
        .as_array()
        .filter(|r| r.len() <= requested.len())
        .ok_or(Error("provider_unavailable"))?;
    let errors = match v.get("errors") {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(e)) if e.len() <= requested.len() => e.clone(),
        _ => return Err(Error("provider_unavailable")),
    };
    let mut out = Fetched::default();
    let mut seen = std::collections::BTreeSet::new();
    for item in results {
        let url = string(item, "url", 2048, true)?.unwrap_or_default();
        if !requested.contains(&url) || !seen.insert(url.clone()) {
            return Err(Error("provider_unavailable"));
        }
        let not_modified = match item.get("not_modified") {
            None | Some(Value::Null) => false,
            Some(Value::Bool(b)) => *b,
            _ => return Err(Error("provider_unavailable")),
        };
        let text = string(item, "text", PAGE_TEXT_LIMIT * 4, !not_modified)?;
        if text
            .as_ref()
            .is_some_and(|t| t.chars().count() > PAGE_TEXT_LIMIT)
        {
            return Err(Error("provider_unavailable"));
        }
        out.pages.push(Page {
            final_url: string(item, "final_url", 2048, true)?.unwrap_or_default(),
            title: string(item, "title", 1000, false)?,
            language: string(item, "language", 35, false)?,
            etag: string(item, "etag", 512, false)?,
            last_modified: string(item, "last_modified", 128, false)?,
            text,
            not_modified,
            url,
        });
        for key in ["description", "author", "published_date"] {
            string(item, key, 4000, false)?;
        }
    }
    for e in &errors {
        let url = string(e, "url", 2048, true)?.unwrap_or_default();
        string(e, "error", 2000, true)?;
        if e.get("status").is_some_and(|s| !s.is_null() && !s.is_u64())
            || !requested.contains(&url)
            || !seen.insert(url.clone())
        {
            return Err(Error("provider_unavailable"));
        }
        out.failed.push(url);
    }
    Ok(out)
}

#[derive(Default)]
struct Health {
    quota_day: Option<chrono::NaiveDate>,
    failed_at: Option<Instant>,
}
#[derive(Clone)]
pub struct TinyFish {
    client: reqwest::Client,
    health: Arc<Mutex<Health>>,
    #[cfg(test)]
    pub(crate) endpoint: Option<String>,
}
impl TinyFish {
    pub fn new() -> Result<Self> {
        Ok(Self {
            health: Default::default(),
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
    // A 402 lasts until the allowance resets at 00:00 UTC; other failures cool down for 30 s.
    pub fn health(&self) -> Option<WebError> {
        let h = self.health.lock().unwrap_or_else(|e| e.into_inner());
        if h.quota_day == Some(chrono::Utc::now().date_naive()) {
            Some(WebError::Quota)
        } else if h
            .failed_at
            .is_some_and(|at| at.elapsed() < Duration::from_secs(30))
        {
            Some(WebError::Failed)
        } else {
            None
        }
    }
    #[cfg(test)]
    pub(crate) fn reset_health(&self) {
        *self.health.lock().unwrap() = Health::default();
    }
    fn observe<T>(
        &self,
        result: std::result::Result<T, WebError>,
    ) -> std::result::Result<T, WebError> {
        let mut h = self.health.lock().unwrap_or_else(|e| e.into_inner());
        match &result {
            Ok(_) => h.failed_at = None,
            Err(WebError::Quota) => h.quota_day = Some(chrono::Utc::now().date_naive()),
            Err(_) => h.failed_at = Some(Instant::now()),
        }
        result
    }
    fn target(&self, base: &str, test_path: &str) -> std::result::Result<url::Url, WebError> {
        #[cfg(test)]
        if let Some(endpoint) = &self.endpoint {
            return url::Url::parse(&format!("{endpoint}{test_path}"))
                .map_err(|_| WebError::Failed);
        }
        let _ = test_path;
        url::Url::parse(base).map_err(|_| WebError::Failed)
    }
    // Tests can only reach loopback mocks, even if the process inherited a real key.
    fn guard(url: &url::Url) -> std::result::Result<(), WebError> {
        #[cfg(test)]
        if url.host_str() != Some("127.0.0.1") {
            return Err(WebError::Failed);
        }
        let _ = url;
        Ok(())
    }
    pub async fn search(
        &self,
        key: &str,
        query: &str,
        include_domains: &[String],
        language: &str,
    ) -> std::result::Result<Vec<SearchHit>, WebError> {
        let mut url = self.target(SEARCH_URL, "/search")?;
        Self::guard(&url)?;
        if query.trim().is_empty() || query.len() > 2000 || include_domains.len() > 20 {
            return Err(WebError::Failed);
        }
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("query", query);
            if !include_domains.is_empty() {
                pairs.append_pair("include_domains", &include_domains.join(","));
            }
            pairs
                .append_pair("language", language)
                .append_pair("page", "1");
        }
        let result = async {
            let response = self
                .client
                .get(url)
                .header("x-api-key", key)
                .timeout(Duration::from_secs(10))
                .send()
                .await
                .map_err(|_| WebError::Failed)?;
            if !response.status().is_success() {
                return Err(status_error(response.status().as_u16()));
            }
            let bytes = crate::http::limited_body(response, 1024 * 1024)
                .await
                .map_err(|_| WebError::Failed)?;
            validate_search(&bytes).map_err(|_| WebError::Failed)
        }
        .await;
        self.observe(result)
    }
    // ttl=0 always: this application owns the 7-day cache and records its own fetch time.
    pub async fn fetch(
        &self,
        key: &str,
        urls: &[String],
        if_none_match: Option<&str>,
    ) -> std::result::Result<Fetched, WebError> {
        let url = self.target(FETCH_URL, "/fetch")?;
        Self::guard(&url)?;
        if urls.is_empty() || urls.len() > FETCH_BATCH {
            return Err(WebError::Failed);
        }
        let mut body = json!({"urls":urls,"format":"markdown","ttl":0,"per_url_timeout_ms":20000,"include_etag_and_last_modified":true});
        if let (Some(tag), [_]) = (if_none_match, urls) {
            body["if_none_match"] = json!(tag);
        }
        let result = async {
            let response = self
                .client
                .post(url)
                .header("x-api-key", key)
                .json(&body)
                .timeout(Duration::from_secs(30))
                .send()
                .await
                .map_err(|_| WebError::Failed)?;
            if !response.status().is_success() {
                return Err(status_error(response.status().as_u16()));
            }
            let bytes = crate::http::limited_body(response, 8 * 1024 * 1024)
                .await
                .map_err(|_| WebError::Failed)?;
            validate_fetch(&bytes, urls).map_err(|_| WebError::Failed)
        }
        .await;
        self.observe(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Json, Router,
        http::StatusCode,
        routing::{get, post},
    };
    use std::sync::atomic::{AtomicUsize, Ordering};
    fn search_body(results: Value) -> Vec<u8> {
        json!({"query":"synthetic","results":results,"total_results":2,"page":1,"unknown_future_field":true}).to_string().into_bytes()
    }
    #[test]
    fn search_validation_requires_fields_and_skips_non_https() {
        let hits = validate_search(&search_body(json!([
            {"position":1,"site_name":"Example","title":"Synthetic","snippet":"s","url":"https://www.example.edu/a","date":null,"extra":1},
            {"position":2,"title":"Plain","url":"http://www.example.edu/b"}
        ]))).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].url, "https://www.example.edu/a");
        for bad in [
            json!([{"title":"no url","position":1}]),
            json!([{"url":"https://x.example.edu","position":1}]),
            json!([{"url":"https://x.example.edu","title":"t"}]),
            json!([{"url":7,"title":"t","position":1}]),
            json!([{"url":format!("https://x.example.edu/{}", "a".repeat(2100)),"title":"t","position":1}]),
            json!("not an array"),
        ] {
            assert!(validate_search(&search_body(bad.clone())).is_err(), "{bad}");
        }
        assert!(validate_search(br#"{"results":[],"page":1}"#).is_err());
        assert!(
            validate_search(
                br#"{"query":"q","query":"r","results":[],"total_results":0,"page":1}"#
            )
            .is_err()
        );
    }
    #[test]
    fn fetch_validation_matches_requested_urls_exactly() {
        let requested = vec![
            "https://www.example.edu/a".to_owned(),
            "https://www.example.edu/b".to_owned(),
        ];
        let ok = json!({"results":[{"url":requested[0],"final_url":"https://www.example.edu/a2","title":null,"description":"d","language":"vi","author":null,"published_date":null,"text":"# Synthetic\nbody","etag":"\"v1\"","last_modified":"Tue, 17 Nov 2026 00:00:00 GMT","new_field":[1]}],"errors":[{"url":requested[1],"error":"timeout","status":504}]});
        let fetched = validate_fetch(ok.to_string().as_bytes(), &requested).unwrap();
        assert_eq!(fetched.pages[0].etag.as_deref(), Some("\"v1\""));
        assert_eq!(fetched.failed, vec![requested[1].clone()]);
        let not_modified =
            json!({"results":[{"url":requested[0],"final_url":requested[0],"not_modified":true}]});
        assert!(
            validate_fetch(not_modified.to_string().as_bytes(), &requested)
                .unwrap()
                .pages[0]
                .not_modified
        );
        for bad in [
            json!({"results":[{"url":"https://other.example.edu/","final_url":"https://other.example.edu/","text":"x"}]}),
            json!({"results":[{"url":requested[0],"final_url":requested[0],"text":"x"},{"url":requested[0],"final_url":requested[0],"text":"y"}]}),
            json!({"results":[{"url":requested[0],"final_url":requested[0]}]}),
            json!({"results":[{"url":requested[0],"text":"x"}]}),
            json!({"results":[{"url":requested[0],"final_url":requested[0],"text":"x","not_modified":"yes"}]}),
            json!({"results":[{"url":requested[0],"final_url":requested[0],"text":"x"}],"errors":[{"url":requested[0],"error":"dup"}]}),
            json!({"results":{}}),
        ] {
            assert!(
                validate_fetch(bad.to_string().as_bytes(), &requested).is_err(),
                "{bad}"
            );
        }
    }
    #[tokio::test]
    async fn quota_and_rate_limit_map_without_retry() {
        let hits = Arc::new(AtomicUsize::new(0));
        let status = Arc::new(AtomicUsize::new(402));
        let (h1, s1, h2, s2) = (hits.clone(), status.clone(), hits.clone(), status.clone());
        let app = Router::new()
            .route(
                "/search",
                get(move || {
                    h1.fetch_add(1, Ordering::SeqCst);
                    let code = s1.load(Ordering::SeqCst) as u16;
                    async move { (StatusCode::from_u16(code).unwrap(), Json(json!({}))) }
                }),
            )
            .route(
                "/fetch",
                post(move |Json(b): Json<Value>| {
                    h2.fetch_add(1, Ordering::SeqCst);
                    let code = s2.load(Ordering::SeqCst) as u16;
                    async move {
                        assert_eq!(b["ttl"], 0);
                        assert_eq!(b["format"], "markdown");
                        assert_eq!(b["per_url_timeout_ms"], 20000);
                        assert_eq!(b["if_none_match"], "\"tag\"");
                        (StatusCode::from_u16(code).unwrap(), Json(json!({})))
                    }
                }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let mut client = TinyFish::new().unwrap();
        client.endpoint = Some(endpoint);
        assert_eq!(
            client.search("synthetic-key", "q", &[], "en").await,
            Err(WebError::Quota)
        );
        assert_eq!(client.health(), Some(WebError::Quota));
        client.reset_health();
        status.store(429, Ordering::SeqCst);
        let urls = vec!["https://www.example.edu/a".to_owned()];
        assert_eq!(
            client
                .fetch("synthetic-key", &urls, Some("\"tag\""))
                .await
                .unwrap_err(),
            WebError::RateLimited
        );
        assert_eq!(client.health(), Some(WebError::Failed));
        assert_eq!(hits.load(Ordering::SeqCst), 2, "no automatic retry");
        assert_eq!(status_error(500), WebError::Failed);
        assert_eq!(WebError::Quota.code(), "quota_exhausted");
        let real = TinyFish::new().unwrap();
        assert_eq!(
            real.search("k", "q", &[], "en").await,
            Err(WebError::Failed),
            "tests never reach TinyFish"
        );
        server.abort();
        let _ = server.await;
    }
}
