// intent: institution projection (kind, domains, truthful coverage), trusted-domain administration and
// the one private personal space per signed-in user. Personal spaces never appear in public listings;
// other users reach them only as 404 through the ordinary membership checks.
// status: done | next: none | confidence: high
use crate::{
    AppState, auth,
    error::{Error, Result},
};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

pub const INSTITUTION_JSON: &str = "jsonb_build_object('id',i.id,'slug',i.slug,'name',i.name,'kind',i.kind,'domains',to_jsonb(i.domains),'coverage',CASE WHEN EXISTS(SELECT 1 FROM product.sources s JOIN product.source_versions v ON v.institution_id=s.institution_id AND v.id=s.current_version_id WHERE s.institution_id=i.id AND s.origin='approved' AND s.visibility='institution' AND v.status='approved' AND v.indexing='ready' AND (v.effective_from IS NULL OR v.effective_from<=now()) AND (v.effective_until IS NULL OR v.effective_until>now())) THEN 'approved_sources' WHEN i.kind='personal' THEN 'web_discovery' ELSE 'none' END)";

async fn get(db: &mut sqlx::PgConnection, id: Uuid) -> Result<Value> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT {INSTITUTION_JSON} FROM product.institutions i WHERE i.id=$1"
    )))
    .bind(id)
    .fetch_optional(&mut *db)
    .await?
    .ok_or(Error("not_found"))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Domains {
    domains: Vec<String>,
}
// Replaces the trusted domain list after IDNA/lowercase normalization; matching includes subdomains.
pub async fn domains(
    State(s): State<AppState>,
    Path(i): Path<Uuid>,
    h: HeaderMap,
    Json(b): Json<Domains>,
) -> Result<Json<Value>> {
    let u = auth::member(&s, &h, i, true).await?;
    if b.domains.is_empty() || b.domains.len() > 20 || b.domains.iter().any(|d| d.len() > 253) {
        return Err(Error("invalid_request"));
    }
    let domains = crate::web::normalize_domains(&b.domains)?;
    let mut tx = s.pool()?.begin().await?;
    let n = sqlx::query("UPDATE product.institutions SET domains=$2 WHERE id=$1 AND EXISTS(SELECT 1 FROM product.memberships m WHERE m.institution_id=$1 AND m.user_id=$3 AND m.role='admin' AND m.revoked_at IS NULL)")
        .bind(i).bind(&domains).bind(&u.user_id).execute(&mut *tx).await?.rows_affected();
    if n != 1 {
        return Err(Error("not_found"));
    }
    let value = get(&mut tx, i).await?;
    tx.commit().await?;
    Ok(Json(value))
}

// Idempotent: returns the caller's existing space (also 201, per the frozen endpoint) or creates one
// with the caller as its only admin. Deleted identities cannot recreate a space.
pub async fn personal_space(
    State(s): State<AppState>,
    h: HeaderMap,
) -> Result<(StatusCode, Json<Value>)> {
    let u = auth::session(&s, &h).await?;
    let mut tx = s.pool()?.begin().await?;
    if crate::accounts::lock_identity(&mut tx, &u.user_id).await? {
        return Err(Error("forbidden"));
    }
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM product.institutions WHERE kind='personal' AND owner_user_id=$1",
    )
    .bind(&u.user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let id = match existing {
        Some(id) => {
            let active: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.memberships WHERE institution_id=$1 AND user_id=$2 AND role='admin' AND revoked_at IS NULL)")
                .bind(id).bind(&u.user_id).fetch_one(&mut *tx).await?;
            if !active {
                return Err(Error("forbidden"));
            }
            id
        }
        None => {
            let id = Uuid::new_v4();
            sqlx::query("INSERT INTO product.institutions(id,slug,name,coverage,kind,owner_user_id) VALUES($1,$2,'Personal space','none','personal',$3)")
                .bind(id).bind(format!("personal-{id}")).bind(&u.user_id).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,'admin')")
                .bind(id).bind(&u.user_id).execute(&mut *tx).await?;
            id
        }
    };
    let value = get(&mut tx, id).await?;
    tx.commit().await?;
    Ok((StatusCode::CREATED, Json(value)))
}
