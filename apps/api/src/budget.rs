use crate::error::{Error, Result};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

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
}
impl Attempt {
    pub async fn reserve(
        pool: &PgPool,
        institution: Uuid,
        user: &str,
        operation: Uuid,
        attempt: i32,
        kind: OperationKind,
    ) -> Result<Self> {
        if !(1..=3).contains(&attempt) {
            return Err(Error("invalid_request"));
        }
        let (provider, model, required): (&str, &str, &[(&str, u64)]) = match kind {
            OperationKind::Jev => (
                "jev",
                "jev-1.13.0",
                &[("jev_input_tokens", 64000), ("jev_output_tokens", 64000)],
            ),
            OperationKind::Embedding => (
                "openai",
                "text-embedding-3-small",
                &[("embedding_tokens", 8192)],
            ),
        };
        let mut components = vec![];
        let mut plan = vec![];
        let id = Uuid::new_v4();
        let mut tx = pool.begin().await?;
        let owned:Option<Uuid>=sqlx::query_scalar("SELECT k.operation_id FROM product.idempotency_keys k JOIN product.memberships m ON m.institution_id=k.institution_id AND m.user_id=k.user_id AND m.revoked_at IS NULL WHERE k.institution_id=$1 AND k.user_id=$2 AND k.operation_id=$3 AND k.state='pending' FOR UPDATE OF k FOR SHARE OF m")
            .bind(institution).bind(user).bind(operation).fetch_optional(&mut *tx).await?;
        if owned.is_none() {
            return Err(Error("conflict"));
        }
        for (component, units) in required {
            let price:Option<String>=sqlx::query_scalar("SELECT id FROM product.ai_prices WHERE provider=$1 AND model=$2 AND component=$3 AND effective_at<=clock_timestamp() AND valid_until>clock_timestamp() ORDER BY effective_at DESC,id LIMIT 1")
                .bind(provider).bind(model).bind(component).fetch_optional(&mut *tx).await?;
            let price = price.ok_or(Error("pricing_unavailable"))?;
            plan.push(json!({"price_id":price,"units":units}));
            components.push(price);
        }
        sqlx::query("SELECT product.reserve_ai($1,$2,$3,$4)")
            .bind(id)
            .bind(operation)
            .bind(attempt)
            .bind(json!(plan))
            .execute(&mut *tx)
            .await
            .map_err(|_| Error("budget_exhausted"))?;
        tx.commit().await?;
        // Separate committed transition prevents a replay/collision from authorizing another request.
        let mut tx = pool.begin().await?;
        let current:Option<Uuid>=sqlx::query_scalar("SELECT k.operation_id FROM product.idempotency_keys k JOIN product.memberships m ON m.institution_id=k.institution_id AND m.user_id=k.user_id AND m.revoked_at IS NULL WHERE k.institution_id=$1 AND k.user_id=$2 AND k.operation_id=$3 AND k.state='pending' FOR SHARE OF k,m")
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
    pub async fn settle(self, units: Vec<u64>) -> Result<()> {
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
        sqlx::query("SELECT product.settle_ai($1,$2)")
            .bind(self.id)
            .bind(json!(usage))
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
// Dropping an Attempt intentionally leaves dispatched funds reserved after timeout/cancellation.
