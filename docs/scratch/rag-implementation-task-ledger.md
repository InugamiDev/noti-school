# RAG-1 implementation ledger

Owner Danny; campaign noti-school-rag-20261006. Source 590d0dd41661278af1d8676c96b501f5fe3c9cd6. Worker only; no children, commits, paid calls or deployment.

- [x] Verify packet checksums and all 176 source hashes; read product contracts and pipeline.
- [x] Selected provider Rust/TS/schema/default/documentation parity.
- [x] Bounded reranking, typed evidence and claim gates, strict shared Responses validation.
- [x] Reservation identity, recovery fences, deadline and safe traces.
- [x] Mock HTTP/runtime PostgreSQL adversarial and recovery coverage.
- [x] Rust/native TS/schema/foundation verification; exact command receipts.
- [x] Scope audit and six-section handoff/result JSON for P0; independent reviews pending.

Tools README was absent at initial inventory; P0 subsequently provisioned Rust 1.94.0, native TS 7.0.2 and the marked PostgreSQL 16/pgvector test DB. Historical Jev-required initial mode is superseded by current order; no fallback permitted. Website remains read-only.

Rust, native TS/schema, 17 foundation tests and the separately locked runtime DB suite pass. Oxfmt flags the same two baseline files. R4-01/R5-03 runtime regressions pass; other baseline findings remain. Exact command receipts and initial failures are retained in ignored worker evidence. P0 rerun and three independent reviews are the next gate, not completed by this worker.

## RAG-1R2 corrected coordinator finding and regression coverage

Frozen candidate: `61ad4ef5fc18ac747688cf4a5dbcd1e00cccacef`. Prior evidence is preserved.

- [x] Reproduce actual frozen validator behavior: strict support subsets already reject; the reported publication defect does not reproduce against this candidate.
- [x] Remove the task-owned unfinished pipeline change with apply_patch; `pipeline.rs` and `rag.rs` exactly match the frozen candidate. No production behavior, helper, prompt, schema or accounting change.
- [x] Runtime DB/mock coverage: two approved passages, strict-subset rejection with no persisted answer or citations, out-of-order exact-set support entries, unsupported overall abstention, duplicate/invented IDs, duplicate/missing/unknown indices and swapped claim-index/evidence-set mismatches.
- [x] Format only the two authorized TS files with native Oxfmt and single quotes; native TS7, schema, 17 foundation tests, type-aware Oxlint and formatting check pass.
- [x] Corrected coverage-only candidate: 9 Rust unit tests, 12 security tests, the full locked DB suite (1 test, nine new support scenarios), 17 foundation tests, native TS7/schema, type-aware Oxlint, Oxfmt, Rust fmt/Clippy/build all pass. Exact rerun evidence uses `r2-*` names in `.cache/rag-1r/commands.jsonl`.
- [x] P0 corrected the earlier finding and explicitly declined weakening exact-set validation. Successful subset narrowing is superseded, not blocked or required.

The DB suite writes its fresh synthetic wire artifact to ignored `.cache/rag-1r/pipeline-wire.json`, preserving the frozen tracked fixture and prior worker evidence. This candidate still requires P0 rerun/review; no production or semantic-quality claim is made.

## RAG-R3 duplicate JSON field repair

Source: `3be4d38df1a8bdcebf4ea720e5d40aa8354a00a0`; clean at start. Only independent review1's report and probes were read. OpenAI default/Jev opt-in remains unchanged.

- [x] Reproduce R1-01 before repair: both original duplicate evidence-ID and conflict/supported verdict rejection assertions fail (2 failed, exit 101).
- [x] Recursively reject decoded duplicate keys before constructing JSON values at both Responses parsing boundaries, using existing serde facilities and unchanged public signatures.
- [x] Add raw-field matrix, escaped-key/nesting coverage and valid number/Unicode/escape controls; focused parser tests and Clippy pass.
- [x] Six raw-response DB scenarios (generation/support, escaped fields, outer model/usage) prove no answer/citation persistence, retained funds and fenced replay. Initial DB attempt stopped earlier on stale test queue work; its failure is preserved. RAG-R4 subsequently authorized only synthetic queue cleanup with marker/data-directory checks and receipts.
- [x] Parser checks passed; work and final handoff continue under the expanded RAG-R4 order below.

This is an uncommitted repair candidate. P0 freeze/rerun and all three independent reviews of the revised SHA remain required; no acceptance or live-evaluation claim.

## RAG-R4 pipeline boundaries

Same frozen source `3be4d38df1a8bdcebf4ea720e5d40aa8354a00a0`, preserving the RAG-R3 changes. P0 explicitly authorized review2's report/probes and the additional production/test/doc paths. No review3 report was read.

- [x] R2-01: all blocking persistence writes precede final session and time-sensitive SQL checks; mutation locks retained, five-second lock/eight-second statement limits. Actual PostgreSQL conversation waits precede session revocation/source expiry, and both requests roll back answers/citations. A held-lock timeout also fails closed. Final checks do not claim atomic cross-service authorization.
- [x] R2-02: exact execution-contract root hash excludes secrets and binds provider/models/request templates/prompt/schema versions. Completed and forced INSERT-race replay checks reject changed contracts without HTTP; unchanged replay remains idempotent. Helper signatures and public wire schemas remain unchanged.
- [x] R2-03: safe prior-month reserved release/re-reservation and already-released recovery under ownership/accounting locks, with history retained and three-attempt/current-month/cap/carry checks. Actual SQL fixtures cover concurrent one-time recovery, repeated replay, exhaustion rollback, attempt limit and dispatched/uncertain/settled stage/root fences.
- [x] Concurrent recovery exposed an accounting/ownership lock inversion during settlement. PostgreSQL deadlock evidence is preserved; settlement now takes ownership before the accounting lock. A subsequent fixture numeric-decoding failure was corrected with an explicit bigint cast.
- [x] Full DB suite passes with all new scenarios. Fresh normal Rust counts: 15 library + 6 evaluator + 12 security; separately 1 DB test. Native TS/schema/17 foundation tests and prior two-file Oxfmt/Oxlint checks pass. Exact final command receipts and file hashes are returned in `.handoff/rag-r4.md` and `.handoff/rag-r4-result.json`.

All commands use isolated caches, jobs/tests one and the campaign lock for port/DB suites. Queue cleanup changes only leftover queued/running synthetic ingestion job state; no financial/source evidence is deleted. No commits, deployment, new dependencies, migrations, live calls or child agents. Revised-SHA P0 rerun and all three independent reviews are still required.

## RAG-R5 setup documentation correction

- [x] Correct review3 R3-02's current deployment/database setup statements: default OpenAI requires its exact configured chat model and three current dated rates; TypeSafe/Jev key, pinned model and two additional rates are required only for explicit Jev mode. Disabled paid-call defaults, no automatic fallback, operator commands and deployment approval gates remain intact.
- [x] Record NVIDIA RAG Blueprint design provenance without deployment, feature-equivalence or benchmark claims.
- [x] Inspect the edited documentation and run targeted search, whitespace and R4 source-hash integrity checks; exact receipts are in `.handoff/rag-r5.md` and `.handoff/rag-r5-result.json`. No code, test, schema, dependency or migration edits; no expensive rebuild for this documentation-only change.

R4 parser/boundary evidence remains unchanged. P0 freeze, full checks and independent rechecks remain pending; this correction grants no deployment permission or final acceptance.

## RAG-R6 remaining raw provider boundaries

Source `507a86dfd3f44402be6de33f631eaa11e8f2153f` was clean at start. Only review2's requested final report, diagnostic source and Jev probe log were read. Current repair order overrides historical concurrency settings: one compiler job/test thread and campaign lock for every Rust test/mock/DB command.

- [x] Reproduce duplicate Jev answer-ID and embedding-model acceptance with raw regression tests before repair: two failed, four existing duplicate tests passed (exit 101).
- [x] Reuse `UniqueJson` at the Jev and embedding raw boundaries before typed conversion/normalization; preserve signatures, expected IDs, finite scores, usage/vector validation and conservative charges.
- [x] Add literal/escaped duplicate matrices and valid Jev/1536-float controls; focused duplicate suite passes six tests.
- [x] Full Rust suite passes 17 library + six evaluator + twelve security tests; separately one DB test passes, including six new ambiguity cases with retained dispatched funds and fenced replay. Format/check/Clippy with warnings denied/build pass; offline evaluator passes all 32 cases. Exact exits/durations are in `.handoff/rag-r6.md` and `.handoff/rag-r6-result.json`. TS/schema/foundation results remain prior evidence only.

No schema/dependency/migration, provider HTTP, budget, publication or replay implementation changes. No live calls, deployment or independent approval claim.
