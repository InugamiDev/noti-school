use axum::{
    body::{Body, to_bytes},
    http::{HeaderMap, Request, StatusCode},
};
use noti_school_api::{AppState, auth, config::Config, pagination, providers, router, ssrf};
use std::collections::{BTreeSet, HashMap};
use tower::ServiceExt;
fn state() -> AppState {
    AppState::new(Config::parse(&HashMap::new()).unwrap()).unwrap()
}
#[tokio::test]
async fn disabled_boot_and_private_routes() {
    for (path, status) in [
        ("/healthz", StatusCode::OK),
        ("/readyz", StatusCode::SERVICE_UNAVAILABLE),
        ("/api/v1/me", StatusCode::SERVICE_UNAVAILABLE),
        ("/api/missing", StatusCode::NOT_FOUND),
        ("/internal/session", StatusCode::NOT_FOUND),
        ("/internal/invitations/check", StatusCode::NOT_FOUND),
    ] {
        let r = router(state())
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header("host", "noti.school")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(r.status(), status, "{path}");
    }
    let r = router(state())
        .oneshot(
            Request::builder()
                .uri("/api/v1/capabilities")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let v: serde_json::Value =
        serde_json::from_slice(&to_bytes(r.into_body(), 16384).await.unwrap()).unwrap();
    assert_eq!(v["answers"]["state"], "disabled");
}
#[test]
fn csrf_requires_exact_origin_and_custom_header() {
    let mut h = HeaderMap::new();
    assert!(auth::csrf(&h, "https://noti.school").is_err());
    h.insert("origin", "https://noti.school".parse().unwrap());
    h.insert("x-noti-csrf", "1".parse().unwrap());
    assert!(auth::csrf(&h, "https://noti.school").is_ok());
    for value in ["cross-site", "same-site", "null"] {
        h.insert("sec-fetch-site", value.parse().unwrap());
        assert!(auth::csrf(&h, "https://noti.school").is_err());
    }
}
#[test]
fn internal_host_cannot_be_forwarded() {
    let secret = "a".repeat(32);
    let mut h = HeaderMap::new();
    h.insert("host", "noti.school".parse().unwrap());
    h.insert("x-forwarded-host", "127.0.0.1:3810".parse().unwrap());
    h.insert("authorization", format!("Bearer {secret}").parse().unwrap());
    assert!(auth::internal(&h, Some(&secret)).is_err());
    h.insert("host", "127.0.0.1:3810".parse().unwrap());
    assert!(auth::internal(&h, Some(&secret)).is_ok());
}
#[test]
fn private_networks_and_redirect_targets_denied() {
    for ip in [
        "127.0.0.1",
        "10.0.0.1",
        "169.254.169.254",
        "100.64.0.1",
        "192.168.1.1",
        "172.16.0.1",
        "0.0.0.0",
        "198.18.0.1",
        "224.0.0.1",
        "::1",
        "::ffff:8.8.8.8",
        "fc00::1",
        "fe80::1",
        "2001:db8::1",
        "2002:0808:0808::1",
    ] {
        assert!(!ssrf::public_ip(ip.parse().unwrap()), "{ip}");
    }
    assert!(ssrf::public_ip("8.8.8.8".parse().unwrap()));
    for url in [
        "http://official.example/a",
        "https://127.0.0.1/a",
        "https://official.example.evil/a",
        "https://user@official.example/a",
        "https://official.example:444/a",
    ] {
        assert!(ssrf::validate_url(url, &["official.example".into()]).is_err());
    }
}
#[test]
fn jev_schema_ids_usage_and_support_fail_closed() {
    let expected = BTreeSet::from(["claim_0".into(), "conflict".into()]);
    let good = serde_json::json!({"model":"jev-1.13.0","answers":{"claim_0":{"type":"noul","noul":0.98},"conflict":{"type":"noul","noul":0.0}},"usage":{"input_tokens":100,"output_tokens":10}});
    assert!(providers::validate_jev(&serde_json::to_vec(&good).unwrap(), &expected).is_ok());
    for bad in [
        serde_json::json!({}),
        serde_json::json!({"model":"jev-latest"}),
        serde_json::json!({"model":"jev-1.13.0","answers":{},"usage":{"input_tokens":1,"output_tokens":1}}),
    ] {
        assert!(providers::validate_jev(&serde_json::to_vec(&bad).unwrap(), &expected).is_err());
    }
    for n in [
        serde_json::json!(-0.1),
        serde_json::json!(1.1),
        serde_json::Value::Null,
        serde_json::json!("NaN"),
    ] {
        let mut bad = good.clone();
        bad["answers"]["claim_0"]["noul"] = n;
        assert!(providers::validate_jev(&serde_json::to_vec(&bad).unwrap(), &expected).is_err());
    }
    let response = providers::validate_jev(&serde_json::to_vec(&good).unwrap(), &expected).unwrap();
    let id = uuid::Uuid::new_v4();
    let claim = providers::Claim {
        text: "Synthetic fixture claim".into(),
        evidence_ids: vec![id],
    };
    assert!(providers::validate_claims(&[claim], &BTreeSet::new(), &response).is_err());
}
#[test]
fn cursor_bound_to_requester_and_tamper_evident() {
    let raw = pagination::encode(
        "tenant:user",
        chrono::Utc::now(),
        uuid::Uuid::new_v4(),
        "secret",
    );
    let p = pagination::Page {
        cursor: Some(raw),
        limit: Some(20),
    };
    assert!(p.decode("tenant:user", "secret").is_ok());
    assert!(p.decode("tenant:other", "secret").is_err());
    assert!(p.decode("tenant:user", "wrong").is_err());
}
#[test]
fn configuration_and_text_limits() {
    assert!(
        Config::parse(&HashMap::from([(
            "API_BIND_ADDRESS".into(),
            "0.0.0.0:3810".into()
        )]))
        .is_err()
    );
    assert!(
        noti_school_api::config::validate_database(
            "postgres://noti_school_api:synthetic@127.0.0.1/other"
        )
        .is_err()
    );
    assert!(noti_school_api::ingestion::text_chunks(&vec![b'x'; 2 * 1024 * 1024 + 1]).is_err());
    assert!(noti_school_api::ingestion::text_chunks(b"bad\0text").is_err());
}
#[tokio::test]
async fn session_cookie_forwarding_revocation_and_redirect_fail_closed() {
    use axum::{Json, Router, response::IntoResponse, routing::post};
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    let mode = Arc::new(AtomicUsize::new(0));
    let m = mode.clone();
    let app=Router::new().route("/internal/session",post(move|h:HeaderMap|{let mode=m.load(Ordering::SeqCst);async move{
        assert_eq!(h.get("cookie").unwrap(),"session=synthetic-cookie");assert_eq!(h.get("authorization").unwrap(),"Bearer 01234567890123456789012345678901");assert!(h.get("x-user-id").is_none());
        match mode {0=>Json(serde_json::json!({"user_id":"synthetic-user","session_id":"synthetic-session","email_verified":true,"expires_at":(chrono::Utc::now()+chrono::Duration::hours(1)).to_rfc3339()})).into_response(),1=>StatusCode::UNAUTHORIZED.into_response(),_=>axum::response::Redirect::temporary("http://127.0.0.1:1/").into_response()}
    }}));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3811")
        .await
        .expect("fixed internal test port must be unused; no existing service is contacted");
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let c = Config::parse(&HashMap::from([
        (
            "INTERNAL_AUTH_SECRET".into(),
            "01234567890123456789012345678901".into(),
        ),
        (
            "DATABASE_URL".into(),
            "postgres://noti_school_api:synthetic@127.0.0.1/noti_school_test_fixture".into(),
        ),
    ]))
    .unwrap();
    let s = AppState::new(c).unwrap();
    let mut h = HeaderMap::new();
    h.insert("cookie", "session=synthetic-cookie".parse().unwrap());
    h.insert("x-user-id", "forged-user".parse().unwrap());
    assert_eq!(
        auth::session(&s, &h).await.unwrap().user_id,
        "synthetic-user"
    );
    mode.store(1, Ordering::SeqCst);
    assert_eq!(
        auth::session(&s, &h).await.unwrap_err().0,
        "unauthenticated"
    );
    mode.store(2, Ordering::SeqCst);
    assert_eq!(
        auth::session(&s, &h).await.unwrap_err().0,
        "core_unavailable"
    );
    server.abort();
    let _ = server.await;
}
#[tokio::test]
async fn unknown_fields_and_oversized_json_are_contract_errors() {
    let body = serde_json::json!({"institution_id":uuid::Uuid::new_v4(),"query":"x","language":"en","forged_role":"admin"});
    for (data, expected) in [
        (body.to_string(), StatusCode::BAD_REQUEST),
        ("x".repeat(65537), StatusCode::PAYLOAD_TOO_LARGE),
    ] {
        let response = router(state())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/search")
                    .header("origin", "http://localhost:3000")
                    .header("x-noti-csrf", "1")
                    .header("content-type", "application/json")
                    .body(Body::from(data))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected);
        let value: serde_json::Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
        assert!(value["error"]["request_id"].is_string());
    }
}
#[test]
fn unsupported_claims_and_rrf() {
    let id = uuid::Uuid::new_v4();
    let other = uuid::Uuid::new_v4();
    let expected = BTreeSet::from(["claim_0".into(), "conflict".into()]);
    let response=providers::validate_jev(br#"{"model":"jev-1.13.0","answers":{"claim_0":{"type":"noul","noul":0.1},"conflict":{"type":"noul","noul":0.0}},"usage":{"input_tokens":100,"output_tokens":10}}"#,&expected).unwrap();
    assert!(
        providers::validate_claims(
            &[providers::Claim {
                text: "Unsupported synthetic claim".into(),
                evidence_ids: vec![id]
            }],
            &BTreeSet::from([id]),
            &response
        )
        .is_err()
    );
    assert_eq!(
        noti_school_api::retrieval::rrf(&[vec![id, id, other], vec![id]], 10),
        vec![id, other]
    );
}

#[test]
fn synthetic_pdf_is_extracted_in_resource_limited_child() {
    use lopdf::{
        Document, Object, Stream,
        content::{Content, Operation},
        dictionary,
    };
    let directory =
        std::env::temp_dir().join(format!("noti-synthetic-pdf-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&directory).unwrap();
    let input = directory.join("synthetic.pdf");
    let output = directory.join("pages.json");
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
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
                    "Synthetic fixture, not university policy.",
                )],
            ),
            Operation::new("ET", vec![]),
        ],
    };
    let stream = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
    let page=doc.add_object(dictionary!{"Type"=>"Page","Parent"=>pages_id,"Resources"=>resources,"Contents"=>stream,"MediaBox"=>vec![0.into(),0.into(),595.into(),842.into()]});
    doc.objects.insert(
        pages_id,
        dictionary! {"Type"=>"Pages","Kids"=>vec![page.into()],"Count"=>1}.into(),
    );
    let catalog = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages_id});
    doc.trailer.set("Root", catalog);
    doc.save(&input).unwrap();
    let status = std::process::Command::new("/usr/bin/prlimit")
        .args(["--as=536870912", "--cpu=5", "--fsize=4194304", "--"])
        .arg(env!("CARGO_BIN_EXE_noti-school-api"))
        .arg("--extract-pdf")
        .arg(&input)
        .arg(&output)
        .env_clear()
        .status()
        .unwrap();
    assert!(status.success());
    let pages: Vec<String> = serde_json::from_slice(&std::fs::read(&output).unwrap()).unwrap();
    assert_eq!(pages.len(), 1);
    assert!(pages[0].contains("Synthetic fixture"));
    std::fs::remove_file(&output).unwrap();
    std::fs::write(&input, b"%PDF- invalid synthetic document").unwrap();
    assert!(noti_school_api::pdf::extract_child(&input, &output).is_err());
    std::fs::remove_dir_all(directory).unwrap();
}

#[tokio::test]
async fn static_root_api_fallback_and_symlink_escape() {
    let directory = std::env::temp_dir().join(format!("noti-static-{}", uuid::Uuid::new_v4()));
    let dist = directory.join("dist");
    std::fs::create_dir_all(&dist).unwrap();
    std::fs::write(dist.join("index.html"), "<main>Synthetic app shell</main>").unwrap();
    std::fs::write(directory.join("private.js"), "private fixture").unwrap();
    std::os::unix::fs::symlink(directory.join("private.js"), dist.join("escape.js")).unwrap();
    let mut c = Config::parse(&HashMap::new()).unwrap();
    c.web_dist = dist;
    let app = router(AppState::new(c).unwrap());
    for (path, status) in [
        ("/workspace", StatusCode::OK),
        ("/api/unknown", StatusCode::NOT_FOUND),
        ("/internal/unknown", StatusCode::NOT_FOUND),
        ("/escape.js", StatusCode::NOT_FOUND),
        ("/.env", StatusCode::NOT_FOUND),
        ("/%2e%2e/private.js", StatusCode::NOT_FOUND),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), status, "{path}");
    }
    std::fs::remove_dir_all(directory).unwrap();
}
