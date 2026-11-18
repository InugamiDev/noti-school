use crate::{
    AppState, auth,
    error::{Error, Result},
    pagination::Page,
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde_json::{Value, json};
use uuid::Uuid;

const EVIDENCE: &str = "SELECT jsonb_build_object('id',e.id,'source_id',c.source_id,'version_id',c.version_id,'chunk_id',c.id,'institution_id',c.institution_id,'title',s.title,'version_label',v.label,'locator',jsonb_build_object('page',c.page,'section',c.section,'start_char',c.start_char,'end_char',c.end_char),'quote',e.quote,'original_url',s.original_url,'origin',s.origin,'domain',e.domain,'retrieved_at',e.retrieved_at,'confidence',e.confidence) FROM product.citations e JOIN product.chunks c ON c.institution_id=e.institution_id AND c.id=e.chunk_id JOIN product.sources s ON s.institution_id=c.institution_id AND s.id=c.source_id JOIN product.source_versions v ON v.institution_id=c.institution_id AND v.id=c.version_id JOIN product.answers a ON a.institution_id=e.institution_id AND a.id=e.answer_id JOIN product.conversations conv ON conv.institution_id=a.institution_id AND conv.id=a.conversation_id JOIN product.memberships m ON m.institution_id=conv.institution_id AND m.user_id=conv.user_id AND m.revoked_at IS NULL WHERE e.institution_id=$1 AND conv.user_id=$2 AND (m.role='admin' OR s.visibility='institution') AND ((v.approved_at IS NOT NULL AND v.status IN ('approved','archived')) OR (s.origin='web' AND v.status IN ('draft','archived'))) AND conv.created_at>now()-interval '30 days'";
// Stored claims; answers persisted before confidence existed have no confidence key.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
struct StoredClaim {
    text: String,
    evidence_ids: Vec<Uuid>,
    #[serde(default)]
    confidence: Option<f64>,
}
pub(crate) async fn assemble(s: &AppState, i: Uuid, id: Uuid, user: &str) -> Result<Value> {
    assemble_in(&mut *s.pool()?.acquire().await?, i, id, user).await
}
// intent: callers already holding a transaction pass it here; acquiring further pool connections while
// holding row locks lets a burst of such requests exhaust the pool and stall each other.
pub(crate) async fn assemble_in(
    db: &mut sqlx::PgConnection,
    i: Uuid,
    id: Uuid,
    user: &str,
) -> Result<Value> {
    let mut answer:Value=sqlx::query_scalar("SELECT jsonb_build_object('id',a.id,'conversation_id',a.conversation_id,'institution_id',a.institution_id,'status',a.status,'language',a.language,'claims',a.claims,'explanation',a.explanation,'created_at',a.created_at) FROM product.answers a JOIN product.conversations c ON c.institution_id=a.institution_id AND c.id=a.conversation_id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL WHERE a.institution_id=$1 AND a.id=$2 AND c.user_id=$3 AND c.created_at>now()-interval '30 days'")
        .bind(i).bind(id).bind(user).fetch_optional(&mut *db).await?.ok_or(Error("not_found"))?;
    let evidence: Vec<Value> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "{EVIDENCE} AND e.answer_id=$3 ORDER BY e.id LIMIT 51"
    )))
    .bind(i)
    .bind(user)
    .bind(id)
    .fetch_all(&mut *db)
    .await?;
    let ids: std::collections::BTreeSet<_> =
        evidence.iter().filter_map(|v| v["id"].as_str()).collect();
    let claims: Vec<StoredClaim> =
        serde_json::from_value(answer["claims"].clone()).map_err(|_| Error("internal_error"))?;
    // Previously visible evidence may have become admin-only. Do not leak its saved claim text.
    if evidence.len() > 50
        || claims.iter().any(|c| {
            c.evidence_ids
                .iter()
                .any(|id| !ids.contains(id.to_string().as_str()))
        })
    {
        return Err(Error("not_found"));
    }
    // Answer confidence is the lowest claim confidence; unknown when any claim lacks one.
    let confidence = claims
        .iter()
        .map(|c| c.confidence)
        .try_fold(None::<f64>, |low, c| {
            c.map(|c| Some(low.map_or(c, |l| l.min(c))))
        })
        .flatten();
    answer["claims"] = json!(claims);
    answer["confidence"] = json!(confidence);
    answer["evidence"] = json!(evidence);
    Ok(answer)
}
pub async fn detail(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    Ok(Json(assemble(&s, i, id, &u.user_id).await?))
}
pub async fn list(
    State(s): State<AppState>,
    Path((i, conversation)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
    Query(p): Query<Page>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let key = s
        .config
        .secret
        .as_deref()
        .ok_or(Error("core_unavailable"))?;
    let scope = format!("answers:{i}:{conversation}:{}", u.user_id);
    let (at, last) = p.decode(&scope, key)?;
    let limit = p.limit()?;
    let page:Vec<(Uuid,chrono::DateTime<chrono::Utc>)>=sqlx::query_as("SELECT a.id,a.created_at FROM product.answers a JOIN product.conversations c ON c.institution_id=a.institution_id AND c.id=a.conversation_id JOIN product.memberships m ON m.institution_id=c.institution_id AND m.user_id=c.user_id AND m.revoked_at IS NULL WHERE a.institution_id=$1 AND c.id=$2 AND c.user_id=$3 AND c.created_at>now()-interval '30 days' AND (a.created_at,a.id)>($4,$5) ORDER BY a.created_at,a.id LIMIT $6")
        .bind(i).bind(conversation).bind(&u.user_id).bind(at).bind(last).bind(limit+1).fetch_all(s.pool()?).await?;
    let more = page.len() > limit as usize;
    let page = &page[..page.len().min(limit as usize)];
    let mut rows = vec![];
    for (id, _) in page {
        // One answer whose evidence became inaccessible is omitted, not a 404 for the whole page.
        match assemble(&s, i, *id, &u.user_id).await {
            Ok(answer) => rows.push(answer),
            Err(Error("not_found")) => {}
            Err(e) => return Err(e),
        }
    }
    // The cursor follows the scanned rows, so omitted answers never stall or truncate paging.
    let next = match page.last() {
        Some((id, at)) if more => Some(crate::pagination::encode(&scope, *at, *id, key)),
        _ => None,
    };
    Ok(Json(json!({"items":rows,"next_cursor":next})))
}
pub async fn citation(
    State(s): State<AppState>,
    Path((i, id)): Path<(Uuid, Uuid)>,
    h: HeaderMap,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, false).await?;
    let row = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("{EVIDENCE} AND e.id=$3")))
        .bind(i)
        .bind(u.user_id)
        .bind(id)
        .fetch_optional(s.pool()?)
        .await?
        .ok_or(Error("not_found"))?;
    Ok(Json(row))
}
