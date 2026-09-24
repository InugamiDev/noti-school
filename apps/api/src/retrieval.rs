use crate::{
    AppState, auth,
    error::{Error, Result},
};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
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
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Ask {
    pub(crate) institution_id: Uuid,
    pub(crate) question: String,
    pub(crate) language: String,
    pub(crate) conversation_id: Option<Uuid>,
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
    let key: Uuid = h
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
            .bind(b.institution_id).bind(id).bind(&u.user_id).fetch_one(s.pool()?).await?;
        if !exists {
            return Err(Error("not_found"));
        }
    }
    if b.discover {
        return Err(Error("provider_unavailable"));
    }
    s.config.ai_keys()?;
    if b.question.len() > 8000 || h.get_all("idempotency-key").iter().count() != 1 {
        return Err(Error("invalid_request"));
    }
    use sha2::{Digest, Sha256};
    use sqlx::Row;
    let hash = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&b).map_err(crate::error::invalid)?)
    );
    let permit = s
        .pipeline_slots
        .clone()
        .try_acquire_owned()
        .map_err(|_| Error("rate_limited"))?;
    let operation = Uuid::new_v4();
    let inserted = sqlx::query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state) VALUES($1,$2,$3,$4,$5,'pending') ON CONFLICT DO NOTHING")
        .bind(b.institution_id).bind(&u.user_id).bind(key).bind(&hash).bind(operation).execute(s.pool()?).await?.rows_affected();
    if inserted == 0 {
        let row = sqlx::query("SELECT request_sha256,state,response,expires_at>now() AS valid FROM product.idempotency_keys WHERE institution_id=$1 AND user_id=$2 AND key=$3")
            .bind(b.institution_id).bind(&u.user_id).bind(key).fetch_one(s.pool()?).await?;
        if row.try_get::<String, _>("request_sha256")? != hash
            || !row.try_get::<bool, _>("valid")?
            || row.try_get::<String, _>("state")? != "completed"
        {
            return Err(Error("conflict"));
        }
        let response: Value = row.try_get("response")?;
        let id =
            serde_json::from_value(response["answer_id"].clone()).map_err(|_| Error("conflict"))?;
        return Ok(Json(
            crate::answers::assemble(&s, b.institution_id, id, &u.user_id).await?,
        ));
    }
    // The bounded task survives a disconnected client. Its durable root and reservations survive shutdown.
    let db = s.pool()?.clone();
    let task = tokio::spawn(async move {
        let _permit = permit;
        let outcome = tokio::time::timeout(
            std::time::Duration::from_secs(140),
            crate::pipeline::execute(s, h, b, u.user_id, operation),
        )
        .await
        .unwrap_or(Err(Error("provider_unavailable")));
        if let Err(e) = &outcome {
            let _ = sqlx::query("UPDATE product.idempotency_keys SET state='failed',response=$2 WHERE operation_id=$1 AND state='pending'").bind(operation).bind(json!({"error_code":e.0})).execute(&db).await;
            let _ = sqlx::query(
                "UPDATE product.pipeline_stages SET result=NULL WHERE root_operation_id=$1",
            )
            .bind(operation)
            .execute(&db)
            .await;
        }
        outcome
    });
    Ok(Json(task.await.map_err(|_| Error("core_unavailable"))??))
}
