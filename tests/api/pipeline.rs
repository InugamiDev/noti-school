use crate::{
    AppState,
    budget::{Attempt, OperationKind},
    config::Config,
};
use axum::{
    Json, Router,
    body::{Body, to_bytes},
    http::{HeaderMap, Request, StatusCode},
    routing::post,
};
use serde_json::{Value, json};
use sqlx::Row;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tower::ServiceExt;
use uuid::Uuid;

const DB: &str =
    "postgresql://noti_school_api:synthetic-test-only@127.0.0.1:54390/noti_school_test_api2";
const MIGRATOR: &str =
    "postgresql://noti_school_migrator:synthetic-test-only@127.0.0.1:54390/noti_school_test_api2";
const SECRET: &str = "synthetic-internal-secret-test-only-0000";

#[path = "repairs.rs"]
mod repairs;

async fn call(
    s: &AppState,
    method: &str,
    path: &str,
    user: &str,
    body: Value,
    key: Option<Uuid>,
) -> (StatusCode, Value) {
    let internal = path.starts_with("/internal/");
    let mut req = Request::builder()
        .method(method)
        .uri(path)
        .header(
            "host",
            if internal {
                "127.0.0.1:3810"
            } else {
                "localhost:3000"
            },
        )
        .header("origin", "http://localhost:3000")
        .header("x-noti-csrf", "1")
        .header("content-type", "application/json")
        .header("cookie", user);
    if internal {
        req = req.header("authorization", format!("Bearer {SECRET}"));
    }
    if let Some(key) = key {
        req = req.header("idempotency-key", key.to_string());
    }
    let response = crate::router(s.clone())
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    if path.ends_with("/context") || path.contains("/chunks") {
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    let value = serde_json::from_slice(&bytes).unwrap();
    (status, value)
}
#[allow(clippy::too_many_arguments)]
async fn upload(
    s: &AppState,
    i: Uuid,
    source: Uuid,
    user: &str,
    text: &str,
    lang: &str,
    label: &str,
    key: Uuid,
) -> (StatusCode, Value) {
    let metadata =
        json!({"label":label,"language":lang,"effective_from":null,"effective_until":null});
    let body = format!(
        "--synthetic-boundary\r\nContent-Disposition: form-data; name=\"metadata\"\r\n\r\n{metadata}\r\n--synthetic-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"synthetic.txt\"\r\nContent-Type: text/plain\r\n\r\n{text}\r\n--synthetic-boundary--\r\n"
    );
    let req = Request::builder()
        .method("POST")
        .uri(format!(
            "/api/v1/institutions/{i}/sources/{source}/versions"
        ))
        .header("origin", "http://localhost:3000")
        .header("x-noti-csrf", "1")
        .header("cookie", user)
        .header("idempotency-key", key.to_string())
        .header(
            "content-type",
            "multipart/form-data; boundary=synthetic-boundary",
        )
        .body(Body::from(body))
        .unwrap();
    let r = crate::router(s.clone()).oneshot(req).await.unwrap();
    (
        r.status(),
        serde_json::from_slice(&to_bytes(r.into_body(), 1024 * 1024).await.unwrap()).unwrap(),
    )
}
fn id(v: &Value, key: &str) -> Uuid {
    serde_json::from_value(v[key].clone()).unwrap()
}

#[test]
fn strict_generation_and_bilingual_metadata() {
    let chunk = Uuid::new_v4();
    let generated = json!({"claims":[{"text":"Synthetic factual claim.","evidence_ids":[chunk]}]});
    let response = json!({"model":"synthetic-model","status":"completed","output":[{"type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":generated.to_string()}]}],"usage":{"input_tokens":1,"output_tokens":2,"total_tokens":3}});
    assert!(
        crate::providers::validate_generation(
            &serde_json::to_vec(&response).unwrap(),
            "synthetic-model"
        )
        .is_ok()
    );
    for (field, value) in [
        ("model", json!("wrong-model")),
        ("status", json!("incomplete")),
        (
            "usage",
            json!({"input_tokens":1,"output_tokens":4097,"total_tokens":4098}),
        ),
        (
            "output",
            json!([{"type":"function_call","name":"unauthorized"}]),
        ),
    ] {
        let mut invalid = response.clone();
        invalid[field] = value;
        assert!(
            crate::providers::validate_generation(
                &serde_json::to_vec(&invalid).unwrap(),
                "synthetic-model"
            )
            .is_err()
        );
    }
    let metadata: crate::ingestion::Metadata = serde_json::from_value(
        json!({"label":"Synthetic","effective_from":null,"effective_until":null}),
    )
    .unwrap();
    assert_eq!(serde_json::to_value(metadata).unwrap()["language"], "en");
    let text = format!(
        "{}\r\n{}",
        "Dữ liệu thử nghiệm. ".repeat(150),
        " ".repeat(2000)
    );
    let chunks = crate::ingestion::text_chunks(text.as_bytes()).unwrap();
    assert_eq!(chunks.concat(), text);
    assert!(chunks.iter().all(|c| c.len() <= 8000));
    assert!(
        crate::ingestion::text_chunks(b"   \r\n")
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
#[ignore = "requires the dedicated migrated api2 DB and the campaign services.lock"]
async fn runtime_sql_and_complete_pipeline() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(12)
        .connect(DB)
        .await
        .unwrap();
    let who = sqlx::query("SELECT current_database() db,current_user role,(SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname=current_user) privileged").fetch_one(&pool).await.unwrap();
    assert_eq!(who.get::<String, _>("db"), "noti_school_test_api2");
    assert_eq!(who.get::<String, _>("role"), "noti_school_api");
    assert!(!who.get::<bool, _>("privileged"));
    assert!(
        sqlx::query("SELECT * FROM auth.session")
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("DELETE FROM product.ai_reservations WHERE false")
            .execute(&pool)
            .await
            .is_err()
    );
    let migration = sqlx::PgPool::connect(MIGRATOR).await.unwrap();
    let marker: String = sqlx::query_scalar(
        "SELECT purpose FROM noti_meta.identity WHERE singleton AND project='noti.school'",
    )
    .fetch_one(&migration)
    .await
    .unwrap();
    assert_eq!(marker, "test");
    for (provider, model, component, rate) in [
        (
            "openai",
            "text-embedding-3-small",
            "embedding_tokens",
            1000i64,
        ),
        ("openai", "synthetic-model", "input_tokens", 1000),
        ("openai", "synthetic-model", "output_tokens", 1000),
        ("jev", "jev-1.13.0", "jev_input_tokens", 1000),
        ("jev", "jev-1.13.0", "jev_output_tokens", 0),
    ] {
        sqlx::query("INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES($1,$2,$3,$4,$5,now()-interval '1 minute',now()+interval '1 hour','https://example.invalid/synthetic-priced-fixture')")
            .bind(format!("synthetic-{}",Uuid::new_v4())).bind(provider).bind(model).bind(component).bind(rate).execute(&migration).await.unwrap();
    }
    migration.close().await;
    let i = Uuid::new_v4();
    let other = Uuid::new_v4();
    let admin = format!("synthetic-admin-{}", Uuid::new_v4());
    let student = format!("synthetic-student-{}", Uuid::new_v4());
    let outsider = format!("synthetic-other-{}", Uuid::new_v4());
    for institution in [i, other] {
        sqlx::query("INSERT INTO product.institutions(id,slug,name) VALUES($1,$2,'Synthetic institution; not a real policy corpus')").bind(institution).bind(format!("synthetic-{institution}")).execute(&pool).await.unwrap();
    }
    for (institution, user, role) in [
        (i, &admin, "admin"),
        (i, &student, "student"),
        (other, &outsider, "student"),
    ] {
        sqlx::query(
            "INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,$3)",
        )
        .bind(institution)
        .bind(user)
        .bind(role)
        .execute(&pool)
        .await
        .unwrap();
    }
    let revoked = Arc::new(AtomicUsize::new(0));
    let revoked_mock = revoked.clone();
    let identity = Router::new().route("/internal/session",post(move |h:HeaderMap| {
        let revoked=revoked_mock.clone();
        async move {
            assert_eq!(h["authorization"],format!("Bearer {SECRET}"));
            if revoked.load(Ordering::SeqCst)>0 {return (StatusCode::UNAUTHORIZED,Json(json!({})));}
            let user=h.get("cookie").unwrap().to_str().unwrap();
            (StatusCode::OK,Json(json!({"user_id":user,"session_id":"synthetic-session","email_verified":true,"expires_at":(chrono::Utc::now()+chrono::Duration::hours(1)).to_rfc3339()})))
        }
    })).route("/internal/capabilities",post(|h:HeaderMap| async move {
        assert_eq!(h["authorization"],format!("Bearer {SECRET}"));
        assert_eq!(h["host"],"127.0.0.1:3811");
        Json(json!({"identity":{"state":"available","reason":"ready"},"google":{"state":"available","reason":"ready"},"email":{"state":"disabled","reason":"not_configured"}}))
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3811")
        .await
        .expect("campaign services.lock required; never contact an existing service");
    let identity_task = tokio::spawn(async move { axum::serve(listener, identity).await.unwrap() });
    let hits = Arc::new(AtomicUsize::new(0));
    let mode = Arc::new(AtomicUsize::new(0));
    let hits_mock = hits.clone();
    let mode_mock = mode.clone();
    let provider=Router::new().fallback(post(move |uri:axum::http::Uri,Json(b):Json<Value>| {
        let hits=hits_mock.clone(); let mode=mode_mock.clone();
        async move {
            hits.fetch_add(1,Ordering::SeqCst);
            let m=mode.load(Ordering::SeqCst);
            if m==4 {tokio::time::sleep(Duration::from_secs(1)).await;}
            if uri.path().ends_with("embeddings") {
                if m==6 {return (StatusCode::OK,Json(json!({"model":"text-embedding-3-small","data":[{"index":1,"embedding":vec![0.01f32;1536]}],"usage":{"prompt_tokens":10,"total_tokens":10}})));}
                return (StatusCode::OK,Json(json!({"model":"text-embedding-3-small","data":[{"index":0,"embedding":vec![0.01f32;1536]}],"usage":{"prompt_tokens":10,"total_tokens":10}})));
            }
            if uri.path().ends_with("systemone") {
                if m==3 {return (StatusCode::SERVICE_UNAVAILABLE,Json(json!({})));}
                let answers: serde_json::Map<String,Value>=b["questions"].as_object().unwrap().keys().map(|k| {
                    let n=if k=="conflict" {if m==2{0.99}else{0.0}} else if (k.starts_with("claim_") && m==1) || m==8 {0.01}else{0.99};
                    (k.clone(),json!({"type":"noul","noul":n}))
                }).collect();
                if b["questions"].get("claim_0").is_some() {
                    assert!(b["state"]["claims"][0]["text"].is_string());
                    assert!(b["state"]["evidence"][0]["quote"].is_string());
                    assert!(b["questions"]["claim_0"]["instructions"].as_str().unwrap().contains("ONLY"));
                }
                return (StatusCode::OK,Json(json!({"model":"jev-1.13.0","answers":answers,"usage":{"input_tokens":20,"output_tokens":5}})));
            }
            assert_eq!(uri.path(),"/v1/responses");
            assert_eq!(b["store"],false); assert!(b.get("tools").is_none());
            let input:Value=serde_json::from_str(b["input"].as_str().unwrap()).unwrap();
            let text=if m==1 {"An unsupported invented claim."}else{input["evidence"][0]["quote"].as_str().unwrap()};
            let evidence_id=if m==5 {json!(Uuid::new_v4())}else{input["evidence"][0]["id"].clone()};
            let generated=json!({"claims":[{"text":text,"evidence_ids":[evidence_id]}]});
            (StatusCode::OK,Json(json!({"model":b["model"],"status":"completed","output":[{"type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":generated.to_string()}]}],"usage":{"input_tokens":30,"output_tokens":20,"total_tokens":50}})))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let provider_task = tokio::spawn(async move { axum::serve(listener, provider).await.unwrap() });
    let upload_dir = format!(
        "{}/tests/api/.uploads-{}",
        env!("CARGO_MANIFEST_DIR"),
        Uuid::new_v4()
    );
    let vars = HashMap::from([
        ("DATABASE_URL".into(), DB.into()),
        ("INTERNAL_AUTH_SECRET".into(), SECRET.into()),
        ("AI_MODE".into(), "live".into()),
        ("AI_LIVE_CALLS_ENABLED".into(), "true".into()),
        ("OPENAI_API_KEY".into(), "synthetic-only".into()),
        ("TYPESAFE_API_KEY".into(), "synthetic-only".into()),
        ("OPENAI_CHAT_MODEL".into(), "synthetic-model".into()),
        ("UPLOAD_DIR".into(), upload_dir.clone()),
    ]);
    let mut s = AppState::new(Config::parse(&vars).unwrap()).unwrap();
    s.providers.endpoint = Some(endpoint);
    let (status, caps) = call(&s, "GET", "/api/v1/capabilities", &student, json!({}), None).await;
    assert_eq!(status, 200);
    assert_eq!(caps["answers"]["state"], "available");
    assert_eq!(caps["google"]["state"], "available");
    let source_path = format!("/api/v1/institutions/{i}/sources");
    let (status, source) = call(
        &s,
        "POST",
        &source_path,
        &admin,
        json!({"title":"Synthetic bilingual fixture","kind":"text","visibility":"institution"}),
        None,
    )
    .await;
    assert_eq!(status, 201, "{source}");
    let source_id = id(&source, "id");
    assert_eq!(
        call(
            &s,
            "POST",
            &source_path,
            &student,
            json!({"title":"No","kind":"text","visibility":"institution"}),
            None
        )
        .await
        .0,
        403
    );
    assert_eq!(
        call(&s, "GET", &source_path, &outsider, json!({}), None)
            .await
            .0,
        404
    );
    let upload_key = Uuid::new_v4();
    let text = "Synthetic fixture: the fictional office accepts blue forms. Đây là dữ liệu thử nghiệm, không phải quy định đại học.";
    let (status, job) = upload(
        &s,
        i,
        source_id,
        &admin,
        text,
        "vi",
        "Synthetic v1",
        upload_key,
    )
    .await;
    assert_eq!(status, 202, "{job}");
    assert_eq!(job["state"], "queued");
    let version = id(&job, "version_id");
    assert_eq!(
        upload(
            &s,
            i,
            source_id,
            &admin,
            text,
            "vi",
            "Synthetic v1",
            upload_key
        )
        .await
        .1,
        job
    );
    assert_eq!(
        upload(
            &s,
            i,
            source_id,
            &admin,
            text,
            "vi",
            "Synthetic duplicate",
            Uuid::new_v4()
        )
        .await
        .0,
        409
    );
    let before_index = hits.load(Ordering::SeqCst);
    let (worker_one, worker_two) = tokio::join!(crate::worker::tick(&s), crate::worker::tick(&s));
    let worker_one = worker_one.unwrap();
    let worker_two = worker_two.unwrap();
    assert!(worker_one || worker_two);
    assert_eq!(
        hits.load(Ordering::SeqCst) - before_index,
        1,
        "concurrent workers dispatch a chunk once"
    );
    let chunk =
        sqlx::query("SELECT id,language,embedding_model FROM product.chunks WHERE version_id=$1")
            .bind(version)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(chunk.get::<String, _>("language"), "vi");
    assert_eq!(
        chunk.get::<String, _>("embedding_model"),
        "text-embedding-3-small"
    );
    let chunk_id: Uuid = chunk.get("id");
    // Simulate a crash after paid settlement but before applying its embedding to the chunk.
    sqlx::query("UPDATE product.chunks SET embedding=NULL,embedding_model=NULL WHERE id=$1")
        .bind(chunk_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("UPDATE product.ingestion_jobs SET state='queued' WHERE id=$1")
        .bind(id(&job, "id"))
        .execute(&pool)
        .await
        .unwrap();
    let before_recovery = hits.load(Ordering::SeqCst);
    assert!(crate::worker::tick(&s).await.unwrap());
    assert_eq!(
        hits.load(Ordering::SeqCst),
        before_recovery,
        "recovery reuses a committed result without another HTTP call"
    );
    assert!(
        sqlx::query("UPDATE product.chunks SET language='en' WHERE id=$1")
            .bind(chunk_id)
            .execute(&pool)
            .await
            .is_err()
    );
    let action_path = format!("/api/v1/institutions/{i}/versions/{version}/actions");
    assert_eq!(
        call(
            &s,
            "POST",
            &action_path,
            &admin,
            json!({"action":"approve","expected_status":"pending_review"}),
            None
        )
        .await
        .0,
        202
    );
    let ask = json!({"institution_id":i,"question":"What does the synthetic office accept?","language":"en"});
    let key = Uuid::new_v4();
    let before = hits.load(Ordering::SeqCst);
    let (status, answer) = call(
        &s,
        "POST",
        "/api/v1/answers",
        &student,
        ask.clone(),
        Some(key),
    )
    .await;
    assert_eq!(status, 200, "{answer}");
    assert_eq!(answer["status"], "answered");
    assert_eq!(hits.load(Ordering::SeqCst) - before, 4);
    let (chunk_page, feedback_context) = repairs::runtime_repairs(
        &s, &pool, i, other, &admin, &student, &outsider, &source, &answer, &hits,
    )
    .await;
    assert_eq!(
        answer["claims"][0]["evidence_ids"][0],
        answer["evidence"][0]["id"]
    );
    let count = hits.load(Ordering::SeqCst);
    assert_eq!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(key)
        )
        .await
        .1,
        answer
    );
    assert_eq!(hits.load(Ordering::SeqCst), count);
    let stage_count:i64=sqlx::query_scalar("SELECT count(*) FROM product.pipeline_stages p JOIN product.idempotency_keys k ON k.operation_id=p.root_operation_id WHERE k.key=$1").bind(key).fetch_one(&pool).await.unwrap();
    assert_eq!(stage_count, 4);
    let embedding_units:i64=sqlx::query_scalar("SELECT (r.plan->0->>'units')::bigint FROM product.ai_reservations r JOIN product.pipeline_stages p ON p.id=r.operation_id JOIN product.idempotency_keys k ON k.operation_id=p.root_operation_id WHERE k.key=$1 AND p.stage='question_embedding'").bind(key).fetch_one(&pool).await.unwrap();
    assert_eq!(
        embedding_units, 16_000,
        "accepted UTF-8 bytes, not scalar count, bound the reservation"
    );
    let stages_settled:i64=sqlx::query_scalar("SELECT count(*) FROM product.ai_reservations r JOIN product.pipeline_stages p ON p.id=r.operation_id JOIN product.idempotency_keys k ON k.operation_id=p.root_operation_id WHERE k.key=$1 AND r.state='settled'").bind(key).fetch_one(&pool).await.unwrap();
    assert_eq!(stages_settled, 4);
    let other_key = Uuid::new_v4();
    let (a, b) = tokio::join!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(other_key)
        ),
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(other_key)
        )
    );
    assert!([a.0, b.0].contains(&StatusCode::OK));
    assert!(
        [a.0, b.0]
            .iter()
            .all(|x| [StatusCode::OK, StatusCode::CONFLICT].contains(x))
    );
    assert_eq!(hits.load(Ordering::SeqCst) - count, 4);
    let (status,vietnamese)=call(&s,"POST","/api/v1/answers",&student,json!({"institution_id":i,"question":"Văn phòng giả định chấp nhận mẫu nào?","language":"vi"}),Some(Uuid::new_v4())).await;
    assert_eq!(status, 200, "{vietnamese}");
    assert_eq!(vietnamese["language"], "vi");
    assert_eq!(vietnamese["status"], "answered");
    // A disconnected HTTP caller cannot cancel and erase a committed paid operation.
    mode.store(4, Ordering::SeqCst);
    let disconnect_key = Uuid::new_v4();
    let initial_hits = hits.load(Ordering::SeqCst);
    let caller_state = s.clone();
    let caller_student = student.clone();
    let caller_ask = ask.clone();
    let caller = tokio::spawn(async move {
        call(
            &caller_state,
            "POST",
            "/api/v1/answers",
            &caller_student,
            caller_ask,
            Some(disconnect_key),
        )
        .await
    });
    for _ in 0..100 {
        if hits.load(Ordering::SeqCst) > initial_hits {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(hits.load(Ordering::SeqCst) > initial_hits);
    caller.abort();
    let _ = caller.await;
    let mut completed = false;
    for _ in 0..100 {
        completed = sqlx::query_scalar(
            "SELECT state='completed' FROM product.idempotency_keys WHERE key=$1",
        )
        .bind(disconnect_key)
        .fetch_one(&pool)
        .await
        .unwrap();
        if completed {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(completed, "detached pipeline must persist completion");
    mode.store(0, Ordering::SeqCst);
    for (m, expected) in [(1, "abstained"), (2, "abstained"), (8, "abstained")] {
        mode.store(m, Ordering::SeqCst);
        let (status, value) = call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(Uuid::new_v4()),
        )
        .await;
        assert_eq!(status, 200, "{value}");
        assert_eq!(value["status"], expected);
        assert_eq!(value["claims"], json!([]));
    }
    for (m, calls) in [(5, 3), (6, 1)] {
        mode.store(m, Ordering::SeqCst);
        let before = hits.load(Ordering::SeqCst);
        assert_eq!(
            call(
                &s,
                "POST",
                "/api/v1/answers",
                &student,
                ask.clone(),
                Some(Uuid::new_v4())
            )
            .await
            .0,
            503
        );
        assert_eq!(
            hits.load(Ordering::SeqCst) - before,
            calls,
            "malformed embeddings or invented IDs must stop the pipeline"
        );
    }
    mode.store(3, Ordering::SeqCst);
    s.providers.expire_cooldown();
    let error_key = Uuid::new_v4();
    let before = hits.load(Ordering::SeqCst);
    assert_eq!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(error_key)
        )
        .await
        .0,
        503
    );
    assert_eq!(
        hits.load(Ordering::SeqCst) - before,
        2,
        "Jev outage must stop before generation"
    );
    assert_eq!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(error_key)
        )
        .await
        .0,
        409
    );
    mode.store(0, Ordering::SeqCst);
    let answer_id = id(&answer, "id");
    let (_, failed_caps) = call(&s, "GET", "/api/v1/capabilities", &student, json!({}), None).await;
    assert_eq!(failed_caps["answers"]["reason"], "provider_failed");
    assert_eq!(failed_caps["indexing"]["reason"], "provider_failed");
    let cooldown_hits = hits.load(Ordering::SeqCst);
    let cooldown_key = Uuid::new_v4();
    assert_eq!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(cooldown_key)
        )
        .await
        .0,
        503
    );
    assert_eq!(hits.load(Ordering::SeqCst), cooldown_hits);
    let cooldown_roots: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product.idempotency_keys WHERE key=$1")
            .bind(cooldown_key)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cooldown_roots, 0);
    s.providers.expire_cooldown();
    assert_eq!(
        call(&s, "GET", "/api/v1/capabilities", &student, json!({}), None)
            .await
            .1["answers"]["reason"],
        "provider_failed"
    );
    assert_eq!(
        call(
            &s,
            "POST",
            "/api/v1/answers",
            &student,
            ask.clone(),
            Some(cooldown_key)
        )
        .await
        .0,
        200
    );
    assert_eq!(
        call(&s, "GET", "/api/v1/capabilities", &student, json!({}), None)
            .await
            .1["answers"]["state"],
        "available"
    );
    let conv = id(&answer, "conversation_id");
    assert_eq!(
        call(
            &s,
            "GET",
            &format!("/api/v1/institutions/{i}/answers/{answer_id}"),
            &admin,
            json!({}),
            None
        )
        .await
        .0,
        404,
        "admin cannot read student's conversation"
    );
    let (_, history) = call(
        &s,
        "GET",
        &format!("/api/v1/institutions/{i}/conversations"),
        &student,
        json!({}),
        None,
    )
    .await;
    assert!(
        history["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"] == conv.to_string())
    );
    let (_, admin_history) = call(
        &s,
        "GET",
        &format!("/api/v1/institutions/{i}/conversations"),
        &admin,
        json!({}),
        None,
    )
    .await;
    assert_eq!(admin_history["items"], json!([]));
    let (_, entity1) = call(
        &s,
        "POST",
        &format!("/api/v1/institutions/{i}/graph/entities"),
        &admin,
        json!({"kind":"office","label":"Synthetic office"}),
        None,
    )
    .await;
    let (_, entity2) = call(
        &s,
        "POST",
        &format!("/api/v1/institutions/{i}/graph/entities"),
        &admin,
        json!({"kind":"form","label":"Synthetic form"}),
        None,
    )
    .await;
    let (status,edge)=call(&s,"POST",&format!("/api/v1/institutions/{i}/graph/edges"),&admin,json!({"from_entity_id":entity1["id"],"to_entity_id":entity2["id"],"relation":"accepts","evidence_chunk_id":chunk_id}),None).await;
    assert_eq!(status, 201, "{edge}");
    assert_eq!(edge["status"], "candidate");
    let edge_id = id(&edge, "id");
    let (_, graph_before) = call(
        &s,
        "GET",
        &format!("/api/v1/institutions/{i}/graph"),
        &student,
        json!({}),
        None,
    )
    .await;
    assert_eq!(graph_before["items"], json!([]));
    let (status, approved_edge) = call(
        &s,
        "PATCH",
        &format!("/api/v1/institutions/{i}/graph/edges/{edge_id}"),
        &admin,
        json!({"status":"approved"}),
        None,
    )
    .await;
    assert_eq!(status, 200, "{approved_edge}");
    assert_eq!(
        approved_edge["evidence"][0]["chunk_id"],
        chunk_id.to_string()
    );
    let (_, graph) = call(
        &s,
        "GET",
        &format!("/api/v1/institutions/{i}/graph"),
        &student,
        json!({}),
        None,
    )
    .await;
    assert_eq!(graph["items"].as_array().unwrap().len(), 1);
    sqlx::query("UPDATE product.sources SET visibility='admin' WHERE id=$1")
        .bind(source_id)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        call(
            &s,
            "GET",
            &format!("/api/v1/institutions/{i}/answers/{answer_id}"),
            &student,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    assert!(
        crate::pipeline::candidates(&s, i, &student, "synthetic", &vec![0.01; 1536])
            .await
            .unwrap()
            .is_empty()
    );
    sqlx::query("UPDATE product.sources SET visibility='institution' WHERE id=$1")
        .bind(source_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE product.source_versions SET effective_until=now()-interval '1 second' WHERE id=$1",
    )
    .bind(version)
    .execute(&pool)
    .await
    .unwrap();
    assert!(
        crate::pipeline::candidates(&s, i, &student, "synthetic", &vec![0.01; 1536])
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        call(
            &s,
            "GET",
            &format!("/api/v1/institutions/{i}/answers/{answer_id}"),
            &student,
            json!({}),
            None
        )
        .await
        .0,
        200,
        "historical answers preserve original provenance"
    );
    sqlx::query("UPDATE product.source_versions SET effective_until=NULL WHERE id=$1")
        .bind(version)
        .execute(&pool)
        .await
        .unwrap();
    let (_, job2) = upload(
        &s,
        i,
        source_id,
        &admin,
        "Synthetic replacement: use green forms.",
        "en",
        "Synthetic v2",
        Uuid::new_v4(),
    )
    .await;
    let v2 = id(&job2, "version_id");
    assert!(crate::worker::tick(&s).await.unwrap());
    assert_eq!(
        call(
            &s,
            "POST",
            &format!("/api/v1/institutions/{i}/versions/{v2}/actions"),
            &admin,
            json!({"action":"approve","expected_status":"pending_review"}),
            None
        )
        .await
        .0,
        202
    );
    let old_status: String =
        sqlx::query_scalar("SELECT status FROM product.source_versions WHERE id=$1")
            .bind(version)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        old_status, "approved",
        "approval cannot flip another version"
    );
    let candidates = crate::pipeline::candidates(&s, i, &student, "synthetic", &vec![0.01; 1536])
        .await
        .unwrap();
    assert!(candidates.iter().all(|v| v["version_id"] == v2.to_string()));
    assert_eq!(
        call(
            &s,
            "POST",
            &action_path,
            &admin,
            json!({"action":"archive","expected_status":"approved"}),
            None
        )
        .await
        .0,
        202
    );
    let current: Uuid =
        sqlx::query_scalar("SELECT current_version_id FROM product.sources WHERE id=$1")
            .bind(source_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(current, v2);
    // Four current documents make a one-hop graph candidate observably different from top-three RRF.
    for n in 0..3 {
        let (_,new_source)=call(&s,"POST",&source_path,&admin,json!({"title":format!("Synthetic graph {n}"),"kind":"text","visibility":"institution"}),None).await;
        let new_source_id = id(&new_source, "id");
        let (_, new_job) = upload(
            &s,
            i,
            new_source_id,
            &admin,
            &format!("Synthetic graph passage {n}."),
            "en",
            "Synthetic graph version",
            Uuid::new_v4(),
        )
        .await;
        let new_version = id(&new_job, "version_id");
        assert!(crate::worker::tick(&s).await.unwrap());
        assert_eq!(
            call(
                &s,
                "POST",
                &format!("/api/v1/institutions/{i}/versions/{new_version}/actions"),
                &admin,
                json!({"action":"approve","expected_status":"pending_review"}),
                None
            )
            .await
            .0,
            202
        );
    }
    let eligible: Vec<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT c.id {} ORDER BY c.id",
        crate::pipeline::CURRENT
    )))
    .bind(i)
    .bind(&student)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(eligible.len(), 4);
    let seed = eligible[0];
    let target = eligible[3];
    let baseline =
        crate::pipeline::candidates(&s, i, &student, "zzzz-no-lexical-hit", &vec![0.01; 1536])
            .await
            .unwrap();
    assert_eq!(baseline.len(), 3);
    assert!(baseline.iter().all(|e| e["id"] != target.to_string()));
    let mut expanded_edges = Vec::new();
    for chunk in [seed, target] {
        let (_,candidate)=call(&s,"POST",&format!("/api/v1/institutions/{i}/graph/edges"),&admin,json!({"from_entity_id":entity1["id"],"to_entity_id":entity2["id"],"relation":"synthetic-related","evidence_chunk_id":chunk}),None).await;
        let candidate_id = id(&candidate, "id");
        expanded_edges.push(candidate_id);
        assert_eq!(
            call(
                &s,
                "PATCH",
                &format!("/api/v1/institutions/{i}/graph/edges/{candidate_id}"),
                &admin,
                json!({"status":"approved"}),
                None
            )
            .await
            .0,
            200
        );
    }
    let expanded =
        crate::pipeline::candidates(&s, i, &student, "zzzz-no-lexical-hit", &vec![0.01; 1536])
            .await
            .unwrap();
    assert_eq!(expanded.len(), 4);
    assert!(expanded.iter().any(|e| e["id"] == target.to_string()));
    assert_eq!(
        call(
            &s,
            "PATCH",
            &format!("/api/v1/institutions/{i}/graph/edges/{}", expanded_edges[1]),
            &admin,
            json!({"status":"rejected"}),
            None
        )
        .await
        .0,
        200
    );
    assert_eq!(
        crate::pipeline::candidates(&s, i, &student, "zzzz-no-lexical-hit", &vec![0.01; 1536])
            .await
            .unwrap()
            .len(),
        3
    );
    assert_eq!(call(&s,"POST",&format!("/api/v1/institutions/{other}/graph/edges"),&admin,json!({"from_entity_id":entity1["id"],"to_entity_id":entity2["id"],"relation":"forbidden","evidence_chunk_id":chunk_id}),None).await.0,404);
    // A disabled upload can explicitly recover after configuration and an expired indexing window.
    let mut disabled = s.clone();
    let mut disabled_config = (*s.config).clone();
    disabled_config.mode = "disabled".into();
    disabled.config = Arc::new(disabled_config);
    let (_, disabled_job) = upload(
        &disabled,
        i,
        source_id,
        &admin,
        "Synthetic retry after configuration activated.",
        "en",
        "Synthetic retry",
        Uuid::new_v4(),
    )
    .await;
    assert_eq!(disabled_job["state"], "disabled");
    sqlx::query("UPDATE product.idempotency_keys SET expires_at=now()-interval '1 day' WHERE operation_id=$1").bind(id(&disabled_job,"id")).execute(&pool).await.unwrap();
    let retry_version = id(&disabled_job, "version_id");
    let (retry_status, retry_job) = call(
        &s,
        "POST",
        &format!("/api/v1/institutions/{i}/versions/{retry_version}/actions"),
        &admin,
        json!({"action":"retry_index","expected_status":"pending_review"}),
        None,
    )
    .await;
    assert_eq!(retry_status, 202, "{retry_job}");
    assert!(crate::worker::tick(&s).await.unwrap());
    let recovered: String =
        sqlx::query_scalar("SELECT indexing FROM product.source_versions WHERE id=$1")
            .bind(retry_version)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(recovered, "ready");
    let (_, quarantine) = upload(
        &s,
        i,
        source_id,
        &admin,
        "   ",
        "en",
        "Synthetic no text",
        Uuid::new_v4(),
    )
    .await;
    let quarantined: String =
        sqlx::query_scalar("SELECT status FROM product.source_versions WHERE id=$1")
            .bind(id(&quarantine, "version_id"))
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(quarantined, "quarantined");
    let unsafe_source = Uuid::new_v4();
    sqlx::query("INSERT INTO product.sources(id,institution_id,title,kind,original_url,visibility) VALUES($1,$2,'Synthetic SSRF boundary fixture','url','https://127.0.0.1/private','admin')").bind(unsafe_source).bind(i).execute(&pool).await.unwrap();
    assert_eq!(
        call(
            &s,
            "POST",
            &format!("/api/v1/institutions/{i}/sources/{unsafe_source}/fetch"),
            &admin,
            json!({"label":"Synthetic denied fetch","effective_from":null,"effective_until":null}),
            Some(Uuid::new_v4())
        )
        .await
        .0,
        403
    );
    // A cancelled paid call keeps its committed dispatch; even concurrent stage attempts cannot resend.
    let root = Uuid::new_v4();
    sqlx::query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state) VALUES($1,$2,$3,$4,$3,'pending')").bind(i).bind(&student).bind(root).bind("a".repeat(64)).execute(&pool).await.unwrap();
    let (one, two) = tokio::join!(
        Attempt::reserve(
            &pool,
            i,
            &student,
            root,
            "cancel",
            b"synthetic",
            OperationKind::Embedding,
            "synthetic-model"
        ),
        Attempt::reserve(
            &pool,
            i,
            &student,
            root,
            "cancel",
            b"synthetic",
            OperationKind::Embedding,
            "synthetic-model"
        )
    );
    assert_ne!(one.is_ok(), two.is_ok());
    let attempt = one.or(two).unwrap();
    mode.store(4, Ordering::SeqCst);
    assert!(
        tokio::time::timeout(
            Duration::from_millis(20),
            s.providers.embedding("synthetic", "synthetic", attempt)
        )
        .await
        .is_err()
    );
    let state:String=sqlx::query_scalar("SELECT r.state FROM product.ai_reservations r JOIN product.pipeline_stages p ON p.id=r.operation_id WHERE p.root_operation_id=$1").bind(root).fetch_one(&pool).await.unwrap();
    assert_eq!(state, "dispatched");
    assert!(
        Attempt::reserve(
            &pool,
            i,
            &student,
            root,
            "cancel",
            b"synthetic",
            OperationKind::Embedding,
            "synthetic-model"
        )
        .await
        .is_err()
    );
    mode.store(0, Ordering::SeqCst);
    // Invitation redemption uses actual non-owner SQL and a single-use token under contention.
    use hmac::{Hmac, Mac};
    use sha2::{Digest, Sha256};
    let token = Uuid::new_v4().to_string();
    let email = "synthetic-invite@example.invalid";
    let mut mac = Hmac::<Sha256>::new_from_slice(SECRET.as_bytes()).unwrap();
    mac.update(email.as_bytes());
    sqlx::query("INSERT INTO product.invitations(id,institution_id,token_hash,email_hash,role,expires_at,created_by) VALUES($1,$2,$3,$4,'student',now()+interval '1 hour',$5)")
        .bind(Uuid::new_v4()).bind(i).bind(format!("{:x}",Sha256::digest(token.as_bytes()))).bind(format!("{:x}",mac.finalize().into_bytes())).bind(&admin).execute(&pool).await.unwrap();
    let body = json!({"token":token,"email":email,"user_id":format!("synthetic-redeemed-{}",Uuid::new_v4()),"email_verified":true});
    assert_eq!(
        call(
            &s,
            "POST",
            "/internal/invitations/check",
            &admin,
            json!({"token":token,"email":email}),
            None
        )
        .await
        .0,
        200
    );
    let (one, two) = tokio::join!(
        call(
            &s,
            "POST",
            "/internal/invitations/redeem",
            &admin,
            body.clone(),
            None
        ),
        call(
            &s,
            "POST",
            "/internal/invitations/redeem",
            &admin,
            body,
            None
        )
    );
    assert_eq!([one.0, two.0].iter().filter(|s| s.is_success()).count(), 1);
    // The global ceiling is enforced by actual concurrent runtime-role transactions, including free components.
    let input_price:String=sqlx::query_scalar("SELECT id FROM product.ai_prices WHERE model='synthetic-model' AND component='input_tokens' AND effective_at<=clock_timestamp() AND valid_until>clock_timestamp() ORDER BY effective_at DESC LIMIT 1").fetch_one(&pool).await.unwrap();
    let free_price:String=sqlx::query_scalar("SELECT id FROM product.ai_prices WHERE model='jev-1.13.0' AND component='jev_output_tokens' AND effective_at<=clock_timestamp() AND valid_until>clock_timestamp() ORDER BY effective_at DESC LIMIT 1").fetch_one(&pool).await.unwrap();
    let committed:i64=sqlx::query_scalar("SELECT coalesce((SELECT spent_micro_usd FROM product.ai_months WHERE month=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0)+coalesce((SELECT sum(reserved_micro_usd)::bigint FROM product.ai_months),0)").fetch_one(&pool).await.unwrap();
    let expected = (50_000_000 - committed) / 5_000_000;
    let mut tasks = Vec::new();
    for _ in 0..20 {
        let pool = pool.clone();
        let input_price = input_price.clone();
        let free_price = free_price.clone();
        tasks.push(tokio::spawn(async move {
            let reservation=Uuid::new_v4();
            let result=sqlx::query("SELECT product.reserve_ai($1,$2,1,$3)").bind(reservation).bind(Uuid::new_v4()).bind(json!([{"price_id":input_price,"units":5_000_000_000u64},{"price_id":free_price,"units":1}])).execute(&pool).await;
            result.ok().map(|_|reservation)
        }));
    }
    let mut winners = Vec::new();
    for t in tasks {
        if let Some(id) = t.await.unwrap() {
            winners.push(id);
        }
    }
    assert_eq!(winners.len() as i64, expected);
    let winner = winners.pop().unwrap();
    let (one, two) = tokio::join!(
        sqlx::query("SELECT product.mark_ai($1,'dispatched')")
            .bind(winner)
            .execute(&pool),
        sqlx::query("SELECT product.mark_ai($1,'dispatched')")
            .bind(winner)
            .execute(&pool)
    );
    assert_ne!(one.is_ok(), two.is_ok());
    sqlx::query("SELECT product.mark_ai($1,'uncertain')")
        .bind(winner)
        .execute(&pool)
        .await
        .unwrap();
    assert!(
        sqlx::query("SELECT product.mark_ai($1,'released')")
            .bind(winner)
            .execute(&pool)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("SELECT product.settle_ai($1,$2)")
            .bind(winner)
            .bind(json!([{"price_id":input_price,"units":0}]))
            .execute(&pool)
            .await
            .is_err()
    );
    sqlx::query("SELECT product.settle_ai($1,$2)")
        .bind(winner)
        .bind(json!([{"price_id":input_price,"units":0},{"price_id":free_price,"units":0}]))
        .execute(&pool)
        .await
        .unwrap();
    for winner in winners {
        sqlx::query("SELECT product.mark_ai($1,'released')")
            .bind(winner)
            .execute(&pool)
            .await
            .unwrap();
    }
    // A late successful provider reply settles money but cannot restore text after account deletion.
    let late_root = Uuid::new_v4();
    sqlx::query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state) VALUES($1,$2,$3,$4,$3,'pending')").bind(i).bind(&student).bind(late_root).bind("b".repeat(64)).execute(&pool).await.unwrap();
    let late_attempt = Attempt::reserve(
        &pool,
        i,
        &student,
        late_root,
        "late-generation",
        b"synthetic",
        OperationKind::Generation,
        "synthetic-model",
    )
    .await
    .unwrap();
    // Account cleanup is idempotent and removes owned text while retaining cost records.
    assert_eq!(
        call(
            &s,
            "POST",
            "/internal/accounts/delete",
            &student,
            json!({"user_id":student}),
            None
        )
        .await
        .1,
        json!({"deleted":true})
    );
    assert_eq!(
        call(
            &s,
            "POST",
            "/internal/accounts/delete",
            &student,
            json!({"user_id":student}),
            None
        )
        .await
        .1,
        json!({"deleted":true})
    );
    let remaining: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product.conversations WHERE user_id=$1")
            .bind(&student)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(remaining, 0);
    late_attempt
        .settle(
            vec![1, 1],
            json!({"claims":[{"text":"Synthetic personal text must not return"}]}),
        )
        .await
        .unwrap();
    let cached: Option<Value> =
        sqlx::query_scalar("SELECT result FROM product.pipeline_stages WHERE root_operation_id=$1")
            .bind(late_root)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(cached.is_none());
    assert_eq!(
        call(&s, "GET", &source_path, &student, json!({}), None)
            .await
            .0,
        404
    );
    let old = Uuid::new_v4();
    sqlx::query("INSERT INTO product.conversations(id,institution_id,user_id,created_at) VALUES($1,$2,$3,now()-interval '31 days')").bind(old).bind(i).bind(&admin).execute(&pool).await.unwrap();
    assert!(crate::accounts::retain(&s).await.unwrap() > 0);
    revoked.store(1, Ordering::SeqCst);
    assert_eq!(
        call(&s, "GET", &source_path, &admin, json!({}), None)
            .await
            .0,
        401
    );
    // Synthetic runtime SQL and loopback-provider wire fixtures; no live quality claim.
    let artifacts = json!({"Answer":answer,"GraphEdge":approved_edge,"Source":source,"Job":job,"Capabilities":caps,"ChunkPage":chunk_page,"FeedbackContext":feedback_context});
    tokio::fs::write(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../tests/api/pipeline-wire.json"
        ),
        serde_json::to_vec_pretty(&artifacts).unwrap(),
    )
    .await
    .unwrap();
    identity_task.abort();
    provider_task.abort();
    let _ = identity_task.await;
    let _ = provider_task.await;
    tokio::fs::remove_dir_all(upload_dir).await.unwrap();
    s.pool().unwrap().close().await;
    pool.close().await;
    println!(
        "PASS runtime-role SQL, bilingual indexing, complete ask, claim support/conflict, idempotency contention, stage cancellation, graph provenance, visibility/history, invitation contention, account cleanup and retention; mocked providers only"
    );
}
