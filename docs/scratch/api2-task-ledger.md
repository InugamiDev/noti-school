# NOTI-5 API integration ledger

Base: `27ac5b877f760a8b1f38c8663881a77ace9f66b1`. Single worker, 50-minute bounded attempt; no paid calls, deployment, push or shared-contract edits.

- [x] Read order, common contract, target/canonical instructions, five manifest inputs (all hashes verified), product specs and frozen addendum.
- [x] Durable paid stages, strict configuration and bounded provider HTTP.
- [x] Hybrid retrieval, graph provenance, Jev selection and textual claim support, answer persistence and idempotency.
- [x] Native indexing worker, ingestion metadata/recovery, official fetch and source lifecycle.
- [x] Identity capabilities, graph APIs, conversation list and account cleanup.
- [x] Actual runtime-role PostgreSQL/concurrency tests and complete mocked pipeline.
- [x] Final fmt/check/test/clippy/build and executable schema smoke passed after worker atomicity correction; dedicated SQL suite passed again.
- [x] API README rewritten with actual behavior and remaining verification boundaries.
- [x] Final human handoff written; machine receipt includes scope checks, exact commands/results and SHA256 artifacts.

Decisions: no automatic provider retries; unresolved transport retains reservation. Only the dedicated `noti_school_test_api2` database is authorized. Discovery is optional and remains separately disabled unless completely priced/implemented. Source approval is an explicit version action; it must not mutate sibling version statuses.

Knowledge: `/home/inu/.ultrathink/campaigns/noti-runner-20260925/context/MANIFEST.sha256` checked with `sha256sum -c`; AGENTS.md, CLAUDE.md, execution-contract.md, global-CLAUDE.md and knowledge-contract.md loaded. Canonical `/home/inu/ultrathink/{AGENTS,CLAUDE}.md` loaded read-only. Target CLAUDE.md and .ckignore absent. Current order overrides stale older-model/global delegation instructions. No VFS tool exposed; targeted rg/file reads used.

Verification: guarded product migrations (4) and Better Auth 1.7.6 core migration succeeded on the dedicated DB. Standard Rust suite: 4 unit tests plus 12 security tests; dedicated opt-in SQL journey test separately passed. Actual runtime role is nonprivileged `noti_school_api`; auth table access and direct budget-table mutation denied. Provider calls were ephemeral HTTP fixtures only. Tests cover concurrent root/stage/worker dispatch, USD50 cap and zero-rate accounting, disconnected callers, stage cancellation, cached indexing recovery, disabled-job retry after expiry, source quarantine/lifecycle, actual graph expansion/rejection, bilingual metadata/answers, cleanup/late settlement and SSRF denial. Schema smoke validates generated Answer, GraphEdge, Source, Job and Capabilities plus executable disabled boot and native Vietnamese HTML extraction.

Corrections during work: initial cargo command lacked the Rust toolchain PATH (fixed before compilation); clippy identified argument-count/style issues (resolved); code review caught late settlement restoring deleted caches and non-atomic job/version finalization (both corrected, focused SQL reruns pass). No failing live call or live credential test was attempted.

Remaining: optional discovery deliberately disabled; independent audits and NOTI-6 identity/schema integration pending; live corpus/credentials/quality unverified. Original-uploader-only indexing recovery and manual private-file/orphan-reservation reconciliation are documented operational limits. Controlled public-TLS/DNS-rebinding fixture and adversarial parser/load corpus were not run. Shared owner must review the language column/trigger and operational indexes accompanying stage DDL in 0004; old migrations remain unchanged.
