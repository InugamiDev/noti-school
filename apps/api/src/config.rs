use crate::error::{Error, Result};
use std::{collections::HashMap, path::PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EvidenceProvider {
    Openai,
    Jev,
}
impl EvidenceProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Jev => "jev",
        }
    }
}

#[derive(Clone)]
pub struct Config {
    pub origin: String,
    pub secret: Option<String>,
    pub database_url: Option<String>,
    pub web_dist: PathBuf,
    pub uploads: PathBuf,
    pub mode: String,
    pub evidence_provider: EvidenceProvider,
    pub openai_key: Option<String>,
    pub jev_key: Option<String>,
    pub generation_model: Option<String>,
    pub jev_model: String,
    pub tinyfish_key: Option<String>,
    pub tinyfish_daily_search_limit: u32,
    pub tinyfish_daily_fetch_limit: u32,
    pub tinyfish_daily_search_limit_per_space: u32,
    pub tinyfish_daily_fetch_limit_per_space: u32,
    pub web_min_confidence: f64,
    pub graph_auto_approve: f64,
}
// Exact pinned Jev models (docs.typesafe.ai/models, consulted 2026-11-18); aliases are rejected.
pub const JEV_MODELS: [&str; 2] = ["jev-1.14.0", "jev-1.13.0"];
impl Config {
    pub fn load() -> Result<Self> {
        let mut vars: HashMap<String, String> = std::env::vars().collect();
        if let Some(path) = vars.get("NOTI_ENV_FILE") {
            use std::os::unix::fs::PermissionsExt;
            let meta = std::fs::symlink_metadata(path).map_err(|_| Error("core_unavailable"))?;
            if !meta.is_file() || meta.permissions().mode() & 0o077 != 0 {
                return Err(Error("core_unavailable"));
            }
            for item in dotenvy::from_path_iter(path).map_err(|_| Error("core_unavailable"))? {
                let (key, value) = item.map_err(|_| Error("core_unavailable"))?;
                vars.entry(key).or_insert(value);
            }
        }
        Self::parse(&vars)
    }
    pub fn parse(vars: &HashMap<String, String>) -> Result<Self> {
        let get = |key: &str, default: &str| {
            vars.get(key)
                .filter(|s| !s.is_empty())
                .cloned()
                .unwrap_or(default.into())
        };
        let optional = |key: &str| vars.get(key).filter(|s| !s.is_empty()).cloned();
        let env = get("NODE_ENV", "development");
        let origin = get("APP_ORIGIN", "http://localhost:3000");
        let url = url::Url::parse(&origin).map_err(crate::error::invalid)?;
        if !["development", "test", "production"].contains(&env.as_str())
            || url.origin().ascii_serialization() != origin
            || !url.username().is_empty()
            || url.password().is_some()
            || !["http", "https"].contains(&url.scheme())
            || (env == "production" && url.scheme() != "https")
        {
            return Err(Error("invalid_request"));
        }
        for (key, expected) in [
            ("API_BIND_ADDRESS", "127.0.0.1:3810"),
            ("AUTH_INTERNAL_URL", "http://127.0.0.1:3811"),
            ("AI_MONTHLY_BUDGET_USD", "50"),
            ("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("EMBEDDING_DIMENSIONS", "1536"),
        ] {
            if get(key, expected) != expected {
                return Err(Error("invalid_request"));
            }
        }
        let jev_model = get("JEV_MODEL", JEV_MODELS[0]);
        if !JEV_MODELS.contains(&jev_model.as_str()) {
            return Err(Error("invalid_request"));
        }
        let limit = |key: &str, default: u32, max: u32| -> Result<u32> {
            let raw = get(key, &default.to_string());
            match raw.parse::<u32>() {
                Ok(n) if (1..=max).contains(&n) && raw.bytes().all(|b| b.is_ascii_digit()) => Ok(n),
                _ => Err(Error("invalid_request")),
            }
        };
        // Plain decimal only (digits, optionally '.' and digits), as packages/contracts/src/env.ts.
        let probability = |key: &str, default: &str| -> Result<f64> {
            let raw = get(key, default);
            let (whole, fraction) = raw.split_once('.').unwrap_or((&raw, "0"));
            let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
            match raw.parse::<f64>() {
                Ok(n) if digits(whole) && digits(fraction) && (0.0..=1.0).contains(&n) => Ok(n),
                _ => Err(Error("invalid_request")),
            }
        };
        let tinyfish_daily_search_limit = limit("TINYFISH_DAILY_SEARCH_LIMIT", 1000, 12000)?;
        let tinyfish_daily_fetch_limit = limit("TINYFISH_DAILY_FETCH_LIMIT", 300, 1000)?;
        let tinyfish_daily_search_limit_per_space =
            limit("TINYFISH_DAILY_SEARCH_LIMIT_PER_SPACE", 200, 12000)?;
        let tinyfish_daily_fetch_limit_per_space =
            limit("TINYFISH_DAILY_FETCH_LIMIT_PER_SPACE", 60, 1000)?;
        let web_min_confidence = probability("WEB_EVIDENCE_MIN_CONFIDENCE", "0.6")?;
        let graph_auto_approve = probability("GRAPH_AUTO_APPROVE", "0.9")?;
        let mode = get("AI_MODE", "disabled");
        let evidence_provider = match get("EVIDENCE_PROVIDER", "openai").as_str() {
            "openai" => EvidenceProvider::Openai,
            "jev" => EvidenceProvider::Jev,
            _ => return Err(Error("invalid_request")),
        };
        let live = get("AI_LIVE_CALLS_ENABLED", "false");
        if !["disabled", "mock", "live"].contains(&mode.as_str())
            || !["true", "false"].contains(&live.as_str())
            || (live == "true") != (mode == "live")
            || (env == "production" && mode == "mock")
        {
            return Err(Error("invalid_request"));
        }
        if vars.keys().any(|k| {
            k.starts_with("VITE_")
                && ["KEY", "SECRET", "PASSWORD", "DATABASE", "TOKEN"]
                    .iter()
                    .any(|s| k.to_uppercase().contains(s))
        }) {
            return Err(Error("invalid_request"));
        }
        let secret = optional("INTERNAL_AUTH_SECRET");
        if secret.as_ref().is_some_and(|s| s.len() < 32) {
            return Err(Error("invalid_request"));
        }
        let database_url = optional("DATABASE_URL");
        if let Some(raw) = &database_url {
            validate_database(raw)?;
        }
        let openai_key = optional("OPENAI_API_KEY");
        let jev_key = optional("TYPESAFE_API_KEY");
        let generation_model = optional("OPENAI_CHAT_MODEL");
        let tinyfish_key = optional("TINYFISH_API_KEY");
        for value in [&openai_key, &jev_key, &generation_model, &tinyfish_key]
            .into_iter()
            .flatten()
        {
            if value.len() > 512
                || value
                    .bytes()
                    .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
            {
                return Err(Error("invalid_request"));
            }
        }
        Ok(Self {
            origin,
            secret,
            database_url,
            mode,
            evidence_provider,
            openai_key,
            jev_key,
            generation_model,
            jev_model,
            tinyfish_key,
            tinyfish_daily_search_limit,
            tinyfish_daily_fetch_limit,
            tinyfish_daily_search_limit_per_space,
            tinyfish_daily_fetch_limit_per_space,
            web_min_confidence,
            graph_auto_approve,
            web_dist: get("WEB_DIST_DIR", "./apps/web/dist").into(),
            uploads: get("UPLOAD_DIR", "./data/uploads").into(),
        })
    }
    pub fn ai_keys(&self) -> Result<(&str, &str, &str)> {
        if self.mode != "live" {
            return Err(Error("provider_unavailable"));
        }
        Ok((
            self.openai_key
                .as_deref()
                .ok_or(Error("provider_unavailable"))?,
            match self.evidence_provider {
                EvidenceProvider::Jev => self
                    .jev_key
                    .as_deref()
                    .ok_or(Error("provider_unavailable"))?,
                EvidenceProvider::Openai => "",
            },
            self.generation_model
                .as_deref()
                .ok_or(Error("provider_unavailable"))?,
        ))
    }
}
impl Config {
    // Jev also supplies calibrated confidence whenever its key is configured in live mode, not only
    // when it is the selected evidence provider. Selected Jev still never falls back to OpenAI.
    pub fn jev(&self) -> Option<&str> {
        (self.mode == "live")
            .then_some(self.jev_key.as_deref())
            .flatten()
    }
    // Provider whose failures gate admission: any configured Jev use joins the shared cooldown.
    pub fn jev_dependency(&self) -> EvidenceProvider {
        if self.evidence_provider == EvidenceProvider::Jev || self.jev().is_some() {
            EvidenceProvider::Jev
        } else {
            EvidenceProvider::Openai
        }
    }
    pub fn tinyfish(&self) -> Option<&str> {
        (self.mode == "live")
            .then_some(self.tinyfish_key.as_deref())
            .flatten()
    }
}
pub fn validate_database(raw: &str) -> Result<()> {
    let u = url::Url::parse(raw).map_err(crate::error::invalid)?;
    let db = u.path().trim_start_matches('/');
    let test = db.strip_prefix("noti_school_test_").is_some_and(|v| {
        !v.is_empty()
            && v.len() <= 40
            && v.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
    });
    if !["postgres", "postgresql"].contains(&u.scheme())
        || ![Some("localhost"), Some("127.0.0.1"), Some("[::1]")].contains(&u.host_str())
        || (db != "noti_school" && !test)
        || u.username() != "noti_school_api"
        || u.password().is_none_or(str::is_empty)
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err(Error("invalid_request"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn web_evidence_settings_mirror_the_environment_contract() {
        let c = Config::parse(&HashMap::new()).unwrap();
        assert_eq!(c.jev_model, "jev-1.14.0");
        assert_eq!(
            (c.tinyfish_daily_search_limit, c.tinyfish_daily_fetch_limit),
            (1000, 300)
        );
        assert_eq!(
            (
                c.tinyfish_daily_search_limit_per_space,
                c.tinyfish_daily_fetch_limit_per_space
            ),
            (200, 60)
        );
        assert_eq!((c.web_min_confidence, c.graph_auto_approve), (0.6, 0.9));
        assert!(c.tinyfish().is_none() && c.jev().is_none());
        let with = |k: &str, v: &str| Config::parse(&HashMap::from([(k.to_owned(), v.to_owned())]));
        assert_eq!(
            with("JEV_MODEL", "jev-1.13.0").unwrap().jev_model,
            "jev-1.13.0"
        );
        for (k, v) in [
            ("JEV_MODEL", "jev-latest"),
            ("JEV_MODEL", "jev-1.14"),
            ("TINYFISH_DAILY_SEARCH_LIMIT", "0"),
            ("TINYFISH_DAILY_SEARCH_LIMIT", "12001"),
            ("TINYFISH_DAILY_FETCH_LIMIT", "+5"),
            ("TINYFISH_DAILY_FETCH_LIMIT", "1001"),
            ("WEB_EVIDENCE_MIN_CONFIDENCE", "1.01"),
            ("WEB_EVIDENCE_MIN_CONFIDENCE", "NaN"),
            ("GRAPH_AUTO_APPROVE", "9e-1"),
            ("TINYFISH_API_KEY", "has space"),
            ("TINYFISH_DAILY_SEARCH_LIMIT_PER_SPACE", "0"),
            ("TINYFISH_DAILY_FETCH_LIMIT_PER_SPACE", "1001"),
        ] {
            assert!(with(k, v).is_err(), "{k}={v}");
        }
        // Same rejected forms as tests/foundation/environment.test.ts.
        for k in [
            "TINYFISH_DAILY_SEARCH_LIMIT",
            "TINYFISH_DAILY_FETCH_LIMIT",
            "TINYFISH_DAILY_SEARCH_LIMIT_PER_SPACE",
            "TINYFISH_DAILY_FETCH_LIMIT_PER_SPACE",
        ] {
            for v in [
                "1e3", "+5", "-5", "0x10", " 5", "5 ", "5\t", "5.0", "5_0", "Infinity", "NaN",
            ] {
                assert!(with(k, v).is_err(), "{k}={v:?}");
            }
            assert!(with(k, "5").is_ok(), "{k}");
        }
        for k in ["WEB_EVIDENCE_MIN_CONFIDENCE", "GRAPH_AUTO_APPROVE"] {
            for v in [
                "9e-1", "1E0", "+0.6", "-0", "0x1", " 0.6 ", "0.6\n", ".6", "6.", "0,6", "NaN",
                "Infinity", "1.01",
            ] {
                assert!(with(k, v).is_err(), "{k}={v:?}");
            }
            for (v, n) in [("0", 0.0), ("1", 1.0), ("0.75", 0.75), ("1.0", 1.0)] {
                let c = with(k, v).unwrap();
                let got = if k == "GRAPH_AUTO_APPROVE" {
                    c.graph_auto_approve
                } else {
                    c.web_min_confidence
                };
                assert_eq!(got, n, "{k}={v}");
            }
        }
        let live = Config::parse(&HashMap::from([
            ("AI_MODE".to_owned(), "live".to_owned()),
            ("AI_LIVE_CALLS_ENABLED".into(), "true".into()),
            ("TINYFISH_API_KEY".into(), "fixture".into()),
            ("TYPESAFE_API_KEY".into(), "fixture".into()),
        ]))
        .unwrap();
        assert!(live.tinyfish().is_some() && live.jev().is_some());
        assert_eq!(
            live.jev_dependency(),
            EvidenceProvider::Jev,
            "configured Jev joins admission"
        );
    }
}
