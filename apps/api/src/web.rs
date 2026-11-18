// intent: per-institution web cache (TinyFish pages/searches), domain trust and the admin web-documents
// endpoints. No page, search or score crosses tenants; every query is scoped by institution_id.
// status: done | next: live TinyFish verification, cache retention sweeps for searches only
// confidence: medium
use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::Page,
    tinyfish,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

pub const CACHE_DAYS: i64 = 7;
pub const PAGE_CHUNKS: usize = 128;

// IDNA (UTS 46) to lowercase ASCII, then the same shape the migration's valid_domains() accepts.
pub fn normalize_domain(raw: &str) -> Result<String> {
    let raw = raw.trim().trim_end_matches('.');
    if raw.is_empty()
        || raw.len() > 253
        || raw.contains(['/', ':', '@', '?', '#', '[', ']', '\\', '%'])
        || raw.chars().any(char::is_whitespace)
    {
        return Err(Error("invalid_request"));
    }
    let host = match url::Host::parse(raw).map_err(crate::error::invalid)? {
        url::Host::Domain(d) => d.trim_end_matches('.').to_owned(),
        _ => return Err(Error("invalid_request")),
    };
    let labels: Vec<&str> = host.split('.').collect();
    if host.len() < 3
        || host.len() > 253
        || labels.len() < 2
        || host.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        || labels.iter().any(|l| {
            l.is_empty()
                || l.len() > 63
                || l.starts_with('-')
                || l.ends_with('-')
                || !l
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
    {
        return Err(Error("invalid_request"));
    }
    Ok(host)
}
pub fn normalize_domains(raw: &[String]) -> Result<Vec<String>> {
    let mut out: Vec<String> = Vec::new();
    for d in raw {
        let d = normalize_domain(d)?;
        if !out.contains(&d) {
            out.push(d);
        }
    }
    if out.is_empty() || out.len() > 20 {
        return Err(Error("invalid_request"));
    }
    Ok(out)
}
// Host of an https URL after the url crate's IDNA/lowercase normalization.
pub fn host_of(raw: &str) -> Option<String> {
    let u = url::Url::parse(raw).ok()?;
    match u.host()? {
        url::Host::Domain(d) => Some(d.trim_end_matches('.').to_ascii_lowercase()),
        _ => None,
    }
}
// Equal, or a dot-separated subdomain: never a suffix that merely shares characters.
pub fn host_matches(host: &str, domain: &str) -> bool {
    let (Ok(host), Ok(domain)) = (normalize_domain(host), normalize_domain(domain)) else {
        return false;
    };
    host == domain
        || host
            .strip_suffix(domain.as_str())
            .is_some_and(|prefix| prefix.ends_with('.') && prefix.len() > 1)
}
pub fn trusted(host: &str, domains: &[String]) -> bool {
    domains.iter().any(|d| host_matches(host, d))
}
// A page fetched at `fetched_at` is reused strictly before fetched_at + 7 days.
pub fn is_fresh(fetched_at: DateTime<Utc>, now: DateTime<Utc>) -> bool {
    now < fetched_at + chrono::Duration::days(CACHE_DAYS)
}

// Markdown headings become section locators (page stays null); bodies reuse the 2000-scalar chunker.
pub fn markdown_chunks(text: &str) -> Vec<(String, String)> {
    let clean: String = text
        .chars()
        .map(|c| {
            if c.is_control() && !['\n', '\r', '\t'].contains(&c) {
                ' '
            } else {
                c
            }
        })
        .collect();
    let mut sections: Vec<(String, String)> = vec![("Text".into(), String::new())];
    for line in clean.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let hashes = trimmed.bytes().take_while(|b| *b == b'#').count();
        let heading = trimmed[hashes..].trim();
        if (1..=6).contains(&hashes)
            && trimmed[hashes..].starts_with([' ', '\t'])
            && !heading.is_empty()
        {
            let title: String = heading
                .trim_end_matches('#')
                .trim()
                .chars()
                .take(500)
                .collect();
            sections.push((
                if title.is_empty() {
                    "Text".into()
                } else {
                    title
                },
                String::new(),
            ));
        }
        if let Some(last) = sections.last_mut() {
            last.1.push_str(line);
        }
    }
    let mut chunks = Vec::new();
    for (section, body) in sections {
        let Ok(parts) = crate::ingestion::text_chunks(body.as_bytes()) else {
            continue;
        };
        for part in parts {
            if !part.trim().is_empty() && chunks.len() < PAGE_CHUNKS {
                chunks.push((section.clone(), part));
            }
        }
    }
    chunks
}
fn page_language(raw: Option<&str>) -> Option<&'static str> {
    match raw?.split(['-', '_']).next()?.to_ascii_lowercase().as_str() {
        "en" => Some("en"),
        "vi" => Some("vi"),
        _ => None,
    }
}

pub struct Space {
    pub id: Uuid,
    pub name: String,
    pub personal: bool,
    pub domains: Vec<String>,
}
pub async fn space(pool: &sqlx::PgPool, id: Uuid) -> Result<Space> {
    let row = sqlx::query("SELECT name,kind,domains FROM product.institutions WHERE id=$1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or(Error("not_found"))?;
    Ok(Space {
        id,
        name: row.try_get("name")?,
        personal: row.try_get::<String, _>("kind")? == "personal",
        domains: row.try_get("domains")?,
    })
}

// Atomically counts `n` calls against today's UTC self-limit; false means the limit is reached.
pub async fn take_usage(pool: &sqlx::PgPool, kind: &str, n: i32, limit: u32) -> Result<bool> {
    let limit = i32::try_from(limit).map_err(crate::error::invalid)?;
    if n <= 0 || n > limit {
        return Ok(false);
    }
    let used: Option<i32> = sqlx::query_scalar("INSERT INTO product.web_usage(day,kind,used) VALUES((clock_timestamp() AT TIME ZONE 'UTC')::date,$1,$2) ON CONFLICT(day,kind) DO UPDATE SET used=web_usage.used+EXCLUDED.used WHERE web_usage.used+EXCLUDED.used<=$3 RETURNING used")
        .bind(kind).bind(n).bind(limit).fetch_optional(pool).await?;
    Ok(used.is_some())
}
pub async fn usage_left(pool: &sqlx::PgPool, kind: &str, limit: u32) -> Result<bool> {
    let used: i32 = sqlx::query_scalar("SELECT coalesce((SELECT used FROM product.web_usage WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date AND kind=$1),0)")
        .bind(kind).fetch_one(pool).await?;
    Ok(i64::from(used) < i64::from(limit))
}

pub fn search_hash(query: &str, include_domains: &[String], language: &str) -> String {
    let normalized = query
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    let mut domains = include_domains.to_vec();
    domains.sort();
    format!(
        "{:x}",
        Sha256::digest(
            json!({"v":1,"query":normalized,"include_domains":domains,"language":language,"page":1})
                .to_string()
        )
    )
}
pub async fn cached_search(
    pool: &sqlx::PgPool,
    institution: Uuid,
    hash: &str,
) -> Result<Option<Vec<String>>> {
    let results: Option<Value> = sqlx::query_scalar("SELECT results FROM product.web_searches WHERE institution_id=$1 AND query_sha256=$2 AND fetched_at>clock_timestamp()-interval '7 days'")
        .bind(institution).bind(hash).fetch_optional(pool).await?;
    Ok(results.map(|r| {
        r.as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|h| h["url"].as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default()
    }))
}
pub async fn store_search(
    pool: &sqlx::PgPool,
    institution: Uuid,
    hash: &str,
    params: Value,
    hits: &[tinyfish::SearchHit],
) -> Result<()> {
    let results: Vec<Value> = hits.iter().take(100).map(|h| h.to_value()).collect();
    sqlx::query("INSERT INTO product.web_searches(id,institution_id,query_sha256,params,results,fetched_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()) ON CONFLICT(institution_id,query_sha256) DO UPDATE SET params=EXCLUDED.params,results=EXCLUDED.results,fetched_at=EXCLUDED.fetched_at")
        .bind(Uuid::new_v4()).bind(institution).bind(hash).bind(params).bind(json!(results)).execute(pool).await?;
    Ok(())
}

#[derive(Clone, Debug)]
pub struct Doc {
    pub id: Uuid,
    pub url: String,
    pub source_id: Option<Uuid>,
    pub etag: Option<String>,
    pub fresh: bool,
    pub blocked: bool,
}
const DOC_COLUMNS: &str =
    "id,url,source_id,etag,blocked,(state='fresh' AND stale_after>clock_timestamp()) AS fresh";
fn doc(row: &sqlx::postgres::PgRow) -> Result<Doc> {
    Ok(Doc {
        id: row.try_get("id")?,
        url: row.try_get("url")?,
        source_id: row.try_get("source_id")?,
        etag: row.try_get("etag")?,
        fresh: row.try_get("fresh")?,
        blocked: row.try_get("blocked")?,
    })
}
// A URL is known when it was requested or redirected to; any blocked match wins.
pub async fn doc_by_url(pool: &sqlx::PgPool, institution: Uuid, url: &str) -> Result<Option<Doc>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT {DOC_COLUMNS} FROM product.web_documents WHERE institution_id=$1 AND (url=$2 OR final_url=$2) ORDER BY blocked DESC,(url=$2) DESC,created_at LIMIT 1")))
        .bind(institution).bind(url).fetch_optional(pool).await?;
    row.as_ref().map(doc).transpose()
}
pub async fn doc_by_source(
    pool: &sqlx::PgPool,
    institution: Uuid,
    source: Uuid,
) -> Result<Option<Doc>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {DOC_COLUMNS} FROM product.web_documents WHERE institution_id=$1 AND source_id=$2"
    )))
    .bind(institution)
    .bind(source)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(doc).transpose()
}
// not_modified only refreshes the fetch time; content, version and ETag stay as they were.
pub async fn touch(pool: &sqlx::PgPool, institution: Uuid, id: Uuid) -> Result<()> {
    sqlx::query("UPDATE product.web_documents SET fetched_at=now(),stale_after=now()+interval '7 days',state='fresh' WHERE institution_id=$1 AND id=$2 AND NOT blocked")
        .bind(institution).bind(id).execute(pool).await?;
    Ok(())
}
pub async fn mark_failed(pool: &sqlx::PgPool, institution: Uuid, id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE product.web_documents SET state='failed' WHERE institution_id=$1 AND id=$2",
    )
    .bind(institution)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub struct Stored {
    pub doc: Uuid,
    pub source: Uuid,
    pub version: Uuid,
    pub changed: bool,
    pub unembedded: Vec<(Uuid, String)>,
}
// intent: one transaction per page. Unchanged content (same sha256) only refreshes the fetch time;
// changed content becomes a new draft version whose identical chunks reuse earlier embeddings.
pub async fn store_page(
    pool: &sqlx::PgPool,
    institution: Uuid,
    requested: &str,
    page: &tinyfish::Page,
    final_url: &url::Url,
    host: &str,
) -> Result<Option<Stored>> {
    let text = page.text.as_deref().unwrap_or_default();
    let chunks = markdown_chunks(text);
    if chunks.is_empty() {
        return Ok(None);
    }
    let sha = format!("{:x}", Sha256::digest(text.as_bytes()));
    let language = page_language(page.language.as_deref()).unwrap_or("en");
    let title: String = page
        .title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .unwrap_or(host)
        .chars()
        .take(300)
        .collect();
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,718443907))")
        .bind(format!("{institution}:{requested}"))
        .execute(&mut *tx)
        .await?;
    let existing = sqlx::query("SELECT id,source_id,sha256,blocked FROM product.web_documents WHERE institution_id=$1 AND url=$2 FOR UPDATE")
        .bind(institution).bind(requested).fetch_optional(&mut *tx).await?;
    if existing
        .as_ref()
        .is_some_and(|r| r.try_get::<bool, _>("blocked").unwrap_or(true))
    {
        return Ok(None);
    }
    let prior_source: Option<Uuid> = existing
        .as_ref()
        .map(|r| r.try_get("source_id"))
        .transpose()?
        .flatten();
    if let Some(row) = &existing
        && row.try_get::<String, _>("sha256")? == sha
        && let Some(source) = prior_source
    {
        let version: Uuid = sqlx::query_scalar(
            "SELECT current_version_id FROM product.sources WHERE institution_id=$1 AND id=$2",
        )
        .bind(institution)
        .bind(source)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("UPDATE product.web_documents SET final_url=$3,domain=$4,fetched_at=now(),stale_after=now()+interval '7 days',state='fresh',etag=$5,last_modified=$6 WHERE institution_id=$1 AND id=$2")
            .bind(institution).bind(row.try_get::<Uuid, _>("id")?).bind(final_url.as_str()).bind(host).bind(&page.etag).bind(&page.last_modified).execute(&mut *tx).await?;
        tx.commit().await?;
        return Ok(Some(Stored {
            doc: row.try_get("id")?,
            source,
            version,
            changed: false,
            unembedded: vec![],
        }));
    }
    let source = match prior_source {
        Some(source) => source,
        None => {
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO product.sources(id,institution_id,title,kind,original_url,visibility,origin) VALUES($1,$2,$3,'url',$4,'institution','web')")
                .bind(id).bind(institution).bind(&title).bind(final_url.as_str()).execute(&mut *tx).await?;
            id
        }
    };
    let previous: Option<Uuid> = sqlx::query_scalar("SELECT current_version_id FROM product.sources WHERE institution_id=$1 AND id=$2 FOR UPDATE")
        .bind(institution).bind(source).fetch_one(&mut *tx).await?;
    // Content that reverts to an earlier capture reuses that version (sha256 is unique per source).
    let reverted: Option<Uuid> = sqlx::query_scalar("SELECT id FROM product.source_versions WHERE institution_id=$1 AND source_id=$2 AND sha256=$3")
        .bind(institution).bind(source).bind(&sha).fetch_optional(&mut *tx).await?;
    let version = reverted.unwrap_or_else(Uuid::new_v4);
    if reverted.is_some() {
        sqlx::query(
            "UPDATE product.source_versions SET status='draft' WHERE institution_id=$1 AND id=$2",
        )
        .bind(institution)
        .bind(version)
        .execute(&mut *tx)
        .await?;
    } else {
        let label = format!("Web capture {}", Utc::now().format("%Y-%m-%d %H:%M UTC"));
        sqlx::query("INSERT INTO product.source_versions(id,institution_id,source_id,label,sha256,storage_key,status,indexing,language) VALUES($1,$2,$3,$4,$5,$6,'draft','ready',$7)")
            .bind(version).bind(institution).bind(source).bind(label).bind(&sha).bind(format!("web:{version}")).bind(language).execute(&mut *tx).await?;
        for (ordinal, (section, content)) in chunks.iter().enumerate() {
            sqlx::query("INSERT INTO product.chunks(id,institution_id,source_id,version_id,ordinal,content,language,page,section,start_char,end_char) VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,0,$9)")
                .bind(Uuid::new_v4()).bind(institution).bind(source).bind(version).bind(ordinal as i32).bind(content).bind(language).bind(section).bind(content.chars().count() as i32).execute(&mut *tx).await?;
        }
        if let Some(previous) = previous {
            sqlx::query("UPDATE product.chunks n SET embedding=o.embedding,embedding_model=o.embedding_model FROM product.chunks o WHERE n.institution_id=$1 AND n.version_id=$2 AND o.institution_id=$1 AND o.version_id=$3 AND o.content=n.content AND o.embedding IS NOT NULL AND n.embedding IS NULL")
                .bind(institution).bind(version).bind(previous).execute(&mut *tx).await?;
        }
    }
    if let Some(previous) = previous.filter(|p| *p != version) {
        sqlx::query("UPDATE product.source_versions SET status='archived' WHERE institution_id=$1 AND id=$2")
            .bind(institution).bind(previous).execute(&mut *tx).await?;
    }
    sqlx::query("UPDATE product.sources SET current_version_id=$3,title=$4,original_url=$5 WHERE institution_id=$1 AND id=$2")
        .bind(institution).bind(source).bind(version).bind(&title).bind(final_url.as_str()).execute(&mut *tx).await?;
    let doc: Uuid = sqlx::query_scalar("INSERT INTO product.web_documents(id,institution_id,url,final_url,domain,title,language,fetched_at,stale_after,sha256,etag,last_modified,state,source_id) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now()+interval '7 days',$8,$9,$10,'fresh',$11) ON CONFLICT(institution_id,url) DO UPDATE SET final_url=EXCLUDED.final_url,domain=EXCLUDED.domain,title=EXCLUDED.title,language=EXCLUDED.language,fetched_at=EXCLUDED.fetched_at,stale_after=EXCLUDED.stale_after,sha256=EXCLUDED.sha256,etag=EXCLUDED.etag,last_modified=EXCLUDED.last_modified,state='fresh',source_id=EXCLUDED.source_id RETURNING id")
        .bind(Uuid::new_v4()).bind(institution).bind(requested).bind(final_url.as_str()).bind(host).bind(&title).bind(page_language(page.language.as_deref())).bind(&sha).bind(&page.etag).bind(&page.last_modified).bind(source).fetch_one(&mut *tx).await?;
    let unembedded: Vec<(Uuid, String)> = sqlx::query_as("SELECT id,content FROM product.chunks WHERE institution_id=$1 AND version_id=$2 AND embedding IS NULL ORDER BY ordinal")
        .bind(institution).bind(version).fetch_all(&mut *tx).await?;
    tx.commit().await?;
    Ok(Some(Stored {
        doc,
        source,
        version,
        changed: true,
        unembedded,
    }))
}

// Wire WebDocument. source_id is the promoted (approved-flow) source, not the internal web capture.
pub(crate) const DOC_JSON: &str = "jsonb_build_object('id',w.id,'institution_id',w.institution_id,'url',w.url,'final_url',w.final_url,'domain',w.domain,'title',w.title,'language',w.language,'fetched_at',w.fetched_at,'stale_after',w.stale_after,'sha256',w.sha256,'state',CASE WHEN w.state='failed' THEN 'failed' WHEN w.state='stale' OR w.stale_after<=clock_timestamp() THEN 'stale' ELSE 'fresh' END,'source_id',w.promoted_source_id,'confidence',(SELECT jsonb_build_object('overall',e.overall::float8,'school',e.school::float8,'source',e.source::float8,'relevance',e.relevance::float8,'answers',e.answers::float8,'model',e.model) FROM product.evidence_scores e JOIN product.chunks c ON c.institution_id=e.institution_id AND c.id=e.chunk_id JOIN product.sources s ON s.institution_id=c.institution_id AND s.id=c.source_id AND s.current_version_id=c.version_id WHERE s.institution_id=w.institution_id AND s.id=w.source_id ORDER BY e.overall DESC,e.created_at DESC,e.id LIMIT 1))";

// Blocked pages are excluded from the admin cache view as well as from retrieval and discovery.
pub async fn list(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Query(p): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    let scope = format!("web-documents:{i}:{}", u.user_id);
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let (at, id) = p.decode(&scope, key)?;
    let limit = p.limit()?;
    let rows: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT {DOC_JSON}||jsonb_build_object('created_at',w.created_at) FROM product.web_documents w JOIN product.memberships m ON m.institution_id=w.institution_id AND m.user_id=$2 AND m.role='admin' AND m.revoked_at IS NULL WHERE w.institution_id=$1 AND NOT w.blocked AND (w.created_at,w.id)>($3,$4) ORDER BY w.created_at,w.id LIMIT $5")))
        .bind(i).bind(&u.user_id).bind(at).bind(id).bind(limit + 1).fetch_all(s.pool()?).await?;
    let mut page = crate::sources::finish_page(rows, limit, &scope, key)?;
    for item in page.0["items"].as_array_mut().into_iter().flatten() {
        if let Some(o) = item.as_object_mut() {
            o.remove("created_at");
        }
    }
    Ok(page)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    action: String,
}
async fn get(s: &AppState, i: Uuid, id: Uuid) -> Result<Value> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {DOC_JSON} FROM product.web_documents w WHERE w.institution_id=$1 AND w.id=$2"
    )))
    .bind(i)
    .bind(id)
    .fetch_optional(s.pool()?)
    .await?
    .ok_or(Error("not_found"))
}
// promote: a normal source + pending_review version through the usual ingestion/approval flow.
// refresh: forces the next use to re-fetch (no paid call in this request). block: never used again.
pub async fn act(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Json(b): Json<Action>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    let admin = "EXISTS(SELECT 1 FROM product.memberships m WHERE m.institution_id=$1 AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL)";
    match b.action.as_str() {
        "block" => {
            let n = sqlx::query(sqlx::AssertSqlSafe(format!("UPDATE product.web_documents SET blocked=true,blocked_by=coalesce(blocked_by,$3),blocked_at=coalesce(blocked_at,now()) WHERE institution_id=$1 AND id=$2 AND {admin}")))
                .bind(i).bind(id).bind(&u.user_id).execute(s.pool()?).await?.rows_affected();
            if n != 1 {
                return Err(Error("not_found"));
            }
        }
        "refresh" => {
            let n = sqlx::query(sqlx::AssertSqlSafe(format!("UPDATE product.web_documents SET state='stale' WHERE institution_id=$1 AND id=$2 AND NOT blocked AND {admin}")))
                .bind(i).bind(id).bind(&u.user_id).execute(s.pool()?).await?.rows_affected();
            if n != 1 {
                return Err(Error("not_found"));
            }
        }
        "promote" => promote(&s, i, id, &u.user_id).await?,
        _ => return Err(Error("invalid_request")),
    }
    Ok(Json(get(&s, i, id).await?))
}
async fn promote(s: &AppState, i: Uuid, id: Uuid, user: &str) -> Result<()> {
    let mut tx = s.pool()?.begin().await?;
    let row = sqlx::query("SELECT w.final_url,w.title,w.blocked,w.promoted_source_id,v.language,(SELECT string_agg(c.content,'' ORDER BY c.ordinal) FROM product.chunks c WHERE c.institution_id=v.institution_id AND c.version_id=v.id) AS text FROM product.web_documents w JOIN product.sources s ON s.institution_id=w.institution_id AND s.id=w.source_id JOIN product.source_versions v ON v.institution_id=s.institution_id AND v.id=s.current_version_id JOIN product.memberships m ON m.institution_id=w.institution_id AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL WHERE w.institution_id=$1 AND w.id=$2 FOR UPDATE OF w FOR SHARE OF m")
        .bind(i).bind(id).bind(user).fetch_optional(&mut *tx).await?.ok_or(Error("not_found"))?;
    if row
        .try_get::<Option<Uuid>, _>("promoted_source_id")?
        .is_some()
    {
        return Ok(());
    }
    let text: Option<String> = row.try_get("text")?;
    let Some(text) =
        text.filter(|t| !t.trim().is_empty() && !row.try_get::<bool, _>("blocked").unwrap_or(true))
    else {
        return Err(Error("conflict"));
    };
    let source = Uuid::new_v4();
    let title: String = row
        .try_get::<String, _>("title")?
        .chars()
        .take(300)
        .collect();
    sqlx::query("INSERT INTO product.sources(id,institution_id,title,kind,original_url,visibility,origin) VALUES($1,$2,$3,'url',$4,'institution','approved')")
        .bind(source).bind(i).bind(title).bind(row.try_get::<String, _>("final_url")?).execute(&mut *tx).await?;
    sqlx::query(
        "UPDATE product.web_documents SET promoted_source_id=$3 WHERE institution_id=$1 AND id=$2",
    )
    .bind(i)
    .bind(id)
    .bind(source)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    let metadata = crate::ingestion::Metadata::promoted(row.try_get::<String, _>("language")?);
    let _job = crate::ingestion::ingest(
        s,
        i,
        source,
        user,
        Uuid::new_v4(),
        metadata,
        "text/plain",
        text.as_bytes(),
        true,
    )
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn domain_matching_rejects_suffix_tricks_and_normalizes_idna() {
        for (host, domain, expected) in [
            ("hcmiu.edu.vn", "hcmiu.edu.vn", true),
            ("www.hcmiu.edu.vn", "hcmiu.edu.vn", true),
            ("edusoftweb.hcmiu.edu.vn", "hcmiu.edu.vn", true),
            ("WWW.HCMIU.EDU.VN.", "hcmiu.edu.vn", true),
            ("hcmiu.edu.vn.evil.com", "hcmiu.edu.vn", false),
            ("xhcmiu.edu.vn", "hcmiu.edu.vn", false),
            ("edu.vn", "hcmiu.edu.vn", false),
            ("bücher.example.edu", "xn--bcher-kva.example.edu", true),
            ("www.xn--bcher-kva.example.edu", "BÜCHER.example.edu", true),
            (
                "xn--bcher-kva.example.edu.evil",
                "bücher.example.edu",
                false,
            ),
            ("127.0.0.1", "127.0.0.1", false),
        ] {
            assert_eq!(host_matches(host, domain), expected, "{host} vs {domain}");
        }
        assert_eq!(
            normalize_domain(" Bücher.Example.EDU. ").unwrap(),
            "xn--bcher-kva.example.edu"
        );
        for bad in [
            "",
            "localhost",
            "a/b.example.edu",
            "1.2.3.4",
            "user@example.edu",
            "-x.example.edu",
            "example.edu:443",
            "[::1]",
        ] {
            assert!(normalize_domain(bad).is_err(), "{bad}");
        }
        assert_eq!(
            normalize_domains(&["WWW.example.edu".into(), "www.example.edu".into()]).unwrap(),
            vec!["www.example.edu".to_owned()]
        );
        assert!(normalize_domains(&[]).is_err());
        assert!(
            normalize_domains(
                &(0..21)
                    .map(|n| format!("d{n}.example.edu"))
                    .collect::<Vec<_>>()
            )
            .is_err()
        );
        assert_eq!(
            host_of("https://Edusoftweb.HCMIU.edu.vn/x").as_deref(),
            Some("edusoftweb.hcmiu.edu.vn")
        );
        assert!(trusted("a.b.example.edu", &["example.edu".into()]));
        assert!(!trusted(
            "example.edu.evil.example",
            &["example.edu".into()]
        ));
    }
    #[test]
    fn cache_freshness_boundary_is_exactly_seven_days() {
        let at = chrono::DateTime::parse_from_rfc3339("2026-11-01T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let week = chrono::Duration::days(7);
        assert!(is_fresh(at, at));
        assert!(is_fresh(at, at + week - chrono::Duration::milliseconds(1)));
        assert!(!is_fresh(at, at + week));
        assert!(!is_fresh(at, at + week + chrono::Duration::seconds(1)));
    }
    #[test]
    fn markdown_headings_become_sections() {
        let text = "Intro line\n# Admissions\nSynthetic body.\n## Fees #\nSynthetic fee text.\n#NotAHeading\n";
        let chunks = markdown_chunks(text);
        let sections: Vec<&str> = chunks.iter().map(|(s, _)| s.as_str()).collect();
        assert_eq!(sections, ["Text", "Admissions", "Fees"]);
        assert!(chunks[2].1.contains("#NotAHeading"));
        assert_eq!(
            chunks.iter().map(|(_, c)| c.as_str()).collect::<String>(),
            text
        );
        let long = format!("# Big\n{}", "x".repeat(300_000));
        assert_eq!(markdown_chunks(&long).len(), PAGE_CHUNKS);
        assert!(markdown_chunks("\u{0}\u{1}  \n").is_empty());
        assert_eq!(page_language(Some("vi-VN")), Some("vi"));
        assert_eq!(page_language(Some("fr")), None);
        assert_eq!(
            search_hash("A  b", &["y.example".into(), "x.example".into()], "en"),
            search_hash("a b", &["x.example".into(), "y.example".into()], "en")
        );
    }
}
