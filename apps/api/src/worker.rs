// intent: one native worker leases one bounded chunk at a time; PostgreSQL is the queue.
use crate::{
    AppState,
    error::{Error, Result},
    pipeline::{Run, vector_literal},
};
use sqlx::{Connection, Row};
use uuid::Uuid;

pub async fn tick(s: &AppState) -> Result<bool> {
    s.config.ai_keys()?;
    let mut conn = s.pool()?.acquire().await?.detach();
    let mut tx = conn.begin().await?;
    // Row locking selects a job; a dedicated session lock owns it across the committed HTTP dispatch.
    let row = sqlx::query("SELECT j.id,j.institution_id,j.version_id,j.state,k.user_id FROM product.ingestion_jobs j JOIN product.idempotency_keys k ON k.operation_id=j.id JOIN product.memberships m ON m.institution_id=j.institution_id AND m.user_id=k.user_id AND m.role='admin' AND m.revoked_at IS NULL JOIN product.source_versions v ON v.institution_id=j.institution_id AND v.id=j.version_id WHERE j.state IN ('queued','running') AND j.attempt<3 AND k.expires_at>now() AND v.status IN ('pending_review','approved') ORDER BY j.updated_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED")
        .fetch_optional(&mut *tx).await?;
    let Some(row) = row else { return Ok(false) };
    let job: Uuid = row.try_get("id")?;
    let institution: Uuid = row.try_get("institution_id")?;
    let version: Uuid = row.try_get("version_id")?;
    let user: String = row.try_get("user_id")?;
    // Commit the running state first, keeping an advisory session lock across the bounded call.
    let lock: bool =
        sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtextextended($1,718443905))")
            .bind(job.to_string())
            .fetch_one(&mut *tx)
            .await?;
    if !lock {
        return Ok(false);
    }
    sqlx::query("UPDATE product.ingestion_jobs SET state='running',updated_at=now() WHERE id=$1")
        .bind(job)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE product.source_versions SET indexing='running' WHERE id=$1")
        .bind(version)
        .execute(&mut *tx)
        .await?;
    // Session-level locks must never be returned to the pool. Use a dedicated detached connection.
    tx.commit().await?;
    let result = index_one(s, institution, version, job, &user).await;
    let (state, indexing, error) = match &result {
        Ok(true) => ("succeeded", "ready", None),
        Ok(false) => ("queued", "pending", None),
        Err(e) => ("failed", "failed", Some(e.0)),
    };
    let update = async {
        let mut tx=conn.begin().await?;
        sqlx::query("UPDATE product.ingestion_jobs SET state=$2,error_code=$3,attempt=attempt+CASE WHEN $2='failed' THEN 1 ELSE 0 END,updated_at=now() WHERE id=$1")
            .bind(job).bind(state).bind(error).execute(&mut *tx).await?;
        sqlx::query("UPDATE product.source_versions SET indexing=$2 WHERE id=$1").bind(version).bind(indexing).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok::<_,Error>(())
    }.await;
    let _ = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1,718443905))")
        .bind(job.to_string())
        .execute(&mut conn)
        .await;
    update?;
    result.map(|_| true)
}

async fn index_one(s: &AppState, i: Uuid, version: Uuid, job: Uuid, user: &str) -> Result<bool> {
    let chunk = sqlx::query("SELECT id,content FROM product.chunks WHERE institution_id=$1 AND version_id=$2 AND embedding IS NULL ORDER BY ordinal LIMIT 1")
        .bind(i).bind(version).fetch_optional(s.pool()?).await?;
    if let Some(chunk) = chunk {
        let id: Uuid = chunk.try_get("id")?;
        let content: String = chunk.try_get("content")?;
        let run = Run {
            state: s,
            institution: i,
            user,
            operation: job,
        };
        let vector = run.embed(&format!("chunk_{id}"), &content).await?;
        let count = sqlx::query("UPDATE product.chunks c SET embedding=$3::public.vector,embedding_model='text-embedding-3-small' WHERE c.institution_id=$1 AND c.id=$2 AND EXISTS(SELECT 1 FROM product.memberships m WHERE m.institution_id=$1 AND m.user_id=$4 AND m.role='admin' AND m.revoked_at IS NULL) AND EXISTS(SELECT 1 FROM product.source_versions v WHERE v.id=c.version_id AND v.status IN ('pending_review','approved'))")
            .bind(i).bind(id).bind(vector_literal(&vector)).bind(user).execute(s.pool()?).await?.rows_affected();
        if count != 1 {
            return Err(Error("not_found"));
        }
    }
    let ready: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.chunks WHERE version_id=$1) AND NOT EXISTS(SELECT 1 FROM product.chunks WHERE version_id=$1 AND embedding IS NULL)")
        .bind(version).fetch_one(s.pool()?).await?;
    Ok(ready)
}

pub async fn run(s: AppState) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        interval.tick().await;
        let _ = tick(&s).await;
        if let Some(db) = &s.db {
            let _ = crate::accounts::retain(&s).await;
            let _ = sqlx::query("UPDATE product.idempotency_keys SET state='failed',response='{}' WHERE operation_id IN (SELECT operation_id FROM product.idempotency_keys WHERE state='pending' AND created_at<now()-interval '5 minutes' ORDER BY created_at LIMIT 100)").execute(db).await;
            let _ = sqlx::query("UPDATE product.pipeline_stages SET result=NULL WHERE id IN (SELECT p.id FROM product.pipeline_stages p JOIN product.idempotency_keys k ON k.operation_id=p.root_operation_id WHERE k.expires_at<now() AND p.result IS NOT NULL ORDER BY p.created_at LIMIT 100)").execute(db).await;
            let _ = sqlx::query("WITH failed AS (UPDATE product.ingestion_jobs SET state='failed',error_code='not_found',updated_at=now() WHERE id IN (SELECT j.id FROM product.ingestion_jobs j JOIN product.idempotency_keys k ON k.operation_id=j.id WHERE j.state IN ('queued','running') AND j.updated_at<now()-interval '2 minutes' AND (k.expires_at<now() OR NOT EXISTS(SELECT 1 FROM product.memberships m WHERE m.institution_id=j.institution_id AND m.user_id=k.user_id AND m.role='admin' AND m.revoked_at IS NULL)) ORDER BY j.updated_at LIMIT 100) RETURNING institution_id,version_id) UPDATE product.source_versions v SET indexing='failed' FROM failed f WHERE v.institution_id=f.institution_id AND v.id=f.version_id AND v.indexing IN ('pending','running')").execute(db).await;
        }
    }
}
