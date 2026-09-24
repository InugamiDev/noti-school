//! Shared wire schema. API implements these contracts; this crate runs no service.
pub const CONTRACT_VERSION: &str = "1";
pub const MONTHLY_CAP_MICRO_USD: u64 = 50_000_000;
pub const EMBEDDING_DIMENSIONS: usize = 1536;
pub const JSON_SCHEMA: &str = include_str!("../../contracts/schema.json");
