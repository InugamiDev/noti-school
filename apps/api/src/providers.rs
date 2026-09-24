use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
pub const JEV_MODEL: &str = "jev-1.13.0";
pub const JEV_URL: &str = "https://api.typesafe.ai/v1/systemone";
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Noul {
    #[serde(rename = "type")]
    kind: String,
    pub noul: f64,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct JevResponse {
    pub model: String,
    pub answers: BTreeMap<String, Noul>,
    pub usage: Usage,
}
pub fn validate_jev(bytes: &[u8], expected: &BTreeSet<String>) -> Result<JevResponse> {
    let r: JevResponse =
        serde_json::from_slice(bytes).map_err(|_| Error("provider_unavailable"))?;
    if r.model != JEV_MODEL
        || expected.is_empty()
        || expected.len() > 32
        || r.answers.keys().cloned().collect::<BTreeSet<_>>() != *expected
        || r.answers
            .values()
            .any(|v| v.kind != "noul" || !v.noul.is_finite() || !(0.0..=1.0).contains(&v.noul))
        || r.usage.input_tokens == 0
        || r.usage.input_tokens > 64000
        || r.usage.output_tokens > 64000
    {
        return Err(Error("provider_unavailable"));
    }
    Ok(r)
}
pub fn jev_request(evidence: Value, questions: BTreeMap<String, String>) -> Result<Value> {
    if questions.is_empty()
        || questions.len() > 32
        || questions
            .iter()
            .any(|(id, q)| id.is_empty() || id.len() > 100 || q.len() > 1000)
        || serde_json::to_vec(&evidence)
            .map_err(crate::error::invalid)?
            .len()
            > 24000
    {
        return Err(Error("invalid_request"));
    }
    Ok(
        json!({"model":JEV_MODEL,"state":evidence,"questions":questions.into_iter().map(|(id,instructions)|(id,json!({"type":"noul","instructions":instructions}))).collect::<BTreeMap<_,_>>()}),
    )
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Claim {
    pub text: String,
    pub evidence_ids: Vec<Uuid>,
}
// Evidence IDs alone are insufficient: every atomic claim needs a separate Jev support result.
pub fn validate_claims(
    claims: &[Claim],
    authorized: &BTreeSet<Uuid>,
    support: &JevResponse,
) -> Result<()> {
    if claims.is_empty() || claims.len() > 50 || support.answers.len() != claims.len() + 1 {
        return Err(Error("provider_unavailable"));
    }
    if support.answers.get("conflict").is_none_or(|v| v.noul > 0.1) {
        return Err(Error("provider_unavailable"));
    }
    for (n, c) in claims.iter().enumerate() {
        if c.text.trim().is_empty()
            || c.text.chars().count() > 8000
            || c.evidence_ids.is_empty()
            || c.evidence_ids.len() > 20
            || c.evidence_ids.iter().collect::<BTreeSet<_>>().len() != c.evidence_ids.len()
            || c.evidence_ids.iter().any(|id| !authorized.contains(id))
            || support
                .answers
                .get(&format!("claim_{n}"))
                .is_none_or(|v| v.noul < 0.9)
        {
            return Err(Error("provider_unavailable"));
        }
    }
    Ok(())
}
pub fn validate_embedding(bytes: &[u8]) -> Result<Vec<f32>> {
    let v: Value = serde_json::from_slice(bytes).map_err(|_| Error("provider_unavailable"))?;
    if v["model"] != "text-embedding-3-small"
        || v["data"].as_array().is_none_or(|a| a.len() != 1)
        || v["data"][0]["index"] != 0
        || v["usage"]["prompt_tokens"].as_u64().is_none()
        || v["usage"]["total_tokens"] != v["usage"]["prompt_tokens"]
    {
        return Err(Error("provider_unavailable"));
    }
    let values: Vec<f32> = serde_json::from_value(v["data"][0]["embedding"].clone())
        .map_err(|_| Error("provider_unavailable"))?;
    if values.len() != 1536
        || values.iter().any(|v| !v.is_finite())
        || values.iter().all(|v| *v == 0.0)
    {
        return Err(Error("provider_unavailable"));
    }
    Ok(values)
}
