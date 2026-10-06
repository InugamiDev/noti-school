// intent: evaluate production contracts with synthetic inputs and independent fixture gold.
// status: offline only; next: administrator-approved held-out bilingual evaluation.
use noti_school_api::{input, providers, rag, retrieval};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, time::Instant};
use uuid::Uuid;

const MODEL: &str = "synthetic-offline-model";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Dataset {
    version: u32,
    synthetic: bool,
    passages: Vec<Passage>,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Passage {
    id: Uuid,
    quote: String,
    repeat: usize,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Case {
    id: String,
    language: String,
    description: String,
    question: String,
    question_repeat: usize,
    rankings: Vec<Vec<Uuid>>,
    replies: Replies,
    gold: Gold,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Replies {
    rerank: Value,
    selection: Value,
    generation: Value,
    support: Value,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Gold {
    outcome: String,
    stage: String,
    relevant_ids: Vec<Uuid>,
    rrf_ids: Vec<Uuid>,
    excerpt_ids: Vec<Uuid>,
    packed_ids: Vec<Uuid>,
    selected_ids: Vec<Uuid>,
    cited_ids: Vec<Uuid>,
    truncated_ids: Vec<Uuid>,
}

fn unique(ids: &[Uuid]) -> bool {
    ids.iter().collect::<BTreeSet<_>>().len() == ids.len()
}

fn validate_dataset(d: &Dataset) -> Result<(), String> {
    if d.version != 1 || !d.synthetic || d.cases.is_empty() || d.passages.is_empty() {
        return Err("version 1, synthetic=true, nonempty passages and cases required".into());
    }
    let ids: BTreeSet<_> = d.passages.iter().map(|p| p.id).collect();
    if ids.len() != d.passages.len() {
        return Err("duplicate passage IDs".into());
    }
    for p in &d.passages {
        if p.quote.is_empty() || p.repeat == 0 || p.quote.len().saturating_mul(p.repeat) > 100_000 {
            return Err("empty or oversized expanded fixture passage".into());
        }
    }
    let mut cases = BTreeSet::new();
    let mut languages = BTreeSet::new();
    for c in &d.cases {
        if c.id.trim().is_empty() || !cases.insert(&c.id) || c.description.trim().is_empty() {
            return Err("empty/duplicate case ID or empty description".into());
        }
        if !["en", "vi"].contains(&c.language.as_str()) {
            return Err(format!("{}: unsupported language", c.id));
        }
        languages.insert(c.language.as_str());
        if c.question_repeat == 0 || c.question.len().saturating_mul(c.question_repeat) > 100_000 {
            return Err(format!("{}: invalid question expansion", c.id));
        }
        if c.rankings.len() != 2
            || c.rankings
                .iter()
                .any(|r| r.len() > 24 || !unique(r) || r.iter().any(|id| !ids.contains(id)))
        {
            return Err(format!(
                "{}: need two unique, known candidate rankings of at most 24",
                c.id
            ));
        }
        if !["accept", "abstain", "reject"].contains(&c.gold.outcome.as_str())
            || ![
                "input",
                "retrieval",
                "rerank",
                "packing",
                "selection",
                "generation",
                "claim_support",
            ]
            .contains(&c.gold.stage.as_str())
        {
            return Err(format!("{}: invalid gold outcome/stage", c.id));
        }
        for list in [
            &c.gold.relevant_ids,
            &c.gold.rrf_ids,
            &c.gold.excerpt_ids,
            &c.gold.packed_ids,
            &c.gold.selected_ids,
            &c.gold.cited_ids,
            &c.gold.truncated_ids,
        ] {
            if !unique(list) || list.iter().any(|id| !ids.contains(id)) {
                return Err(format!("{}: duplicate/unknown gold passage IDs", c.id));
            }
        }
        if c.gold.outcome != "accept" && !c.gold.cited_ids.is_empty() {
            return Err(format!(
                "{}: only accepted answers have gold citations",
                c.id
            ));
        }
    }
    if languages != BTreeSet::from(["en", "vi"]) {
        return Err("both English (en) and Vietnamese (vi) cases required".into());
    }
    Ok(())
}

// Fixture replies are structured output payloads, or an explicit raw envelope for failures.
// Usage below is a protocol fixture, never a measurement of tokens or cost.
fn envelope(reply: &Value) -> Vec<u8> {
    let value = reply.get("raw_envelope").cloned().unwrap_or_else(|| json!({
        "model":MODEL,"status":"completed","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15},
        "output":[{"type":"message","role":"assistant","status":"completed",
            "content":[{"type":"output_text","text":reply.to_string()}]}]
    }));
    serde_json::to_vec(&value).expect("JSON value serializes")
}

fn evidence_ids(evidence: &[Value]) -> Vec<Value> {
    evidence.iter().map(|p| p["id"].clone()).collect()
}

fn structured(
    stage: rag::Stage,
    question: &str,
    evidence: &[Value],
    claims: &[providers::Claim],
    reply: &Value,
    trace: &mut Value,
) -> noti_school_api::error::Result<Value> {
    let request = rag::request(MODEL, stage, question, evidence, claims)?;
    trace[stage.name()] = json!({
        "request_bytes":serde_json::to_vec(&request).expect("JSON value serializes").len(),
        "sent_ids":evidence_ids(evidence),
        "untrusted_instruction":request["instructions"].as_str().is_some_and(|s| s.contains("untrusted data")),
        "store":request["store"],"tools_present":request.get("tools").is_some()
    });
    let (value, _) = providers::validate_response(&envelope(reply), MODEL)?;
    rag::validate(stage, value, evidence, claims)
}

fn execute(
    c: &Case,
    passages: &[Value],
    actual: &mut Value,
) -> noti_school_api::error::Result<(&'static str, &'static str)> {
    let question = c.question.repeat(c.question_repeat);
    actual["stage"] = json!("input");
    input::validate(&question)?;
    // Production reserves one of twelve slots for graph expansion. No graph/SQL is simulated.
    let order = retrieval::rrf(&c.rankings, rag::CANDIDATES - 1);
    actual["rrf_ids"] = json!(order);
    if order.is_empty() {
        return Ok(("abstain", "retrieval"));
    }
    let candidates = rag::retain(passages, &order, rag::CANDIDATES)?;
    let excerpts = rag::excerpts(&question, &candidates)?;
    actual["excerpt_ids"] = json!(evidence_ids(&excerpts));
    actual["truncated_ids"] = json!(
        excerpts
            .iter()
            .filter(|p| p["truncated"] == true)
            .map(|p| p["id"].clone())
            .collect::<Vec<_>>()
    );
    actual["excerpt_chars"] = json!(
        excerpts
            .iter()
            .map(|p| p["quote"].as_str().unwrap_or_default().chars().count())
            .collect::<Vec<_>>()
    );
    actual["excerpt_envelope_bytes"] = json!(
        serde_json::to_vec(&json!({"question":question,"evidence":excerpts}))
            .expect("JSON value serializes")
            .len()
    );
    if excerpts.is_empty() {
        return Ok(("abstain", "rerank"));
    }
    actual["stage"] = json!("rerank");
    let ranked: rag::Ranked = serde_json::from_value(structured(
        rag::Stage::Rerank,
        &question,
        &excerpts,
        &[],
        &c.replies.rerank,
        &mut actual["requests"],
    )?)
    .map_err(noti_school_api::error::invalid)?;
    let packed = input::pack(
        &question,
        rag::retain(&candidates, &ranked.ordered_ids, rag::FINAL_PASSAGES)?,
    )?;
    actual["packed_ids"] = json!(evidence_ids(&packed));
    actual["packed_envelope_bytes"] = json!(
        serde_json::to_vec(&json!({"question":question,"evidence":packed}))
            .expect("JSON value serializes")
            .len()
    );
    if packed.is_empty() {
        return Ok(("abstain", "packing"));
    }
    actual["stage"] = json!("selection");
    let selection: rag::Selection = serde_json::from_value(structured(
        rag::Stage::Selection,
        &question,
        &packed,
        &[],
        &c.replies.selection,
        &mut actual["requests"],
    )?)
    .map_err(noti_school_api::error::invalid)?;
    let selected = rag::retain(&packed, &selection.evidence_ids, rag::FINAL_PASSAGES)?;
    actual["selected_ids"] = json!(evidence_ids(&selected));
    actual["selection_verdict"] = json!(selection.verdict);
    if selection.verdict != rag::Verdict::Sufficient {
        return Ok(("abstain", "selection"));
    }
    actual["stage"] = json!("generation");
    let request = providers::generation_request(MODEL, &question, &c.language, &json!(selected));
    actual["requests"]["generation"] = json!({"request_bytes":serde_json::to_vec(&request).expect("JSON value serializes").len(),"sent_ids":evidence_ids(&selected),"store":request["store"],"tools_present":request.get("tools").is_some()});
    let (generated, _) = providers::validate_generation(&envelope(&c.replies.generation), MODEL)?;
    actual["generated_claims"] = json!(generated.claims);
    if generated.claims.is_empty() {
        return Ok(("abstain", "generation"));
    }
    actual["stage"] = json!("claim_support");
    // validate(Support) enforces the selected-ID boundary as well as exact claim coverage.
    let support: rag::Support = serde_json::from_value(structured(
        rag::Stage::Support,
        &question,
        &selected,
        &generated.claims,
        &c.replies.support,
        &mut actual["requests"],
    )?)
    .map_err(noti_school_api::error::invalid)?;
    actual["support_verdict"] = json!(support.verdict);
    if support.verdict != rag::SupportVerdict::Supported {
        return Ok(("abstain", "claim_support"));
    }
    actual["cited_ids"] = json!(
        generated
            .claims
            .iter()
            .flat_map(|c| c.evidence_ids.iter().copied())
            .collect::<BTreeSet<_>>()
    );
    Ok(("accept", "claim_support"))
}

fn ratio(numerator: usize, denominator: usize) -> Value {
    json!({"numerator":numerator,"denominator":denominator,"value":if denominator == 0 {None} else {Some(numerator as f64 / denominator as f64)}})
}

pub fn evaluate(bytes: &[u8]) -> Result<Value, String> {
    let started = Instant::now();
    let dataset: Dataset =
        serde_json::from_slice(bytes).map_err(|e| format!("invalid dataset JSON: {e}"))?;
    validate_dataset(&dataset)?;
    let passages: Vec<_> = dataset
        .passages
        .iter()
        .map(|p| json!({"id":p.id,"quote":p.quote.repeat(p.repeat)}))
        .collect();
    let mut reports = Vec::new();
    let mut recall_hits = 0;
    let mut recall_total = 0;
    let mut citation_hits = 0;
    let mut citation_total = 0;
    for c in &dataset.cases {
        let mut actual = json!({"stage":"input","rrf_ids":[],"excerpt_ids":[],"packed_ids":[],"selected_ids":[],"cited_ids":[],"truncated_ids":[],"requests":{}});
        match execute(c, &passages, &mut actual) {
            Ok((outcome, stage)) => {
                actual["outcome"] = json!(outcome);
                actual["stage"] = json!(stage);
            }
            Err(e) => {
                actual["outcome"] = json!("reject");
                actual["error"] = json!(e.0);
            }
        }
        let mut failures = Vec::new();
        for (field, expected) in [
            ("outcome", json!(c.gold.outcome)),
            ("stage", json!(c.gold.stage)),
            ("rrf_ids", json!(c.gold.rrf_ids)),
            ("excerpt_ids", json!(c.gold.excerpt_ids)),
            ("packed_ids", json!(c.gold.packed_ids)),
            ("selected_ids", json!(c.gold.selected_ids)),
            ("cited_ids", json!(c.gold.cited_ids)),
            ("truncated_ids", json!(c.gold.truncated_ids)),
        ] {
            if actual[field] != expected {
                failures.push(json!({"field":field,"expected":expected,"actual":actual[field]}));
            }
        }
        let retrieved: Vec<Uuid> =
            serde_json::from_value(actual["rrf_ids"].clone()).expect("computed UUIDs");
        let cited: Vec<Uuid> =
            serde_json::from_value(actual["cited_ids"].clone()).expect("computed UUIDs");
        let hits = c
            .gold
            .relevant_ids
            .iter()
            .filter(|id| retrieved.contains(id))
            .count();
        let covered = c
            .gold
            .cited_ids
            .iter()
            .filter(|id| cited.contains(id))
            .count();
        recall_hits += hits;
        recall_total += c.gold.relevant_ids.len();
        citation_hits += covered;
        citation_total += c.gold.cited_ids.len();
        reports.push(json!({"id":c.id,"language":c.language,"description":c.description,"passed":failures.is_empty(),"failures":failures,"actual":actual,
            "expected":c.gold,"gold_relevant_ids":c.gold.relevant_ids,"gold_citation_ids":c.gold.cited_ids,
            "retrieval_recall_at_11":ratio(hits,c.gold.relevant_ids.len()),"citation_id_coverage":ratio(covered,c.gold.cited_ids.len())}));
    }
    let passed = reports.iter().filter(|r| r["passed"] == true).count();
    let by_language: Value = ["en", "vi"].into_iter().map(|language| {
        let group: Vec<_> = reports.iter().filter(|r| r["language"] == language).collect();
        let metric = |name: &str| ratio(
            group.iter().map(|r| r[name]["numerator"].as_u64().expect("computed count") as usize).sum(),
            group.iter().map(|r| r[name]["denominator"].as_u64().expect("computed count") as usize).sum(),
        );
        (language.to_owned(),json!({"cases":group.len(),"passed":group.iter().filter(|r| r["passed"] == true).count(),
            "retrieval_recall_at_11":metric("retrieval_recall_at_11"),"citation_id_coverage":metric("citation_id_coverage")}))
    }).collect();
    Ok(
        json!({"schema_version":1,"synthetic":true,"fixture_sha256":format!("{:x}",Sha256::digest(bytes)),"status":if passed == reports.len(){"pass"}else{"fail"},"evidence_provider":"openai (scripted, offline)",
        "aggregate":{"cases":reports.len(),"passed":passed,"failed":reports.len()-passed,"by_language":by_language,"retrieval_recall_at_11":ratio(recall_hits,recall_total),"citation_id_coverage":ratio(citation_hits,citation_total)},
        "offline_elapsed_ms":started.elapsed().as_secs_f64()*1000.0,"live_latency_ms":null,"real_cost_usd":null,
        "limitations":["Synthetic judgments are controlled inputs, not measured model semantic accuracy or human-verified entailment.","No SQL authorization, graph expansion, financial settlement, real retrieval engine, Jev or live provider execution."],"cases":reports}),
    )
}

pub fn run_file(path: &std::path::Path) -> (Value, u8) {
    let result = std::fs::read(path)
        .map_err(|e| format!("cannot read dataset: {e}"))
        .and_then(|bytes| evaluate(&bytes));
    match result {
        Ok(report) => {
            let code = u8::from(report["status"] != "pass");
            (report, code)
        }
        Err(error) => (
            json!({"schema_version":1,"status":"invalid_dataset","error":error}),
            2,
        ),
    }
}

#[cfg(not(test))]
fn main() -> std::process::ExitCode {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let (report, code) = if args.len() == 1 {
        run_file(std::path::Path::new(&args[0]))
    } else {
        (
            json!({"status":"invalid_arguments","error":"usage: rag-eval DATASET.json"}),
            2,
        )
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("JSON report serializes")
    );
    std::process::ExitCode::from(code)
}
