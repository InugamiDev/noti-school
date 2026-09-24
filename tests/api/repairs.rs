// Synthetic fixtures only. Exercises the actual router and SQL with the existing runtime role.
use super::*;

#[test]
fn unicode_boundary_and_finite_packing() {
    for text in [
        "ế".repeat(4000),
        "🦊".repeat(4000),
        format!("{}?", "\t\n\r".repeat(1333)),
    ] {
        assert!(crate::input::validate(&text).is_ok());
        let packed =
            crate::input::pack(&text, vec![json!({"quote":"x".repeat(20000)}); 4]).unwrap();
        assert!(packed.is_empty());
    }
    for text in [
        "🦊".repeat(4001),
        "x".repeat(4001),
        "x\0".into(),
        "x\u{7f}".into(),
        "x\u{b}".into(),
    ] {
        assert!(crate::input::validate(&text).is_err());
        assert!(crate::input::pack(&text, vec![]).is_err());
    }
    for address in [
        "3fff::1",
        "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff",
        "3fff::",
    ] {
        assert!(!crate::ssrf::public_ip(address.parse().unwrap()));
    }
    assert!(crate::ssrf::public_ip("3fff:1000::1".parse().unwrap()));
}

async fn file_status(s: &AppState, i: Uuid, v: Uuid, user: &str) -> (StatusCode, Vec<u8>) {
    let req = Request::builder()
        .uri(format!("/api/v1/institutions/{i}/versions/{v}/file"))
        .header("cookie", user)
        .body(Body::empty())
        .unwrap();
    let response = crate::router(s.clone()).oneshot(req).await.unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    (
        status,
        to_bytes(response.into_body(), 2 * 1024 * 1024)
            .await
            .unwrap()
            .to_vec(),
    )
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn runtime_repairs(
    s: &AppState,
    pool: &sqlx::PgPool,
    i: Uuid,
    other: Uuid,
    admin: &str,
    student: &str,
    outsider: &str,
    source: &Value,
    answer: &Value,
    hits: &Arc<AtomicUsize>,
) -> (Value, Value) {
    let mut disabled = s.clone();
    let mut config = (*s.config).clone();
    config.mode = "disabled".into();
    disabled.config = Arc::new(config);
    let (_, private_source) = call(s,"POST",&format!("/api/v1/institutions/{i}/sources"),admin,
        json!({"title":"Synthetic never-approved archive","kind":"text","visibility":"institution"}),None).await;
    let source_id = id(&private_source, "id");
    let text = format!("{}{}", "ế🦊".repeat(2000), "end");
    let (status, job) = upload(
        &disabled,
        i,
        source_id,
        admin,
        &text,
        "vi",
        "Synthetic private draft",
        Uuid::new_v4(),
    )
    .await;
    assert_eq!(status, 202, "{job}");
    let v = id(&job, "version_id");
    let base = format!("/api/v1/institutions/{i}");
    let chunks_path = format!("{base}/versions/{v}/chunks");
    let (status, page) = call(s, "GET", &chunks_path, admin, json!({}), None).await;
    assert_eq!(status, 200, "{page}");
    assert_eq!(page["items"].as_array().unwrap().len(), 3);
    for chunk in page["items"].as_array().unwrap() {
        assert_eq!(chunk["locator"]["start_char"], 0);
        assert_eq!(
            chunk["locator"]["end_char"].as_u64().unwrap() as usize,
            chunk["text"].as_str().unwrap().chars().count()
        );
    }
    let first = call(
        s,
        "GET",
        &format!("{chunks_path}?limit=1"),
        admin,
        json!({}),
        None,
    )
    .await
    .1;
    let cursor = first["next_cursor"].as_str().unwrap();
    let second = call(
        s,
        "GET",
        &format!("{chunks_path}?limit=1&cursor={cursor}"),
        admin,
        json!({}),
        None,
    )
    .await
    .1;
    assert_eq!(second["items"][0]["ordinal"], 1);
    assert_eq!(second["items"][0]["locator"]["start_char"], 0);
    assert_eq!(
        call(
            s,
            "GET",
            &format!(
                "{base}/versions/{}/chunks?cursor={cursor}",
                answer["evidence"][0]["version_id"].as_str().unwrap()
            ),
            admin,
            json!({}),
            None
        )
        .await
        .0,
        400
    );
    assert_eq!(
        call(s, "GET", &chunks_path, student, json!({}), None)
            .await
            .0,
        403
    );
    assert_eq!(
        call(s, "GET", &chunks_path, outsider, json!({}), None)
            .await
            .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/versions/{}/chunks", Uuid::new_v4()),
            admin,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    assert_eq!(
        call(
            s,
            "POST",
            &format!("{base}/versions/{v}/actions"),
            admin,
            json!({"action":"archive","expected_status":"pending_review"}),
            None
        )
        .await
        .0,
        202
    );
    // Reproduce the frozen predicate's exposure using actual SQL, then test every repaired route.
    let previously_exposed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM product.source_versions v JOIN product.sources s ON s.id=v.source_id JOIN product.memberships m ON m.institution_id=v.institution_id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE v.id=$1 AND s.visibility='institution' AND v.status IN ('approved','archived') AND v.approved_at IS NULL)")
        .bind(v).bind(student).fetch_one(pool).await.unwrap();
    assert!(previously_exposed);
    let chunk = id(&page["items"][0], "id");
    for path in [
        format!("{base}/versions/{v}"),
        format!("{base}/chunks/{chunk}"),
        format!("{base}/sources/{source_id}"),
    ] {
        assert_eq!(
            call(s, "GET", &path, student, json!({}), None).await.0,
            404,
            "{path}"
        );
        assert_eq!(
            call(s, "GET", &path, admin, json!({}), None).await.0,
            200,
            "{path}"
        );
        assert_eq!(
            call(s, "GET", &path, outsider, json!({}), None).await.0,
            404,
            "{path}"
        );
    }
    assert_eq!(file_status(s, i, v, student).await.0, 404);
    assert_eq!(file_status(s, i, v, admin).await.1, text.as_bytes());
    assert_eq!(file_status(s, other, v, outsider).await.0, 404);
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/sources/{source_id}/versions"),
            student,
            json!({}),
            None
        )
        .await
        .1["items"],
        json!([])
    );
    let listed = call(
        s,
        "GET",
        &format!("{base}/sources"),
        student,
        json!({}),
        None,
    )
    .await
    .1;
    assert!(
        !listed["items"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["id"] == json!(source_id))
    );
    sqlx::query(
        "UPDATE product.memberships SET revoked_at=now() WHERE institution_id=$1 AND user_id=$2",
    )
    .bind(i)
    .bind(admin)
    .execute(pool)
    .await
    .unwrap();
    assert_eq!(
        call(s, "GET", &chunks_path, admin, json!({}), None).await.0,
        404
    );
    assert_eq!(file_status(s, i, v, admin).await.0, 404);
    sqlx::query(
        "UPDATE product.memberships SET revoked_at=NULL WHERE institution_id=$1 AND user_id=$2",
    )
    .bind(i)
    .bind(admin)
    .execute(pool)
    .await
    .unwrap();

    let before_files = std::fs::read_dir(&s.config.uploads).unwrap().count();
    let before_versions: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product.source_versions WHERE source_id=$1")
            .bind(source_id)
            .fetch_one(pool)
            .await
            .unwrap();
    assert_eq!(
        upload(
            &disabled,
            i,
            source_id,
            admin,
            &"x".repeat(512 * 2000 + 1),
            "en",
            "Synthetic rejected 513 chunks",
            Uuid::new_v4()
        )
        .await
        .0,
        413
    );
    assert_eq!(
        std::fs::read_dir(&s.config.uploads).unwrap().count(),
        before_files
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM product.source_versions WHERE source_id=$1"
        )
        .bind(source_id)
        .fetch_one(pool)
        .await
        .unwrap(),
        before_versions
    );
    cleanup_failures(s, &disabled, pool, i, source_id, admin).await;

    let feedback_path = format!("{base}/feedback");
    let (status, feedback) = call(s,"POST",&feedback_path,student,json!({"answer_id":answer["id"],"category":"incorrect","comment":"Synthetic review fixture"}),None).await;
    assert_eq!(status, 201, "{feedback}");
    let report = id(&feedback, "id");
    let context_path = format!("{feedback_path}/{report}/context");
    let (status, context) = call(s, "GET", &context_path, admin, json!({}), None).await;
    assert_eq!(status, 200, "{context}");
    assert_eq!(context["answer"], *answer);
    assert!(context["feedback"].get("user_id").is_none());
    assert_eq!(
        call(s, "GET", &context_path, student, json!({}), None)
            .await
            .0,
        403
    );
    assert_eq!(
        call(s, "GET", &context_path, outsider, json!({}), None)
            .await
            .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/feedback/{}/context", answer["id"].as_str().unwrap()),
            admin,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("/api/v1/institutions/{other}/feedback/{report}/context"),
            admin,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/answers/{}", answer["id"].as_str().unwrap()),
            admin,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    let approved_source = id(source, "id");
    sqlx::query("UPDATE product.sources SET visibility='admin' WHERE id=$1")
        .bind(approved_source)
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(
        call(s, "GET", &context_path, admin, json!({}), None)
            .await
            .0,
        404
    );
    sqlx::query("UPDATE product.sources SET visibility='institution' WHERE id=$1")
        .bind(approved_source)
        .execute(pool)
        .await
        .unwrap();
    for user in [admin, student] {
        sqlx::query("UPDATE product.memberships SET revoked_at=now() WHERE institution_id=$1 AND user_id=$2").bind(i).bind(user).execute(pool).await.unwrap();
        assert_eq!(
            call(s, "GET", &context_path, admin, json!({}), None)
                .await
                .0,
            404
        );
        assert_eq!(
            call(
                s,
                "GET",
                &format!("{base}/versions/{v}"),
                user,
                json!({}),
                None
            )
            .await
            .0,
            404
        );
        assert_eq!(
            call(
                s,
                "GET",
                &format!("{base}/chunks/{chunk}"),
                user,
                json!({}),
                None
            )
            .await
            .0,
            404
        );
        assert_eq!(file_status(s, i, v, user).await.0, 404);
        sqlx::query(
            "UPDATE product.memberships SET revoked_at=NULL WHERE institution_id=$1 AND user_id=$2",
        )
        .bind(i)
        .bind(user)
        .execute(pool)
        .await
        .unwrap();
    }
    // A saved citation to never-approved content must also fail closed.
    let original_chunk: Uuid =
        serde_json::from_value(answer["evidence"][0]["chunk_id"].clone()).unwrap();
    let citation: Uuid = serde_json::from_value(answer["evidence"][0]["id"].clone()).unwrap();
    sqlx::query("UPDATE product.citations SET chunk_id=$2 WHERE id=$1")
        .bind(citation)
        .bind(chunk)
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(
        call(s, "GET", &context_path, admin, json!({}), None)
            .await
            .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/citations/{citation}"),
            student,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("{base}/answers/{}", answer["id"].as_str().unwrap()),
            student,
            json!({}),
            None
        )
        .await
        .0,
        404
    );
    sqlx::query("UPDATE product.citations SET chunk_id=$2 WHERE id=$1")
        .bind(citation)
        .bind(original_chunk)
        .execute(pool)
        .await
        .unwrap();

    sqlx::query("DELETE FROM product.feedback WHERE institution_id=$1 AND id=$2")
        .bind(i)
        .bind(report)
        .execute(pool)
        .await
        .unwrap();
    assert_eq!(
        call(s, "GET", &context_path, admin, json!({}), None)
            .await
            .0,
        404
    );
    let before = hits.load(Ordering::SeqCst);
    for question in ["x\0".into(), "x\u{7f}".into(), "🦊".repeat(4001)] {
        let key = Uuid::new_v4();
        assert_eq!(
            call(
                s,
                "POST",
                "/api/v1/answers",
                student,
                json!({"institution_id":i,"question":question,"language":"vi"}),
                Some(key)
            )
            .await
            .0,
            400
        );
        assert_eq!(
            call(
                s,
                "POST",
                "/api/v1/search",
                student,
                json!({"institution_id":i,"query":question,"language":"vi"}),
                None
            )
            .await
            .0,
            400
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM product.idempotency_keys WHERE key=$1"
            )
            .bind(key)
            .fetch_one(pool)
            .await
            .unwrap(),
            0
        );
    }
    assert_eq!(hits.load(Ordering::SeqCst), before);
    for question in ["ế".repeat(4000), "🦊".repeat(4000)] {
        let (status, response) = call(
            s,
            "POST",
            "/api/v1/answers",
            student,
            json!({"institution_id":i,"question":question,"language":"vi"}),
            Some(Uuid::new_v4()),
        )
        .await;
        assert_eq!(status, 200, "{response}");
        assert_eq!(
            call(
                s,
                "POST",
                "/api/v1/search",
                student,
                json!({"institution_id":i,"query":question,"language":"vi"}),
                None
            )
            .await
            .0,
            200
        );
    }
    recovery(
        s, &disabled, pool, i, source_id, admin, student, outsider, hits,
    )
    .await;
    admission(s, pool, i, student, hits).await;
    (page, context)
}

#[allow(clippy::too_many_arguments)]
async fn recovery(
    s: &AppState,
    disabled: &AppState,
    pool: &sqlx::PgPool,
    i: Uuid,
    source: Uuid,
    admin: &str,
    student: &str,
    outsider: &str,
    hits: &Arc<AtomicUsize>,
) {
    for scenario in 0..4 {
        let delete = scenario != 0;
        let uploader = format!("synthetic-departed-{}", Uuid::new_v4());
        sqlx::query(
            "INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,'admin')",
        )
        .bind(i)
        .bind(&uploader)
        .execute(pool)
        .await
        .unwrap();
        let text = format!("Synthetic recoverable institution original {uploader}");
        let (_, job) = upload(
            disabled,
            i,
            source,
            &uploader,
            &text,
            "en",
            "Synthetic recovery",
            Uuid::new_v4(),
        )
        .await;
        let root = id(&job, "id");
        let version = id(&job, "version_id");
        // A failed job can already have a settled embedding cache, but no applied embedding.
        let mut late = None;
        if scenario < 3 {
            sqlx::query("UPDATE product.ingestion_jobs SET state='running' WHERE id=$1")
                .bind(root)
                .execute(pool)
                .await
                .unwrap();
            let chunk: Uuid =
                sqlx::query_scalar("SELECT id FROM product.chunks WHERE version_id=$1")
                    .bind(version)
                    .fetch_one(pool)
                    .await
                    .unwrap();
            if scenario == 2 {
                late = Some(
                    Attempt::reserve(
                        pool,
                        i,
                        &uploader,
                        root,
                        &format!("chunk_{chunk}"),
                        text.as_bytes(),
                        OperationKind::Embedding,
                        "synthetic-model",
                    )
                    .await
                    .unwrap(),
                );
            } else {
                crate::pipeline::Run {
                    state: s,
                    institution: i,
                    user: &uploader,
                    operation: root,
                }
                .embed(&format!("chunk_{chunk}"), &text)
                .await
                .unwrap();
            }
        }
        sqlx::query("UPDATE product.ingestion_jobs SET state=$2 WHERE id=$1")
            .bind(root)
            .bind(if scenario == 3 { "disabled" } else { "failed" })
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("UPDATE product.source_versions SET indexing='failed' WHERE id=$1")
            .bind(version)
            .execute(pool)
            .await
            .unwrap();
        let old_stages: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM product.pipeline_stages WHERE root_operation_id=$1 ORDER BY id",
        )
        .bind(root)
        .fetch_all(pool)
        .await
        .unwrap();
        if delete {
            assert_eq!(
                call(
                    s,
                    "POST",
                    "/internal/accounts/delete",
                    &uploader,
                    json!({"user_id":uploader}),
                    None
                )
                .await
                .0,
                200
            );
        } else {
            sqlx::query("UPDATE product.memberships SET revoked_at=now() WHERE institution_id=$1 AND user_id=$2").bind(i).bind(&uploader).execute(pool).await.unwrap();
        }
        if let Some(attempt) = late {
            // Only a validated institutional vector survives late settlement; personal text does not.
            attempt
                .settle(vec![10], json!(vec![0.01f32; 1536]))
                .await
                .unwrap();
        }
        let path = format!("/api/v1/institutions/{i}/versions/{version}/actions");
        let retry = json!({"action":"retry_index","expected_status":"pending_review"});
        assert_eq!(
            call(s, "POST", &path, student, retry.clone(), None).await.0,
            403
        );
        assert_eq!(
            call(s, "POST", &path, outsider, retry.clone(), None)
                .await
                .0,
            404
        );
        let (status, recovered) = call(s, "POST", &path, admin, retry.clone(), None).await;
        assert_eq!(status, 202, "{recovered}");
        assert_eq!(recovered["id"], job["id"]);
        let actor:String=sqlx::query_scalar("SELECT response->>'recovery_actor' FROM product.idempotency_keys WHERE operation_id=$1").bind(root).fetch_one(pool).await.unwrap();
        assert_eq!(actor, admin);
        let before = hits.load(Ordering::SeqCst);
        let (a, b) = tokio::join!(crate::worker::tick(s), crate::worker::tick(s));
        assert!(a.unwrap() || b.unwrap());
        assert_eq!(
            hits.load(Ordering::SeqCst) - before,
            usize::from(scenario == 3)
        );
        if scenario < 3 {
            assert_eq!(
                sqlx::query_scalar::<_, Uuid>(
                    "SELECT id FROM product.pipeline_stages WHERE root_operation_id=$1 ORDER BY id"
                )
                .bind(root)
                .fetch_all(pool)
                .await
                .unwrap(),
                old_stages
            );
        }
        assert_eq!(
            sqlx::query_scalar::<_, String>(
                "SELECT indexing FROM product.source_versions WHERE id=$1"
            )
            .bind(version)
            .fetch_one(pool)
            .await
            .unwrap(),
            "ready"
        );
        assert_eq!(call(s, "POST", &path, admin, retry, None).await.0, 409);
    }
    // An old dispatched/uncertain stage cannot be retried under another actor or root.
    for uncertain in [false, true] {
        let uploader = format!("synthetic-fenced-deleted-{}", Uuid::new_v4());
        sqlx::query(
            "INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,'admin')",
        )
        .bind(i)
        .bind(&uploader)
        .execute(pool)
        .await
        .unwrap();
        let (_, job) = upload(
            disabled,
            i,
            source,
            &uploader,
            &format!("Synthetic ambiguous fixture {uncertain}"),
            "en",
            "Synthetic fenced recovery",
            Uuid::new_v4(),
        )
        .await;
        let root = id(&job, "id");
        let version = id(&job, "version_id");
        sqlx::query("UPDATE product.ingestion_jobs SET state='running' WHERE id=$1")
            .bind(root)
            .execute(pool)
            .await
            .unwrap();
        let attempt = Attempt::reserve(
            pool,
            i,
            &uploader,
            root,
            "synthetic-fenced-stage",
            b"synthetic",
            OperationKind::Embedding,
            "synthetic-model",
        )
        .await
        .unwrap();
        drop(attempt);
        if uncertain {
            sqlx::query("SELECT product.mark_ai(r.id,'uncertain') FROM product.ai_reservations r JOIN product.pipeline_stages p ON p.id=r.operation_id WHERE p.root_operation_id=$1").bind(root).execute(pool).await.unwrap();
        }
        assert_eq!(
            call(
                s,
                "POST",
                "/internal/accounts/delete",
                &uploader,
                json!({"user_id":uploader}),
                None
            )
            .await
            .0,
            200
        );
        sqlx::query("UPDATE product.ingestion_jobs SET state='failed' WHERE id=$1")
            .bind(root)
            .execute(pool)
            .await
            .unwrap();
        let before = hits.load(Ordering::SeqCst);
        for _ in 0..2 {
            assert_eq!(
                call(
                    s,
                    "POST",
                    &format!("/api/v1/institutions/{i}/versions/{version}/actions"),
                    admin,
                    json!({"action":"retry_index","expected_status":"pending_review"}),
                    None
                )
                .await
                .0,
                409
            );
        }
        assert_eq!(hits.load(Ordering::SeqCst), before);
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM product.pipeline_stages WHERE root_operation_id=$1"
            )
            .bind(root)
            .fetch_one(pool)
            .await
            .unwrap(),
            1
        );
    }
    // R1-01 is owned by identity/ops: missing roots are an explicit conflict, never a new paid root.
    let (_, job) = upload(
        disabled,
        i,
        source,
        admin,
        "Synthetic missing-root fixture",
        "en",
        "Synthetic lost root",
        Uuid::new_v4(),
    )
    .await;
    let root = id(&job, "id");
    let version = id(&job, "version_id");
    sqlx::query("DELETE FROM product.idempotency_keys WHERE operation_id=$1")
        .bind(root)
        .execute(pool)
        .await
        .unwrap();
    let before = hits.load(Ordering::SeqCst);
    assert_eq!(
        call(
            s,
            "POST",
            &format!("/api/v1/institutions/{i}/versions/{version}/actions"),
            admin,
            json!({"action":"retry_index","expected_status":"pending_review"}),
            None
        )
        .await
        .0,
        409
    );
    assert_eq!(hits.load(Ordering::SeqCst), before);
}

async fn cleanup_failures(
    s: &AppState,
    disabled: &AppState,
    pool: &sqlx::PgPool,
    i: Uuid,
    source: Uuid,
    admin: &str,
) {
    let (_, pdf_source) = call(
        s,
        "POST",
        &format!("/api/v1/institutions/{i}/sources"),
        admin,
        json!({"title":"Synthetic PDF parser saturation","kind":"pdf","visibility":"institution"}),
        None,
    )
    .await;
    let pdf_source = id(&pdf_source, "id");
    let before = std::fs::read_dir(&s.config.uploads).unwrap().count();
    let permit = crate::pdf::PARSERS.acquire_many(2).await.unwrap();
    let request = Request::builder()
        .method("POST")
        .uri(format!(
            "/api/v1/institutions/{i}/sources/{pdf_source}/versions"
        ))
        .header("origin", "http://localhost:3000")
        .header("x-noti-csrf", "1")
        .header("cookie", admin)
        .header("idempotency-key", Uuid::new_v4().to_string())
        .header(
            "content-type",
            "multipart/form-data; boundary=synthetic-boundary",
        )
        .body(Body::from(multipart_pdf(
            b"%PDF- synthetic capacity fixture",
        )))
        .unwrap();
    let response = crate::router(disabled.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), 429);
    drop(permit);
    assert_eq!(
        std::fs::read_dir(&s.config.uploads).unwrap().count(),
        before
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM product.source_versions WHERE source_id=$1"
        )
        .bind(pdf_source)
        .fetch_one(pool)
        .await
        .unwrap(),
        0
    );

    // Hold an actual SQL write behind a table lock, then cancel after the original exists.
    let migration = sqlx::PgPool::connect(MIGRATOR).await.unwrap();
    let mut tx = migration.begin().await.unwrap();
    sqlx::query("LOCK TABLE product.source_versions IN SHARE MODE")
        .execute(&mut *tx)
        .await
        .unwrap();
    let state = disabled.clone();
    let actor = admin.to_owned();
    let key = Uuid::new_v4();
    let caller = tokio::spawn(async move {
        upload(
            &state,
            i,
            source,
            &actor,
            "Synthetic cancelled precommit original",
            "en",
            "Synthetic cancelled",
            key,
        )
        .await
    });
    let mut written = false;
    for _ in 0..100 {
        if std::fs::read_dir(&s.config.uploads).unwrap().count() > before {
            written = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    caller.abort();
    let _ = caller.await;
    tx.rollback().await.unwrap();
    migration.close().await;
    assert!(
        written,
        "cancellation must occur after actual file creation"
    );
    assert_eq!(
        std::fs::read_dir(&s.config.uploads).unwrap().count(),
        before
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM product.idempotency_keys WHERE key=$1")
            .bind(key)
            .fetch_one(pool)
            .await
            .unwrap(),
        0
    );
    native_pdf(s, i, pdf_source, admin).await;
    // HTML fixture enters extraction directly: no external URL fetch or SSRF bypass is exposed.
    let html_source = Uuid::new_v4();
    sqlx::query("INSERT INTO product.sources(id,institution_id,title,kind,original_url,visibility) VALUES($1,$2,'Synthetic HTML extraction','url','https://example.invalid/synthetic','institution')").bind(html_source).bind(i).execute(pool).await.unwrap();
    let metadata=serde_json::from_value(json!({"label":"Synthetic HTML","language":"vi","effective_from":null,"effective_until":null})).unwrap();
    let (_, Json(job)) = crate::ingestion::ingest(
        disabled,
        i,
        html_source,
        admin,
        Uuid::new_v4(),
        metadata,
        "text/html",
        format!("<p>{}</p>", "ế🦊".repeat(2100)).as_bytes(),
        true,
    )
    .await
    .unwrap();
    let v = id(&job, "version_id");
    let (status, page) = call(
        s,
        "GET",
        &format!("/api/v1/institutions/{i}/versions/{v}/chunks"),
        admin,
        json!({}),
        None,
    )
    .await;
    assert_eq!(status, 200);
    assert!(page["items"].as_array().unwrap().len() > 1);
    for chunk in page["items"].as_array().unwrap() {
        assert!(chunk["locator"]["page"].is_null());
        assert_eq!(chunk["locator"]["start_char"], 0);
        assert_eq!(
            chunk["locator"]["end_char"].as_u64().unwrap() as usize,
            chunk["text"].as_str().unwrap().chars().count()
        );
    }
}

fn multipart_pdf(bytes: &[u8]) -> Vec<u8> {
    let mut body=b"--synthetic-boundary\r\nContent-Disposition: form-data; name=\"metadata\"\r\n\r\n{\"label\":\"Synthetic same-page PDF\",\"language\":\"en\",\"effective_from\":null,\"effective_until\":null}\r\n--synthetic-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"synthetic.pdf\"\r\nContent-Type: application/pdf\r\n\r\n".to_vec();
    body.extend_from_slice(bytes);
    body.extend_from_slice(b"\r\n--synthetic-boundary--\r\n");
    body
}

async fn native_pdf(s: &AppState, i: Uuid, source: Uuid, admin: &str) {
    use lopdf::{
        Document, Object, Stream,
        content::{Content, Operation},
        dictionary,
    };
    let mut doc = Document::with_version("1.5");
    let pages = doc.new_object_id();
    let font =
        doc.add_object(dictionary! {"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica"});
    let resources = doc.add_object(dictionary! {"Font"=>dictionary!{"F1"=>font}});
    let content = Content {
        operations: vec![
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["F1".into(), 12.into()]),
            Operation::new("Td", vec![30.into(), 700.into()]),
            Operation::new(
                "Tj",
                vec![Object::string_literal(
                    "Synthetic same-page text. ".repeat(180),
                )],
            ),
            Operation::new("ET", vec![]),
        ],
    };
    let stream = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
    let page=doc.add_object(dictionary!{"Type"=>"Page","Parent"=>pages,"Resources"=>resources,"Contents"=>stream,"MediaBox"=>vec![0.into(),0.into(),595.into(),842.into()]});
    doc.objects.insert(
        pages,
        dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1}.into(),
    );
    let catalog = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages});
    doc.trailer.set("Root", catalog);
    let mut bytes = vec![];
    doc.save_to(&mut bytes).unwrap();
    let probe = tokio::net::TcpSocket::new_v4().unwrap();
    probe.set_reuseaddr(true).unwrap();
    probe
        .bind("127.0.0.1:3810".parse().unwrap())
        .expect("native API port must be unused under services.lock");
    drop(probe);
    let mut child = tokio::process::Command::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/debug/noti-school-api"
    ))
    .env_clear()
    .env("DATABASE_URL", DB)
    .env("INTERNAL_AUTH_SECRET", SECRET)
    .env("UPLOAD_DIR", &s.config.uploads)
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null())
    .kill_on_drop(true)
    .spawn()
    .unwrap();
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap();
    let mut ready = false;
    for _ in 0..100 {
        if client
            .get("http://127.0.0.1:3810/healthz")
            .send()
            .await
            .is_ok()
        {
            ready = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(ready);
    let response = client
        .post(format!(
            "http://127.0.0.1:3810/api/v1/institutions/{i}/sources/{source}/versions"
        ))
        .header("origin", "http://localhost:3000")
        .header("x-noti-csrf", "1")
        .header("cookie", admin)
        .header("idempotency-key", Uuid::new_v4().to_string())
        .header(
            "content-type",
            "multipart/form-data; boundary=synthetic-boundary",
        )
        .body(multipart_pdf(&bytes))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let job: Value = response.json().await.unwrap();
    assert_eq!(status, 202, "{job}");
    let v = id(&job, "version_id");
    let (status, page) = call(
        s,
        "GET",
        &format!("/api/v1/institutions/{i}/versions/{v}/chunks"),
        admin,
        json!({}),
        None,
    )
    .await;
    assert_eq!(status, 200);
    assert!(page["items"].as_array().unwrap().len() > 1, "{page}");
    for chunk in page["items"].as_array().unwrap() {
        assert_eq!(chunk["locator"]["page"], 1);
        assert_eq!(chunk["locator"]["start_char"], 0);
        assert_eq!(
            chunk["locator"]["end_char"].as_u64().unwrap() as usize,
            chunk["text"].as_str().unwrap().chars().count()
        );
    }
    let quarantine = client
        .post(format!(
            "http://127.0.0.1:3810/api/v1/institutions/{i}/sources/{source}/versions"
        ))
        .header("origin", "http://localhost:3000")
        .header("x-noti-csrf", "1")
        .header("cookie", admin)
        .header("idempotency-key", Uuid::new_v4().to_string())
        .header(
            "content-type",
            "multipart/form-data; boundary=synthetic-boundary",
        )
        .body(multipart_pdf(
            b"%PDF- synthetic malformed quarantine fixture",
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(quarantine.status(), 202);
    let job: Value = quarantine.json().await.unwrap();
    let q = id(&job, "version_id");
    assert_eq!(
        call(
            s,
            "GET",
            &format!("/api/v1/institutions/{i}/versions/{q}"),
            admin,
            json!({}),
            None
        )
        .await
        .1["status"],
        "quarantined"
    );
    assert_eq!(
        call(
            s,
            "GET",
            &format!("/api/v1/institutions/{i}/versions/{q}/chunks"),
            admin,
            json!({}),
            None
        )
        .await
        .1["items"],
        json!([])
    );
    child.kill().await.unwrap();
    let _ = child.wait().await;
}

async fn admission(
    s: &AppState,
    pool: &sqlx::PgPool,
    i: Uuid,
    student: &str,
    hits: &Arc<AtomicUsize>,
) {
    // Actual immutable price rows at a controlled admission time. No existing prices/funds mutated.
    let migration = sqlx::PgPool::connect(MIGRATOR).await.unwrap();
    let last: chrono::DateTime<chrono::Utc> =
        sqlx::query_scalar("SELECT max(valid_until)+interval '2 days' FROM product.ai_prices")
            .fetch_one(pool)
            .await
            .unwrap();
    for (provider, model, component) in [
        ("openai", "synthetic-model", "input_tokens"),
        ("openai", "synthetic-model", "output_tokens"),
        ("openai", "text-embedding-3-small", "embedding_tokens"),
    ] {
        sqlx::query("INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES($1,$2,$3,$4,1,$5,$6,'https://example.invalid/synthetic-future-pricing')")
            .bind(format!("synthetic-{}",Uuid::new_v4())).bind(provider).bind(model).bind(component).bind(last).bind(last+chrono::Duration::days(1)).execute(&migration).await.unwrap();
    }
    let mut future = s.clone();
    future.pricing_at = Some(last + chrono::Duration::hours(1));
    for expired in [false, true] {
        if expired {
            for component in ["jev_input_tokens", "jev_output_tokens"] {
                sqlx::query("INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES($1,'jev','jev-1.13.0',$2,1,$3,$4,'https://example.invalid/synthetic-expired-jev')")
                    .bind(format!("synthetic-{}",Uuid::new_v4())).bind(component).bind(last).bind(last+chrono::Duration::minutes(30)).execute(&migration).await.unwrap();
            }
        }
        let before = hits.load(Ordering::SeqCst);
        let reservations: i64 = sqlx::query_scalar("SELECT count(*) FROM product.ai_reservations")
            .fetch_one(pool)
            .await
            .unwrap();
        let key = Uuid::new_v4();
        let (status, error) = call(
            &future,
            "POST",
            "/api/v1/answers",
            student,
            json!({"institution_id":i,"question":"Synthetic admission test","language":"en"}),
            Some(key),
        )
        .await;
        assert_eq!(status, 503, "{error}");
        assert_eq!(error["error"]["code"], "pricing_unavailable");
        assert_eq!(
            crate::worker::tick(&future).await.unwrap_err().0,
            "pricing_unavailable"
        );
        assert_eq!(
            call(
                &future,
                "GET",
                "/api/v1/capabilities",
                student,
                json!({}),
                None
            )
            .await
            .1["answers"]["reason"],
            "pricing_missing"
        );
        assert_eq!(hits.load(Ordering::SeqCst), before);
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM product.ai_reservations")
                .fetch_one(pool)
                .await
                .unwrap(),
            reservations
        );
        assert_eq!(
            sqlx::query_scalar::<_, i64>(
                "SELECT count(*) FROM product.idempotency_keys WHERE key=$1"
            )
            .bind(key)
            .fetch_one(pool)
            .await
            .unwrap(),
            0
        );
    }
    migration.close().await;
}
