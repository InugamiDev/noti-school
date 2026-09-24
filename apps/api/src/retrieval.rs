use crate::{
    AppState, auth,
    error::{Error, Result},
};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Search {
    institution_id: Uuid,
    query: String,
    language: String,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Ask {
    institution_id: Uuid,
    question: String,
    language: String,
    conversation_id: Option<Uuid>,
    #[serde(default)]
    discover: bool,
}
pub fn rrf(lists: &[Vec<Uuid>], limit: usize) -> Vec<Uuid> {
    let mut scores = BTreeMap::<Uuid, f64>::new();
    for list in lists.iter().take(3) {
        let mut seen = BTreeSet::new();
        for (rank, id) in list.iter().take(100).enumerate() {
            if seen.insert(id) {
                *scores.entry(*id).or_default() += 1.0 / (60.0 + rank as f64 + 1.0);
            }
        }
    }
    let mut ranked: Vec<_> = scores.into_iter().collect();
    ranked.sort_by(|(a, x), (b, y)| y.total_cmp(x).then(a.cmp(b)));
    ranked
        .into_iter()
        .take(limit.min(50))
        .map(|(id, _)| id)
        .collect()
}
pub async fn search(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(b): Json<Search>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, b.institution_id, false).await?;
    let limit = b.limit.unwrap_or(10);
    if b.query.trim().is_empty()
        || b.query.chars().count() > 4000
        || !["en", "vi"].contains(&b.language.as_str())
        || !(1..=20).contains(&limit)
    {
        return Err(Error("invalid_request"));
    }
    // No model calls: lexical-only search is available for current approved extracted text.
    let rows:Vec<Value>=sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'source_id',c.source_id,'version_id',c.version_id,'chunk_id',c.id,'institution_id',c.institution_id,'title',s.title,'version_label',v.label,'locator',jsonb_build_object('page',c.page,'section',c.section,'start_char',c.start_char,'end_char',c.end_char),'quote',left(c.content,4000),'original_url',s.original_url) FROM product.chunks c JOIN product.source_versions v ON v.institution_id=c.institution_id AND v.id=c.version_id JOIN product.sources s ON s.institution_id=c.institution_id AND s.id=c.source_id AND s.current_version_id=v.id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE c.institution_id=$1 AND (m.role='admin' OR s.visibility='institution') AND v.status='approved' AND v.indexing IN ('ready','disabled') AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now()) AND c.lexical @@ plainto_tsquery('simple',$3) ORDER BY ts_rank_cd(c.lexical,plainto_tsquery('simple',$3)) DESC,c.id LIMIT $4")
        .bind(b.institution_id).bind(u.user_id).bind(b.query).bind(limit).fetch_all(s.pool()?).await?;
    Ok(Json(json!({"items":rows,"next_cursor":null})))
}
pub async fn chunk(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let row=sqlx::query_scalar("SELECT jsonb_build_object('id',c.id,'institution_id',c.institution_id,'source_id',c.source_id,'version_id',c.version_id,'ordinal',c.ordinal,'text',c.content,'locator',jsonb_build_object('page',c.page,'section',c.section,'start_char',c.start_char,'end_char',c.end_char),'language',c.language) FROM product.chunks c JOIN product.source_versions v ON v.institution_id=c.institution_id AND v.id=c.version_id JOIN product.sources s ON s.institution_id=c.institution_id AND s.id=c.source_id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=$3 AND m.revoked_at IS NULL WHERE c.institution_id=$1 AND c.id=$2 AND (m.role='admin' OR (s.visibility='institution' AND v.status IN ('approved','archived')))")
        .bind(i).bind(id).bind(u.user_id).fetch_optional(s.pool()?).await?.ok_or(Error("not_found"))?;
    Ok(Json(row))
}
pub async fn ask(
    State(s): State<AppState>,
    h: HeaderMap,
    Json(b): Json<Ask>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, b.institution_id, false).await?;
    let _: Uuid = h
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or(Error("invalid_request"))?
        .parse()
        .map_err(crate::error::invalid)?;
    if b.question.trim().is_empty()
        || b.question.chars().count() > 4000
        || !["en", "vi"].contains(&b.language.as_str())
    {
        return Err(Error("invalid_request"));
    }
    if let Some(id) = b.conversation_id {
        let exists:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.conversations c JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL WHERE c.institution_id=$1 AND c.id=$2 AND c.user_id=$3)")
            .bind(b.institution_id).bind(id).bind(u.user_id).fetch_one(s.pool()?).await?;
        if !exists {
            return Err(Error("not_found"));
        }
    }
    let _discovery_requested = b.discover;
    // status: paid orchestration deliberately unavailable until pricing plans and job runner are integrated.
    Err(Error("provider_unavailable"))
}
