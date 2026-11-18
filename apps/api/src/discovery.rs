// intent: ask-time web discovery inside a 60 s sub-budget of the 140 s work timeout. Search (domain
// restricted, then open), dedupe, skip blocked, fetch <= 6 URLs in one batch, chunk, embed <= 40
// chunks, rank by vector distance and hand <= 8 passages to Jev scoring. Quota, rate limits and
// timeouts end discovery quietly so the answer abstains honestly; paid-provider errors still fail.
// status: done | next: live TinyFish latency and allowance verification | confidence: medium
use crate::{
    AppState,
    error::Result,
    pipeline::{Run, WEB_CURRENT, WebHit, vector_literal},
    tinyfish::WebError,
    web,
};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use std::time::{Duration, Instant};
use uuid::Uuid;

pub const VERSION: &str = "discovery-v1";
pub const SUB_BUDGET: Duration = Duration::from_secs(60);
pub const MAX_FETCH: usize = 6;
pub const MAX_EMBED: usize = 40;
pub const MAX_SCORE: usize = 8;
const EMBED_BATCH_BYTES: usize = 48_000;

// Discovery needs live mode, TinyFish and Jev keys; prices/budget are checked by admission.
pub fn configured(s: &AppState) -> bool {
    s.config.ai_keys().is_ok() && s.config.tinyfish().is_some() && s.config.jev().is_some()
}

pub struct Session {
    key: String,
    fetch_limit: u32,
    search_limit: u32,
    started: Option<Instant>,
    fetched: usize,
    embedded: usize,
    embed_stage: usize,
    searches: usize,
    cached_searches: usize,
    pages: usize,
    notes: BTreeSet<&'static str>,
}
impl Session {
    pub fn new(s: &AppState) -> Option<Self> {
        configured(s).then(|| Self {
            key: s.config.tinyfish().unwrap_or_default().to_owned(),
            fetch_limit: s.config.tinyfish_daily_fetch_limit,
            search_limit: s.config.tinyfish_daily_search_limit,
            started: None,
            fetched: 0,
            embedded: 0,
            embed_stage: 0,
            searches: 0,
            cached_searches: 0,
            pages: 0,
            notes: BTreeSet::new(),
        })
    }
    // The sub-budget starts at the first web action of this ask.
    fn remaining(&mut self) -> Option<Duration> {
        let started = *self.started.get_or_insert_with(Instant::now);
        let left = SUB_BUDGET.checked_sub(started.elapsed())?;
        if left < Duration::from_millis(500) {
            self.notes.insert("timeout");
            return None;
        }
        Some(left)
    }
    fn web_failure(&mut self, e: WebError) {
        self.notes.insert(e.code());
    }
    // True when quota, rate limits, provider failure or time cut discovery short.
    pub fn limited(&self) -> bool {
        !self.notes.is_empty()
    }
    pub fn trace(&self, at: Instant, survivors: usize) -> Value {
        json!({"stage":"discovery","provider":"tinyfish","version":VERSION,"duration_ms":at.elapsed().as_millis() as u64,
            "searches":self.searches,"cached_searches":self.cached_searches,"fetched_urls":self.fetched,"stored_pages":self.pages,
            "embedded_chunks":self.embedded,"output_count":survivors,"limits":self.notes.iter().collect::<Vec<_>>()})
    }

    async fn search(
        &mut self,
        s: &AppState,
        institution: Uuid,
        query: &str,
        domains: &[String],
        language: &str,
    ) -> Result<Vec<String>> {
        let pool = s.pool()?;
        let hash = web::search_hash(query, domains, language);
        if let Some(urls) = web::cached_search(pool, institution, &hash).await? {
            self.cached_searches += 1;
            return Ok(urls);
        }
        if s.web.health() == Some(WebError::Quota) {
            self.notes.insert("quota_exhausted");
            return Ok(vec![]);
        }
        let Some(left) = self.remaining() else {
            return Ok(vec![]);
        };
        if !web::take_usage(pool, "search", 1, self.search_limit).await? {
            self.notes.insert("quota_exhausted");
            return Ok(vec![]);
        }
        self.searches += 1;
        let call = s.web.search(&self.key, query, domains, language);
        match tokio::time::timeout(left.min(Duration::from_secs(10)), call).await {
            Ok(Ok(hits)) => {
                let params = json!({"include_domains":domains,"language":language,"page":1,"query_chars":query.chars().count()});
                web::store_search(pool, institution, &hash, params, &hits).await?;
                Ok(hits.into_iter().map(|h| h.url).collect())
            }
            Ok(Err(e)) => {
                self.web_failure(e);
                Ok(vec![])
            }
            Err(_) => {
                self.notes.insert("timeout");
                Ok(vec![])
            }
        }
    }

    // One TinyFish batch for the given URLs (each with its cached document, if any). Returns the
    // versions whose content is current after the fetch.
    async fn fetch(
        &mut self,
        run: &Run<'_>,
        targets: Vec<(String, Option<web::Doc>)>,
    ) -> Result<Vec<web::Stored>> {
        let s = run.state;
        let pool = s.pool()?;
        let n = targets.len().min(MAX_FETCH.saturating_sub(self.fetched));
        let targets = &targets[..n];
        if targets.is_empty() {
            return Ok(vec![]);
        }
        if s.web.health() == Some(WebError::Quota) {
            self.notes.insert("quota_exhausted");
            return Ok(vec![]);
        }
        let Some(left) = self.remaining() else {
            return Ok(vec![]);
        };
        if !web::take_usage(pool, "fetch", n as i32, self.fetch_limit).await? {
            self.notes.insert("quota_exhausted");
            return Ok(vec![]);
        }
        self.fetched += n;
        let urls: Vec<String> = targets.iter().map(|(u, _)| u.clone()).collect();
        let etag = match targets {
            [(_, Some(doc))] => doc.etag.clone(),
            _ => None,
        };
        let call = s.web.fetch(&self.key, &urls, etag.as_deref());
        let fetched = match tokio::time::timeout(left.min(Duration::from_secs(30)), call).await {
            Ok(Ok(f)) => f,
            Ok(Err(e)) => {
                self.web_failure(e);
                return Ok(vec![]);
            }
            Err(_) => {
                self.notes.insert("timeout");
                return Ok(vec![]);
            }
        };
        let mut stored = Vec::new();
        for (requested, doc) in targets {
            let page = fetched.pages.iter().find(|p| &p.url == requested);
            let usable = match page {
                Some(page) => self.accept(run, requested, doc.as_ref(), page).await?,
                None => None,
            };
            match usable {
                Some(result) => stored.push(result),
                None => {
                    if let Some(doc) = doc {
                        web::mark_failed(pool, run.institution, doc.id).await?;
                    }
                }
            }
        }
        Ok(stored)
    }
    // https final URL on a public host only; not_modified refreshes just the fetch time.
    async fn accept(
        &mut self,
        run: &Run<'_>,
        requested: &str,
        doc: Option<&web::Doc>,
        page: &crate::tinyfish::Page,
    ) -> Result<Option<web::Stored>> {
        let pool = run.state.pool()?;
        let Ok(final_url) = crate::ssrf::web_url(&page.final_url) else {
            return Ok(None);
        };
        let Some(host) = web::host_of(final_url.as_str()) else {
            return Ok(None);
        };
        if crate::ssrf::public_host(&host).await.is_err() {
            return Ok(None);
        }
        if page.not_modified {
            let Some(doc) = doc.filter(|d| d.source_id.is_some()) else {
                return Ok(None);
            };
            web::touch(pool, run.institution, doc.id).await?;
            let version: Option<Uuid> = sqlx::query_scalar(
                "SELECT current_version_id FROM product.sources WHERE institution_id=$1 AND id=$2",
            )
            .bind(run.institution)
            .bind(doc.source_id)
            .fetch_one(pool)
            .await?;
            return Ok(version
                .zip(doc.source_id)
                .map(|(version, source)| web::Stored {
                    doc: doc.id,
                    source,
                    version,
                    changed: false,
                    unembedded: vec![],
                }));
        }
        let stored =
            web::store_page(pool, run.institution, requested, page, &final_url, &host).await?;
        if let Some(stored) = &stored {
            self.pages += 1;
            if stored.changed {
                crate::ontology::enqueue(run.state, run.institution, stored.version, run.user)
                    .await?;
            }
        }
        Ok(stored)
    }

    // Embeds at most MAX_EMBED new chunks per ask, most question-overlapping first, in request
    // bodies kept below the 64 KiB transport cap.
    async fn embed(&mut self, run: &Run<'_>, question: &str, stored: &[web::Stored]) -> Result<()> {
        let terms: BTreeSet<String> = question
            .split(|c: char| !c.is_alphanumeric())
            .filter(|t| t.chars().count() > 1)
            .map(str::to_lowercase)
            .collect();
        let mut chunks: Vec<(usize, usize, Uuid, String)> = stored
            .iter()
            .flat_map(|s| s.unembedded.iter())
            .enumerate()
            .map(|(n, (id, text))| {
                let lower = text.to_lowercase();
                let overlap = terms.iter().filter(|t| lower.contains(t.as_str())).count();
                (overlap, n, *id, text.clone())
            })
            .collect();
        chunks.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        chunks.truncate(MAX_EMBED.saturating_sub(self.embedded));
        let mut batch: Vec<(Uuid, String)> = Vec::new();
        let mut bytes = 0;
        let mut batches = Vec::new();
        for (_, _, id, text) in chunks {
            // Serialized (escaped) size, so quotes and newlines cannot push a body past the cap.
            let size = serde_json::to_string(&text).map_or(text.len() * 6, |t| t.len()) + 1;
            if !batch.is_empty() && bytes + size > EMBED_BATCH_BYTES {
                batches.push(std::mem::take(&mut batch));
                bytes = 0;
            }
            bytes += size;
            batch.push((id, text));
        }
        if !batch.is_empty() {
            batches.push(batch);
        }
        for batch in batches {
            if self.remaining().is_none() {
                break;
            }
            let stage = format!("web_embedding_{}", self.embed_stage);
            self.embed_stage += 1;
            let inputs: Vec<String> = batch.iter().map(|(_, t)| t.clone()).collect();
            let vectors = run.embed_batch(&stage, &inputs).await?;
            for ((id, _), vector) in batch.iter().zip(vectors) {
                sqlx::query("UPDATE product.chunks SET embedding=$3::public.vector,embedding_model='text-embedding-3-small' WHERE institution_id=$1 AND id=$2 AND embedding IS NULL")
                    .bind(run.institution).bind(id).bind(vector_literal(&vector)).execute(run.state.pool()?).await?;
            }
            self.embedded += batch.len();
        }
        Ok(())
    }

    // Re-fetch stale cached pages that retrieval wants to use (shares the fetch/embed budget).
    pub async fn refresh(&mut self, run: &Run<'_>, question: &str, stale: &[WebHit]) -> Result<()> {
        let mut targets: Vec<(String, Option<web::Doc>)> = Vec::new();
        for hit in stale {
            if targets.iter().any(|(u, _)| *u == hit.url) {
                continue;
            }
            if let Some(doc) = web::doc_by_url(run.state.pool()?, run.institution, &hit.url).await?
                && !doc.blocked
            {
                targets.push((hit.url.clone(), Some(doc)));
            }
        }
        let stored = self.fetch(run, targets).await?;
        self.embed(run, question, &stored).await
    }

    // Returns at most MAX_SCORE unscored web passages ranked against the question.
    pub async fn discover(
        &mut self,
        run: &Run<'_>,
        b: &crate::retrieval::Ask,
        space: &web::Space,
        vector: &[f32],
        exclude: &BTreeSet<Uuid>,
    ) -> Result<Vec<Value>> {
        let s = run.state;
        let pool = s.pool()?;
        let mut urls = Vec::new();
        if !space.domains.is_empty() {
            urls.extend(
                self.search(s, run.institution, &b.question, &space.domains, &b.language)
                    .await?,
            );
        }
        let open = if space.personal {
            b.question.clone()
        } else {
            format!("{} {}", b.question, space.name)
        };
        urls.extend(
            self.search(s, run.institution, &open, &[], &b.language)
                .await?,
        );
        let mut seen = BTreeSet::new();
        let mut sources: Vec<Uuid> = Vec::new();
        let mut targets: Vec<(String, Option<web::Doc>)> = Vec::new();
        for raw in urls {
            let Ok(url) = crate::ssrf::web_url(&raw) else {
                continue;
            };
            let url = url.to_string();
            if !seen.insert(url.clone()) || seen.len() > 3 * MAX_FETCH {
                continue;
            }
            match web::doc_by_url(pool, run.institution, &url).await? {
                Some(doc) if doc.blocked => {}
                Some(doc) if doc.fresh => sources.extend(doc.source_id),
                doc => {
                    if targets.len() < MAX_FETCH.saturating_sub(self.fetched) {
                        targets.push((url, doc));
                    }
                }
            }
        }
        let stored = self.fetch(run, targets).await?;
        sources.extend(stored.iter().map(|s| s.source));
        self.embed(run, &b.question, &stored).await?;
        if sources.is_empty() {
            return Ok(vec![]);
        }
        let exclude: Vec<Uuid> = exclude.iter().copied().collect();
        let ranked: Vec<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT c.id {WEB_CURRENT} AND s.id=ANY($3) AND c.id<>ALL($4) AND c.embedding IS NOT NULL ORDER BY c.embedding <=> $5::public.vector,c.id LIMIT {MAX_SCORE}")))
            .bind(run.institution).bind(run.user).bind(&sources).bind(&exclude).bind(vector_literal(vector)).fetch_all(pool).await?;
        Ok(
            crate::pipeline::web_passages(s, run.institution, run.user, &ranked)
                .await?
                .into_iter()
                .map(|(e, _)| e)
                .collect(),
        )
    }
}
