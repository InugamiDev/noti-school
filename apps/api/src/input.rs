use crate::error::{Error, Result};
use serde_json::{Value, json};

// intent: mirror the frozen Unicode scalar/UTF-8/control boundary before paid work.
pub fn validate(text: &str) -> Result<()> {
    if text.trim().is_empty()
        || text.len() > 16_000
        || text.chars().count() > 4_000
        || text
            .chars()
            .any(|c| c.is_ascii_control() && !['\t', '\n', '\r'].contains(&c))
    {
        return Err(Error("invalid_request"));
    }
    Ok(())
}

pub fn pack(question: &str, mut evidence: Vec<Value>) -> Result<Vec<Value>> {
    validate(question)?;
    // Each iteration removes one passage; an oversized empty envelope is an input error.
    loop {
        if serde_json::to_vec(&json!({"question":question,"evidence":evidence}))
            .map_err(crate::error::invalid)?
            .len()
            <= 20_000
        {
            return Ok(evidence);
        }
        if evidence.pop().is_none() {
            return Err(Error("invalid_request"));
        }
    }
}
