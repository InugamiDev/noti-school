use crate::error::{Error, Result};
use std::{collections::HashMap, path::PathBuf};

#[derive(Clone)]
pub struct Config {
    pub origin: String,
    pub secret: Option<String>,
    pub database_url: Option<String>,
    pub web_dist: PathBuf,
    pub uploads: PathBuf,
    pub mode: String,
}
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
            ("JEV_MODEL", "jev-1.13.0"),
        ] {
            if get(key, expected) != expected {
                return Err(Error("invalid_request"));
            }
        }
        let mode = get("AI_MODE", "disabled");
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
        Ok(Self {
            origin,
            secret,
            database_url,
            mode,
            web_dist: get("WEB_DIST_DIR", "./apps/web/dist").into(),
            uploads: get("UPLOAD_DIR", "./data/uploads").into(),
        })
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
