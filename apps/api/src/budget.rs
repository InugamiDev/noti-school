use crate::error::{Error, Result};
use serde_json::json;
use sqlx::{PgPool, Row};
use uuid::Uuid;

// Institutional chunk vectors are recoverable work, not the uploader's personal answer cache.
pub(crate) const RECOVERABLE_EMBEDDING: &str = "EXISTS(SELECT 1 FROM product.ingestion_jobs j JOIN product.source_versions v ON v.institution_id=j.institution_id AND v.id=j.version_id JOIN product.chunks c ON c.institution_id=j.institution_id AND c.version_id=j.version_id WHERE j.id=p.root_operation_id AND p.stage='chunk_'||c.id::text AND j.state IN ('queued','running','failed','disabled') AND j.attempt<3 AND v.status IN ('pending_review','approved'))";

pub async fn priced(s: &crate::AppState) -> Result<bool> {
    let (_, _, model) = s.config.ai_keys()?;
    #[cfg(test)]
    let at = s.pricing_at;
    #[cfg(not(test))]
    let at: Option<chrono::DateTime<chrono::Utc>> = None;
    Ok(sqlx::query_scalar("WITH at AS (SELECT coalesce($2::timestamptz,clock_timestamp()) AS now) SELECT count(DISTINCT (provider,model,component))=CASE WHEN $3 THEN 5 ELSE 3 END FROM product.ai_prices,at WHERE effective_at<=at.now AND valid_until>at.now AND ((provider='openai' AND model=$1 AND component IN ('input_tokens','output_tokens')) OR (provider='openai' AND model='text-embedding-3-small' AND component='embedding_tokens') OR ($3 AND provider='jev' AND model='jev-1.13.0' AND component IN ('jev_input_tokens','jev_output_tokens')))").bind(model).bind(at).bind(s.config.evidence_provider == crate::config::EvidenceProvider::Jev).fetch_one(s.pool()?).await?)
}

pub async fn admit(s: &crate::AppState) -> Result<()> {
    if !priced(s).await? {
        return Err(Error("pricing_unavailable"));
    }
    s.providers.admit(s.config.evidence_provider)
}

// intent: a committed reservation is not permission to send; only a committed one-time dispatch is.
pub struct Attempt {
    pool: PgPool,
    id: Uuid,
    components: Vec<String>,
    kind: OperationKind,
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum OperationKind {
    Jev,
    Embedding,
    Generation,
}
impl Attempt {
    #[allow(clippy::too_many_arguments)]
    pub async fn reserve(
        pool: &PgPool,
        institution: Uuid,
        user: &str,
        operation: Uuid,
        stage: &str,
        input: &[u8],
        kind: OperationKind,
        generation_model: &str,
    ) -> Result<Self> {
        if stage.is_empty() || stage.len() > 100 || input.len() > 65536 {
            return Err(Error("invalid_request"));
        }
        use sha2::{Digest, Sha256};
        let input_hash = format!("{:x}", Sha256::digest(input));
        let (provider, model, required): (&str, &str, &[(&str, u64)]) = match kind {
            OperationKind::Jev => (
                "jev",
                "jev-1.13.0",
                &[("jev_input_tokens", 64000), ("jev_output_tokens", 64000)],
            ),
            OperationKind::Embedding => (
                "openai",
                "text-embedding-3-small",
                // UTF-8 bytes conservatively bound byte-level tokens; scalars do not.
                &[("embedding_tokens", 16000)],
            ),
            OperationKind::Generation => (
                "openai",
                generation_model,
                &[("input_tokens", 65536), ("output_tokens", 4096)],
            ),
        };
        let mut components = vec![];
        let mut plan = vec![];
        let mut id = Uuid::new_v4();
        let mut tx = pool.begin().await?;
        let owned:Option<Uuid>=sqlx::query_scalar("SELECT k.operation_id FROM product.idempotency_keys k JOIN product.memberships m ON m.institution_id=k.institution_id AND m.user_id=k.user_id AND m.revoked_at IS NULL WHERE k.institution_id=$1 AND k.user_id=$2 AND k.operation_id=$3 AND k.expires_at>now() AND (k.state='pending' OR (k.state='completed' AND m.role='admin' AND EXISTS(SELECT 1 FROM product.ingestion_jobs j WHERE j.id=k.operation_id AND j.state='running'))) FOR UPDATE OF k FOR SHARE OF m")
            .bind(institution).bind(user).bind(operation).fetch_optional(&mut *tx).await?;
        if owned.is_none() {
            return Err(Error("conflict"));
        }
        // Root ownership lock serializes stage creation/recovery. A root receipt fences every child.
        let root_unresolved: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.ai_reservations WHERE operation_id=$1 AND state IN ('dispatched','uncertain','settled'))")
            .bind(operation).fetch_one(&mut *tx).await?;
        if root_unresolved {
            return Err(Error("conflict"));
        }
        let existing = sqlx::query("SELECT id,input_sha256,result FROM product.pipeline_stages WHERE root_operation_id=$1 AND stage=$2 FOR UPDATE")
            .bind(operation).bind(stage).fetch_optional(&mut *tx).await?;
        let stage_id = if let Some(row) = &existing {
            if row.try_get::<String, _>("input_sha256")? != input_hash
                || row
                    .try_get::<Option<serde_json::Value>, _>("result")?
                    .is_some()
            {
                return Err(Error("conflict"));
            }
            row.try_get::<Uuid, _>("id")?
        } else {
            let stage_id = Uuid::new_v4();
            sqlx::query("INSERT INTO product.pipeline_stages(id,root_operation_id,stage,input_sha256) VALUES($1,$2,$3,$4)")
                .bind(stage_id).bind(operation).bind(stage).bind(input_hash).execute(&mut *tx).await?;
            stage_id
        };
        for (component, units) in required {
            let price:Option<String>=sqlx::query_scalar("SELECT id FROM product.ai_prices WHERE provider=$1 AND model=$2 AND component=$3 AND effective_at<=clock_timestamp() AND valid_until>clock_timestamp() ORDER BY effective_at DESC,id LIMIT 1")
                .bind(provider).bind(model).bind(component).fetch_optional(&mut *tx).await?;
            let price = price.ok_or(Error("pricing_unavailable"))?;
            plan.push(json!({"price_id":price,"units":units}));
            components.push(price);
        }
        let mut reserve_attempt = Some(1i32);
        if existing.is_some() {
            // Same lock used by all SQL reservation transitions; inspect and replace atomically.
            sqlx::query("SELECT pg_advisory_xact_lock(718443901)")
                .execute(&mut *tx)
                .await?;
            let receipts = sqlx::query("SELECT id,state,plan,attempt,month=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date AS current_month,month<date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')::date AS prior_month FROM product.ai_reservations WHERE operation_id=$1 ORDER BY attempt")
                .bind(stage_id).fetch_all(&mut *tx).await?;
            if receipts.is_empty()
                || receipts.iter().any(|r| {
                    r.get::<String, _>("state") != "released"
                        && r.get::<String, _>("state") != "reserved"
                })
            {
                return Err(Error("conflict"));
            }
            let reserved: Vec<_> = receipts
                .iter()
                .filter(|r| r.get::<String, _>("state") == "reserved")
                .collect();
            if reserved.len() > 1 {
                return Err(Error("conflict"));
            }
            reserve_attempt = Some(
                receipts
                    .last()
                    .ok_or(Error("conflict"))?
                    .try_get::<i32, _>("attempt")?
                    + 1,
            );
            if let Some(old) = reserved.first() {
                if old.try_get::<bool, _>("current_month")? {
                    if old.try_get::<serde_json::Value, _>("plan")? != json!(plan) {
                        return Err(Error("conflict"));
                    }
                    id = old.try_get("id")?;
                    reserve_attempt = None;
                } else {
                    if !old.try_get::<bool, _>("prior_month")? {
                        return Err(Error("conflict"));
                    }
                    // SQL proves reserved -> released; dispatched/uncertain/settled never reach here.
                    sqlx::query("SELECT product.mark_ai($1,'released')")
                        .bind(old.try_get::<Uuid, _>("id")?)
                        .execute(&mut *tx)
                        .await?;
                }
            }
        }
        if let Some(attempt) = reserve_attempt {
            if attempt > 3 {
                return Err(Error("conflict"));
            }
            sqlx::query("SELECT product.reserve_ai($1,$2,$3,$4)")
                .bind(id)
                .bind(stage_id)
                .bind(attempt)
                .bind(json!(plan))
                .execute(&mut *tx)
                .await
                .map_err(|_| Error("budget_exhausted"))?;
        }
        tx.commit().await?;
        // Separate committed transition prevents a replay/collision from authorizing another request.
        let mut tx = pool.begin().await?;
        let current:Option<Uuid>=sqlx::query_scalar("SELECT k.operation_id FROM product.idempotency_keys k JOIN product.memberships m ON m.institution_id=k.institution_id AND m.user_id=k.user_id AND m.revoked_at IS NULL WHERE k.institution_id=$1 AND k.user_id=$2 AND k.operation_id=$3 AND k.expires_at>now() AND (k.state='pending' OR (k.state='completed' AND m.role='admin' AND EXISTS(SELECT 1 FROM product.ingestion_jobs j WHERE j.id=k.operation_id AND j.state='running'))) FOR SHARE OF k,m")
            .bind(institution).bind(user).bind(operation).fetch_optional(&mut *tx).await?;
        if current.is_none() {
            return Err(Error("not_found"));
        }
        sqlx::query("SELECT product.mark_ai($1,'dispatched')")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|_| Error("budget_exhausted"))?;
        tx.commit().await?;
        Ok(Self {
            pool: pool.clone(),
            id,
            components,
            kind,
        })
    }
    pub fn is_for(&self, kind: OperationKind) -> bool {
        self.kind == kind
    }
    pub async fn settle(self, units: Vec<u64>, result: serde_json::Value) -> Result<()> {
        if units.len() != self.components.len() || units.iter().any(|v| *v > 1_000_000) {
            return Err(Error("provider_unavailable"));
        }
        let usage: Vec<_> = self
            .components
            .iter()
            .zip(units)
            .map(|(p, u)| json!({"price_id":p,"units":u}))
            .collect();
        // Reconciliation is operational: revocation must not erase already-dispatched spend.
        let mut tx = self.pool.begin().await?;
        // Deletion/revocation may race a provider reply. Settle money regardless, but never restore
        // cached personal text after cleanup. Row locks serialize this with account deletion.
        let mut active: Option<Uuid> = sqlx::query_scalar("SELECT p.id FROM product.pipeline_stages p JOIN product.idempotency_keys k ON k.operation_id=p.root_operation_id JOIN product.memberships m ON m.institution_id=k.institution_id AND m.user_id=k.user_id AND m.revoked_at IS NULL WHERE p.id=(SELECT operation_id FROM product.ai_reservations WHERE id=$1) AND k.state IN ('pending','completed') AND k.expires_at>now() FOR SHARE OF k,m")
            .bind(self.id).fetch_optional(&mut *tx).await?;
        if active.is_none()
            && self.kind == OperationKind::Embedding
            && serde_json::from_value::<Vec<f32>>(result.clone()).is_ok_and(|v| {
                v.len() == 1536 && v.iter().all(|n| n.is_finite()) && v.iter().any(|n| *n != 0.0)
            })
        {
            active = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT p.id FROM product.pipeline_stages p WHERE p.id=(SELECT operation_id FROM product.ai_reservations WHERE id=$1) AND {RECOVERABLE_EMBEDDING} FOR UPDATE OF p")))
                .bind(self.id).fetch_optional(&mut *tx).await?;
        }
        // Match reserve/dispatch lock order: ownership/stage before the global money lock.
        // Missing/revoked ownership still permits settlement, but cannot restore cached text.
        sqlx::query("SELECT product.settle_ai($1,$2)")
            .bind(self.id)
            .bind(json!(usage))
            .execute(&mut *tx)
            .await?;
        if let Some(stage) = active {
            sqlx::query("UPDATE product.pipeline_stages SET result=$2 WHERE id=$1")
                .bind(stage)
                .bind(result)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }
}
// Dropping an Attempt intentionally leaves dispatched funds reserved after timeout/cancellation.
