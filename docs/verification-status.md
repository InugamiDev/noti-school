# Verification Status

## Prior RAG acceptance evidence — 6 October 2026

Historical evidence through frozen candidate `3be4d38df1a8bdcebf4ea720e5d40aa8354a00a0`, derived from reviewed current-tree snapshot `590d0dd41661278af1d8676c96b501f5fe3c9cd6`. These prior checks do not approve subsequent repairs. Default evidence checks use OpenAI; Jev is explicit opt-in with no fallback. Paid calls remain disabled by default.

- Prior Rust 1.94.0 format/check/build and Clippy with warnings denied passed. The normal test command passed nine library, six evaluator and twelve security tests; its one ignored database test was run separately, not counted as a normal-test pass.
- The separately enabled PostgreSQL 16/pgvector/runtime-role suite passes with loopback providers. It covers OpenAI-only admission without Jev credentials/prices, auxiliary stage spend, bilingual answers, insufficiency/conflict/unsupported claims, invalid IDs/schema/usage/refusals, a real stage timeout with retained funds, replay, malicious document text, revoked identity/current-source changes during inference, graph provenance and graph approval revoked before commit. Existing Jev, isolation, contention, accounting and recovery scenarios remain exercised.
- Native TypeScript 7.0.2, generated-schema drift, 17 foundation tests and type-aware Oxlint passed. RAG-1R2 repaired Oxfmt formatting in the two touched TS files with the campaign single-quote configuration; both files then passed the native formatting check. No unrelated formatting rewrite was applied.
- R4-01 and R5-03 have candidate fixes with actual runtime SQL/router regressions: root/stage dispatched and uncertain receipts remain fenced; a committed reserved indexing stage resumes once with the same receipt. Review clearance remains pending. The other five findings below remain out of this bounded scope.

Prior exact commands, counts, failures and durations are in the worker's ignored `.handoff/rag-1.md`, `.handoff/rag-1r.md` and their command ledgers. The first RAG-1 integration attempt failed on an existing hardcoded test binary path under the isolated Cargo target directory; the path now honors CARGO_TARGET_DIR. No website/auth code, migrations, locks or deployment configuration changed. No real provider, HCMIU quality, SMTP, OAuth or production readiness was tested.

## RAG-R3/R4 repair candidate — 6 October 2026

Independent review1 identified R1-01: generic JSON parsing silently replaced duplicate fields before typed validation. The two original rejection probes reproduced this defect (two failures, exit 101). The repair rejects duplicate decoded object keys recursively in both the Responses envelope and structured text, including escaped-equivalent spellings. It preserves public helper signatures, exact citation-set validation, model/usage checks and conservative dispatched reservations. No verdict is reinterpreted.

Review2 additionally reproduced R2-01 (identity/source checks becoming stale during persistence lock waits), R2-02 (completed root replay omitting execution identity), and R2-03 (never-dispatched prior-month and safely released stages unable to recover). The candidate moves final validation after blocking persistence writes, binds both replay branches to the exact execution contract, and safely replaces only proven never-dispatched stale/released receipts under ownership/accounting locks with history and caps retained. No cross-service atomic identity transaction is claimed.

The repaired normal Rust suite passes 15 library, six evaluator and twelve security tests; its one ignored DB test is separately run and passes. Actual runtime SQL/loopback regressions cover raw duplicate fields with no answer/citation persistence and retained funds; observed PostgreSQL conversation-lock waits followed by revocation/expiry and rollback; bounded lock timeout; changed-contract completed/racing replay conflicts with zero HTTP; and UTC rollover, released-stage concurrent one-time recovery, exhaustion rollback, bounded attempts and unresolved-charge fences. The raw-field matrix includes escaped-equivalent keys and nested objects/arrays, while valid numbers, UTF-8 and escapes retain normal semantics. Native TS/schema/17 foundation tests and the two prior TS Oxfmt/Oxlint checks pass; no TS source is changed by this repair.

The first RAG-R3 runtime attempt stopped before the new cases on leftover synthetic queue work. P0 authorized marker/data-directory-checked cleanup of only queued/running synthetic ingestion jobs; no financial/source evidence was deleted. The first R4 concurrent-recovery run exposed a settlement lock inversion, confirmed by PostgreSQL deadlock diagnostics and corrected by taking ownership locks before the accounting lock. A subsequent test fixture needed an explicit bigint cast for aggregate arithmetic. These failed attempts remain in `.cache/rag-r3/commands.jsonl` and `.cache/rag-r4/commands.jsonl`; passing reruns do not erase them. Exact final commands/counts/durations/hashes and limitations are in the six-section `.handoff/rag-r4.md` and JSON receipt.

Worker verification receipt dated 6 October 2026: the R3/R4 repairs and R5 setup correction were frozen in `507a86dfd3f44402be6de33f631eaa11e8f2153f`. These results record that implementation stage, not release acceptance. P0 must independently rerun each revised candidate and obtain all three independent final-SHA clearances. The five unrelated historical findings and live gates below remain open; no real-provider or semantic-quality claim follows from synthetic checks.

## RAG-R6 provider parsing receipt — 6 October 2026

Review2's final recheck resolved its R2-01/R2-02/R2-03 scenarios but reproduced inherited R2-04: repeated Jev answer IDs silently overwrote contradictory scores and permitted an answer/citation. Worker regressions independently reproduced duplicate Jev-ID and embedding-model acceptance before repair (two failed tests; four existing duplicate tests passed). Both remaining raw validators now reuse the existing recursive decoded-key parser before normalization; Responses, Jev and embeddings share strict duplicate rejection. Existing typed checks, helper signatures, settlement rules and no-fallback behavior are preserved. Exact worker checks and limitations are recorded in `.handoff/rag-r6.md` and `.handoff/rag-r6-result.json`; final independent approval remains pending. TS/schema/foundation evidence above is prior evidence, not a new R6 run.

Fresh R6 worker checks: Rust 1.94.0 format/check/build and Clippy with warnings denied passed; 17 library, six evaluator and twelve security tests passed. The one normally ignored DB test separately passed against the marked loopback database, including six new raw Jev-selection/support and embedding ambiguity cases with zero answer/citation publication, positive dispatched reservations and replay without extra HTTP. Valid OpenAI/Jev paths and prior lock-race/UTC/financial scenarios remain passing. The separate offline evaluator passed all 32 synthetic cases; this is not live semantic-quality evidence. Every Rust test/mock/DB command acquired the campaign services lock with compiler/test concurrency one. The guarded queue check found zero leftover jobs; no financial or source records were deleted.

## Historical integrated snapshot

As of 25 September 2026. Tested and independently reviewed application source:
`b7732e60ef9f6bdb2854900ed6ad01ee52770eff` on `bootstrap/noti-school`.
This document records evidence, not release approval. No main merge or public deployment.

## Passing Evidence

- Integrated checks: 17 foundation checks, strict TypeScript/schema validation, 19 auth tests,
  seven identity/operator integration tests, 10 web unit tests and 53 browser tests.
- Rust formatting, build, clippy with warnings denied, unit/security tests, separately enabled
  PostgreSQL pipeline test and native HTTP smoke pass. External AI providers are loopback mocks.
- Actual Better Auth and Rust with synthetic PostgreSQL identities: signup, locally captured email
  verification, invitation redemption, login, source upload/approval/search/download, history,
  citations, feedback and confirmed account deletion/session revocation pass.
- Independent experience review repeats the strict web build, all 10 units and all 53 browser
  tests without failures, skips or flaky retries. Screenshots cover desktop, wide, short and mobile
  layouts; canvas/bitmap pixel checks verify motion, pause, reduced motion and lifecycle cleanup.
- Entry dolly, bounded ambient motion/parallax, immediate-request submit zoom and animated
  no-WebGL fallback are implemented. The user's Chrome ran the fallback with observed changing
  transforms and an exactly stable paused frame. Browser settings were not changed.

Headless WebGL checks use software rendering, not physical mobile GPU/FPS measurements. The lazy
Three.js chunk produces a non-failing size warning. Synthetic replies and valid citation syntax
do not establish factual correctness, source authenticity or real English/Vietnamese retrieval quality.

## Open Review Findings

All entries are P2/medium. None is silently waived by the passing test counts above.

| ID | Observed Issue | Required Regression |
| --- | --- | --- |
| R4-01 | Index recovery fences stage-linked unresolved charges but overlooks root-level dispatched/uncertain receipts. Reproduced with actual runtime SQL/router and no provider HTTP. | Both receipt shapes must block redispatch until reconciliation; preserve every existing receipt. |
| R4-02 | Eight simultaneous feedback-context reads each hold a transaction and request another pool connection, yielding eight 503 responses. | Assemble using the held connection while preserving author/reviewer authorization; exercise concurrent reads and related nested acquisitions. |
| R5-01 | Invalid public session checks and public capability reads can consume shared internal identity quotas. Service probe reproduced exhaustion; public Rust reachability was source-traced. | Invalid traffic must not exhaust another verified user's capacity; coalesce safe capability reads and retain bounded admission. |
| R5-02 | The outbound address filter accepts the non-global 192.88.99.2 relay address. Function and special-prefix boundary probes reproduce it; no network exploit was attempted. | Reject the prohibited relay range and test registry-derived prefix boundaries without weakening DNS pinning or TLS. |
| R5-03 | A committed but never-dispatched indexing stage with no result appears permanently conflicted on recovery. Source/SQL inference, not an executed crash reproduction. | Reproduce the pre-dispatch interruption, then distinguish safe recovery from dispatched uncertainty without deleting accounting evidence. |
| R6-01 | A definitively completed question retains its operation key, so explicit New question with identical input replays the old answer. Browser reproduction uses backend-equivalent mock replay. | Retire completed operation identity while retaining keys for ambiguous stop/disconnect/timeout/conflict outcomes; no automatic paid retries. |
| R6-02 | Initial sign-in clears a deletion-confirmation callback despite telling the visitor to keep the tab open. Reproduced in a synthetic browser flow. | Preserve the transient initial-sign-in callback with server account binding, or truthfully require reopening the link; keep logout/account-switch cleanup. |

Full scoped reports and reproduction artifacts are retained in the private development evidence
directory, outside the application repository. The review did not find another animation defect.
Corrected application source requires fresh relevant tests and independent review before rollout.

## Live Release Gates

OpenAI and selected-provider credentials/pricing (Jev only when opted in), SMTP delivery, Google OAuth, approved HCMIU sources and human
bilingual labels remain unavailable or unverified. Optional web discovery is unimplemented and
disabled. Contextual interpretation of earlier conversation turns is not implemented; conversation
ownership and institution continuity must not be described as full conversational reasoning.

HomeLab PM2/Cloudflare configuration is prepared, not deployed. DNS/TLS, production database
provisioning, backups/restoration, operational retention scheduling, abuse/load controls and bounded
live-provider evaluation remain release gates. The private visual preview has no real backend access
and must not be mistaken for a live university service. No paid application call was made in these checks.
