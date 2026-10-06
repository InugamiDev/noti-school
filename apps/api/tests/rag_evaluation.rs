// intent: make offline evaluation failures observable, including actual CLI exit status.
// status: synthetic contracts only; next: P0 integrated rerun and independent review.
#[path = "../examples/rag-eval.rs"]
mod evaluator;

use serde_json::{Value, json};
use std::{path::PathBuf, process::Command};

const FIXTURE: &[u8] = include_bytes!("../../../tests/fixtures/rag/evaluation.json");

fn fixture() -> Value {
    serde_json::from_slice(FIXTURE).unwrap()
}

#[test]
fn bilingual_fixture_checks_computed_results() {
    let report = evaluator::evaluate(FIXTURE).unwrap();
    assert_eq!(report["status"], "pass", "{report:#}");
    assert_eq!(report["aggregate"]["cases"], 32);
    assert_eq!(report["aggregate"]["failed"], 0);
    for language in ["en", "vi"] {
        assert!(
            report["aggregate"]["by_language"][language]["cases"]
                .as_u64()
                .unwrap()
                > 0
        );
    }
    assert!(
        report["aggregate"]["retrieval_recall_at_11"]["value"]
            .as_f64()
            .unwrap()
            < 1.0
    );
    assert!(report["live_latency_ms"].is_null());
    assert!(report["real_cost_usd"].is_null());
}

#[test]
fn changed_gold_and_changed_replies_fail_independently() {
    let mut value = fixture();
    value["cases"][0]["gold"]["outcome"] = json!("reject");
    value["cases"][0]["gold"]["cited_ids"] = json!([]);
    let report = evaluator::evaluate(&serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(report["status"], "fail");
    assert_eq!(report["cases"][0]["actual"]["outcome"], "accept");
    let mut value = fixture();
    value["cases"][0]["replies"]["support"]["verdict"] = json!("unsupported");
    let report = evaluator::evaluate(&serde_json::to_vec(&value).unwrap()).unwrap();
    assert_eq!(report["status"], "fail");
    assert_eq!(report["cases"][0]["actual"]["outcome"], "abstain");
}

#[test]
fn excerpt_and_request_bounds_are_observed() {
    let report = evaluator::evaluate(FIXTURE).unwrap();
    for case in report["cases"].as_array().unwrap() {
        let actual = &case["actual"];
        for field in ["excerpt_envelope_bytes", "packed_envelope_bytes"] {
            if let Some(bytes) = actual[field].as_u64() {
                assert!(bytes <= 20_000);
            }
        }
        if let Some(lengths) = actual["excerpt_chars"].as_array() {
            assert!(lengths.iter().all(|n| n.as_u64().unwrap() <= 700));
        }
        for (stage, request) in actual["requests"].as_object().unwrap() {
            assert_eq!(request["store"], false);
            assert_eq!(request["tools_present"], false);
            assert!(request["request_bytes"].as_u64().unwrap() <= 65_536);
            if stage != "generation" {
                assert_eq!(request["untrusted_instruction"], true);
            }
        }
    }
}

#[test]
fn exact_byte_and_unicode_boundaries_use_production_helpers() {
    use noti_school_api::{input, rag};
    let id = uuid::Uuid::from_u128(1);
    let question = "Synthetic boundary?";
    let empty = json!({"id":id,"quote":""});
    let overhead = serde_json::to_vec(&json!({"question":question,"evidence":[empty]}))
        .unwrap()
        .len();
    let exact = json!({"id":id,"quote":"x".repeat(20_000-overhead)});
    assert_eq!(input::pack(question, vec![exact.clone()]).unwrap().len(), 1);
    let oversized = json!({"id":id,"quote":"x".repeat(20_001-overhead)});
    assert!(input::pack(question, vec![oversized]).unwrap().is_empty());
    let evidence = vec![json!({"id":id,"quote":"ế".repeat(701)})];
    let excerpts = rag::excerpts(question, &evidence).unwrap();
    assert_eq!(excerpts[0]["quote"].as_str().unwrap().chars().count(), 700);
    assert_eq!(excerpts[0]["quote"].as_str().unwrap().len(), 2100);
    assert_eq!(excerpts[0]["truncated"], true);
    assert!(
        rag::request(
            "synthetic-offline-model",
            rag::Stage::Rerank,
            question,
            &[json!({"id":id,"quote":"x".repeat(65_536)})],
            &[]
        )
        .is_err()
    );
    assert!(input::validate(&"🦊".repeat(4001)).is_err());
    assert!(input::validate("question\0").is_err());
}

#[test]
fn rejects_duplicate_ids_cases_and_missing_bilingual_coverage() {
    for kind in [
        "passage",
        "case",
        "rank",
        "gold",
        "language",
        "empty",
        "unknown_field",
    ] {
        let mut value = fixture();
        match kind {
            "passage" => {
                let duplicate = value["passages"][0].clone();
                value["passages"].as_array_mut().unwrap().push(duplicate);
            }
            "case" => {
                let duplicate = value["cases"][0].clone();
                value["cases"].as_array_mut().unwrap().push(duplicate);
            }
            "rank" => {
                let duplicate = value["cases"][0]["rankings"][0][0].clone();
                value["cases"][0]["rankings"][0]
                    .as_array_mut()
                    .unwrap()
                    .push(duplicate);
            }
            "gold" => {
                let duplicate = value["cases"][0]["gold"]["relevant_ids"][0].clone();
                value["cases"][0]["gold"]["relevant_ids"]
                    .as_array_mut()
                    .unwrap()
                    .push(duplicate);
            }
            "language" => {
                value["cases"]
                    .as_array_mut()
                    .unwrap()
                    .retain(|c| c["language"] == "en");
            }
            "empty" => value["cases"] = json!([]),
            _ => value["unexpected"] = json!(true),
        }
        assert!(
            evaluator::evaluate(&serde_json::to_vec(&value).unwrap()).is_err(),
            "{kind}"
        );
    }
    assert!(evaluator::evaluate(b"{").is_err());
}

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

#[test]
fn cli_negative_inputs_exit_nonzero_with_json_evidence() {
    let directory = root()
        .join(".cache/rag-cli-tests")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&directory).unwrap();
    let mut empty = fixture();
    empty["cases"] = json!([]);
    let mut broken = fixture();
    broken["cases"][0]["gold"]["stage"] = json!("selection");
    let mut duplicate = fixture();
    let c = duplicate["cases"][0].clone();
    duplicate["cases"].as_array_mut().unwrap().push(c);
    let mut monolingual = fixture();
    monolingual["cases"]
        .as_array_mut()
        .unwrap()
        .retain(|c| c["language"] == "en");
    for (name, bytes, code, status) in [
        (
            "empty",
            serde_json::to_vec(&empty).unwrap(),
            2,
            "invalid_dataset",
        ),
        ("bad", b"{".to_vec(), 2, "invalid_dataset"),
        ("broken", serde_json::to_vec(&broken).unwrap(), 1, "fail"),
        (
            "duplicate",
            serde_json::to_vec(&duplicate).unwrap(),
            2,
            "invalid_dataset",
        ),
        (
            "monolingual",
            serde_json::to_vec(&monolingual).unwrap(),
            2,
            "invalid_dataset",
        ),
        ("valid", FIXTURE.to_vec(), 0, "pass"),
    ] {
        let path = directory.join(format!("{name}.json"));
        std::fs::write(&path, bytes).unwrap();
        let (report, actual_code) = evaluator::run_file(&path);
        assert_eq!(actual_code, code as u8, "{name}: {report:#}");
        let output = Command::new(env!("CARGO"))
            .current_dir(root())
            .args([
                "run",
                "-p",
                "noti-school-api",
                "--locked",
                "--offline",
                "--quiet",
                "--example",
                "rag-eval",
                "--",
            ])
            .arg(&path)
            .output()
            .unwrap();
        assert_eq!(
            output.status.code(),
            Some(code),
            "{name}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let report: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(report["status"], status, "{name}");
        if name == "broken" {
            assert_eq!(report["aggregate"]["failed"], 1);
        }
    }
    let (_, code) = evaluator::run_file(&directory.join("missing.json"));
    assert_eq!(code, 2);
    std::fs::remove_dir_all(directory).unwrap();
}
