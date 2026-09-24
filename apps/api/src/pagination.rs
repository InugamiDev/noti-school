use crate::error::{Error, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    scope: String,
    at: DateTime<Utc>,
    id: Uuid,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct OrdinalCursor {
    scope: String,
    ordinal: i32,
    id: Uuid,
}
impl Page {
    pub fn limit(&self) -> Result<i64> {
        let n = self.limit.unwrap_or(20);
        if !(1..=100).contains(&n) {
            Err(Error("invalid_request"))
        } else {
            Ok(n)
        }
    }
    pub fn decode(&self, scope: &str, key: &str) -> Result<(DateTime<Utc>, Uuid)> {
        let Some(raw) = &self.cursor else {
            return Ok((DateTime::UNIX_EPOCH, Uuid::nil()));
        };
        let cursor: Cursor = decode_signed(raw, key)?;
        if cursor.scope != scope {
            return Err(Error("invalid_request"));
        }
        Ok((cursor.at, cursor.id))
    }
    pub fn decode_ordinal(&self, scope: &str, key: &str) -> Result<(i32, Uuid)> {
        let Some(raw) = &self.cursor else {
            return Ok((-1, Uuid::nil()));
        };
        let cursor: OrdinalCursor = decode_signed(raw, key)?;
        if cursor.scope != scope || cursor.ordinal < 0 {
            return Err(Error("invalid_request"));
        }
        Ok((cursor.ordinal, cursor.id))
    }
}
fn decode_signed<T: serde::de::DeserializeOwned>(raw: &str, key: &str) -> Result<T> {
    if raw.len() > 1024 {
        return Err(Error("invalid_request"));
    }
    let (data, tag) = raw.split_once('.').ok_or(Error("invalid_request"))?;
    let bytes = URL_SAFE_NO_PAD
        .decode(data)
        .map_err(crate::error::invalid)?;
    let tag = URL_SAFE_NO_PAD.decode(tag).map_err(crate::error::invalid)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).map_err(crate::error::invalid)?;
    mac.update(&bytes);
    mac.verify_slice(&tag).map_err(crate::error::invalid)?;
    serde_json::from_slice(&bytes).map_err(crate::error::invalid)
}
pub fn encode(scope: &str, at: DateTime<Utc>, id: Uuid, key: &str) -> String {
    encode_signed(
        &Cursor {
            scope: scope.into(),
            at,
            id,
        },
        key,
    )
}
pub fn encode_ordinal(scope: &str, ordinal: i32, id: Uuid, key: &str) -> String {
    encode_signed(
        &OrdinalCursor {
            scope: scope.into(),
            ordinal,
            id,
        },
        key,
    )
}
fn encode_signed(value: &impl Serialize, key: &str) -> String {
    let bytes = serde_json::to_vec(value).expect("serializable cursor");
    let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).expect("HMAC accepts any key");
    mac.update(&bytes);
    format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(&bytes),
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    )
}
