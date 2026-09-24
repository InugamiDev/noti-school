# NOTI-2 API ledger

- [x] Exact base `18a023ceba2a51af12d17760af26019ca466ae36`, origin and clean initial worktree verified.
- [x] Orders and current policy packet SHA256 manifests pass; global/canonical/target instructions read.
- [x] Frozen wire contracts, environment rules, migrations and product documents read.
- [x] Executable Axum service: restricted configuration, health, unavailable capability state, static-only dist, bounded shutdown.
- [x] Session/CSRF/internal Host boundaries tested; transactional invitation SQL implemented, DB verification pending.
- [x] SQL-backed source/evidence/feedback/owner read-delete handlers implemented; real SQL execution pending.
- [x] PDF/text ingestion, lifecycle and private storage implemented; resource-limited PDF fixture passes. SSRF utility remains unconnected.
- [ ] Complete paid flow: validators, reservation-gated Jev/embedding helpers exist; generation, indexing queue, vector/graph and discovery absent.
- [x] Cargo fmt/check/test/clippy and executable wire-schema checks pass; route gaps inventoried in apps/api/README.md.
- [x] Machine handoff and scoped knowledge receipt prepared with partial status.

Constraints: one worker, no children, one implementation attempt <=35 minutes. No paid calls,
database provisioning, service changes, deployment, commits or pushes. No isolated test DB supplied.
Current packet and ORDER override legacy model defaults and audit spawning; independent audits remain
coordinator-owned. Target CLAUDE.md and .ckignore absent. Hook adapter resolves to read-only fleet-repo.
No project memory files were found in docs/.handoff; decisions stay in this scoped ledger.
Invitation creation has no frozen public endpoint; provisioning remains coordinator-owned.
Primary sources: https://docs.typesafe.ai/api, https://docs.typesafe.ai/models,
https://developers.openai.com/api/reference/resources/embeddings/methods/create,
https://docs.rs/axum/0.8.9/axum/. Direct dependency additions verified through crates.io registry.

Verification: 14 Rust tests (2 provider HTTP unit fixtures + 12 boundary/parser/static integration tests)
pass. Eight executable responses pass frozen JSON schemas; empty-environment boot and SIGTERM pass.
`cargo clippy -p noti-school-api --all-targets -- -D warnings` passes. Earlier failures were a missing
toolchain PATH, one delimiter, SQLx 0.9 dynamic-SQL type checking, and four lint findings; all corrected.
No live or mock repository was used. Real SQL isolation/races/idempotency/budget dispatch remain untested.
No live provider account, credentials, retrieval quality, SMTP or deployment verification is claimed.

Remaining required work: paid answer orchestration/persistence, embeddings/vector SQL, graph endpoint and
expansion, discovery, approved URL configuration/integration, indexing/retry worker, multilingual ingestion,
retention/account deletion, auth capability propagation, real SQL negative/concurrency suite and audits.
All routes and specific gaps are listed in apps/api/README.md. No source facts were seeded.
