# Audit repair ledger — 2026-10-31

Source: static audit of `7b3a42f` (four scoped read-only reviews plus coordinator spot checks).
No paid calls, deployment, push or merge. Every fixture stays synthetic.
Owners: one owner per path; migrations `0005_audit_hardening.sql` (API-B), `0006_budget_reconcile.sql` (API-A).

Status: `[ ]` pending, `[~]` in progress, `[x]` done (local evidence below), `[-]` dropped, `[!]` blocked.

## P1 — availability and cost accounting

- [x] A-01 Settle validated usage / release holds on post-dispatch validation, timeout and non-2xx failures (`provider_http.rs`) — API-A
- [x] A-02 Operator reconciliation path for `dispatched`/`uncertain` holds; mark ambiguous failures `uncertain` — API-A
- [x] A-03 Input-induced validation failures (invented citation IDs, `rag::validate`) do not trip the global provider cooldown — API-A
- [x] R5-01 Per-client internal identity quota; no forwarding of malformed cookies; cached/coalesced capability and readiness reads — AUTH + API-B
- [x] A-04 Public auth quotas: global new-visitor bucket, saturating 4096-key maps, 8.5 s padding filling 48 slots, targeted account lockout — AUTH
- [x] A-05 One SMTP failure latches email off until restart (`mail.ts:83`); recover after cooldown — AUTH
- [x] A-06 Eight slow request bodies block every route (`lib.rs` 8-slot semaphore before body read); bound body read time — API-B

## P2 — correctness

- [-] A-07 Chunk locators: dropped. Contract `review-repair-addendum.md:29` defines chunk-relative spans; whole-chunk citations start at zero by design.
- [x] R6-01 Retire completed-question operation key; keep only for ambiguous outcomes — WEB
- [x] R6-02 Preserve deletion-confirmation callback through initial sign-in — WEB
- [x] R4-02 Feedback context assembled on the held connection — API-B
- [x] R5-02 Reject 192.88.99.0/24; prefix boundary tests — API-B
- [x] A-08 Invitation redemption must not un-revoke or demote memberships; revoke expires outstanding invitations — API-B
- [x] A-09 Show answers unavailable state from capabilities before asking — WEB
- [x] A-10 Retry after definitive provider failure shows unavailable, not conflict — API-A + WEB
- [x] A-11 Account deletion vs invitation redemption race — API-B

## P3 — hardening and cleanup

- [x] A-12 Expired idempotency keys reusable; bounded cleanup — API-B
- [x] A-13 One hidden citation 404s the whole conversation list (`answers.rs`) — API-B
- [x] A-14 Runtime role DELETE on evidence tables — API-B (migration 0005)
- [x] A-15 Missing indexes — API-B (migration 0005)
- [!] A-16 Separate internal bearer / invitation HMAC / cursor HMAC secrets — coordinator (contracts)
- [x] A-17 Remove unused public `GET /delete-user/callback` — AUTH
- [x] A-18 Enumeration padding for 4xx on verification email — AUTH
- [x] A-19 Jev cached-answer indexing without panics — API-A
- [x] A-20 Month rollover between reserve and dispatch reports budget_exhausted — API-A
- [x] A-21 `AbortSignal.any` fallback; timeout during body read maps to "processing may continue" — WEB
- [x] A-22 Neutral coverage fallback instead of hardcoded HCMIU — WEB
- [x] A-23 Release Three.js GPU objects on context-loss fallback — WEB
- [x] A-24 Do not hold DB transaction across file write and parsing — API-B
- [x] A-25 Idempotency check before outbound URL fetch — API-B
- [x] A-26 Split `App.tsx` history and answer views — WEB

## Verification and gates

- [ ] R4-01 Code fix present (`budget.rs:83`); independent review pending
- [ ] R5-03 Code fix present (`budget.rs:113-150`); executed crash regression and review pending
- [~] ENV Rust 1.94.0, Node 24.18, pnpm 10.29.2 locally; TS checks and cargo fmt/clippy done; Rust and PostgreSQL tests still need Linux
- [!] LIVE Provider credentials, SMTP, OAuth, approved HCMIU sources, bilingual labels, backups, load tests — coordinator/external only

## Evidence

`[x]` means implemented, with the local checks below; it is not independent review clearance.

Environment (Windows host, user-local): Rust 1.94.0 (`x86_64-pc-windows-gnu` host) cross-checking `x86_64-unknown-linux-gnu` through zig 0.x/cargo-zigbuild, WinLibs MinGW for host build scripts, Node 24.18.0, pnpm 10.29.2, Playwright Chromium. A detached HEAD worktree checked out with LF provided the baseline.

| Command | Baseline `7b3a42f` | Repaired tree |
|---|---|---|
| `cargo fmt --all --check` | pass | pass |
| `cargo clippy --locked --all-targets -- -D warnings` (linux target) | pass | pass after fixing 3 type errors and 4 auto-deref lints from the workers |
| `pnpm typecheck` / `pnpm test` (foundation) | pass / 17 pass | pass / 17 pass (migration list now includes 0005, 0006) |
| `pnpm contracts:check` | pass with LF checkout (CRLF checkout reports false drift) | contracts unchanged |
| apps/web `tsc --noEmit`, unit tests | pass / 10 | pass / 13 |
| apps/web `playwright test` | not runnable on Windows (paths) | 108 passed after `URL.pathname` -> `fileURLToPath` in tests/web |
| apps/auth `pnpm test` | 18/19 (runtime test Windows-only) | 24/25; runtime test now boots and passes all HTTP checks, fails only the SIGTERM exit-code assertion on Windows |
| `quota.test.ts` admission/RateLimit unit (no DB) | n/a | pass, rewritten for stateless issuance and eviction |

Not executed: every Rust test binary (Linux-only: `/usr/bin/prlimit`, `std::os::unix`), all `#[ignore]` PostgreSQL suites including new `audit_hardening_runtime_sql` and `reconciliation`, the DB part of `tests/integration/*.test.ts`, and migrations 0005/0006 against a database (parser check only). Run these on Linux with the disposable test database before review.

Decisions and open items:
- A-07 dropped (false positive; chunk-relative locators are the contract).
- A-16 blocked: separating the internal bearer, invitation HMAC and cursor HMAC needs an environment-contract change, provisioning of new HomeLab secrets, and coordinated Rust/auth/operator hash changes verified by DB integration tests. Not attempted.
- R5-01 Rust-side gap: cookies on plain-http origins only get a visible-ASCII check because existing DB tests use synthetic cookie values.
- Conversation-deletion cascades into answers/citations after the runtime DELETE revoke rely on foreign-key actions running as the table owner; confirm on the test database.
- Behaviour changes for clients: a replay of a failed key returns 503 with the stored code (was 409); fetch idempotency hashes no longer include remote bytes, so old fetch keys conflict until expiry; `/readyz` and capabilities identity state may be up to 5 s old.
- Docs updated: apps/auth/README.md, docs/rag-pipeline.md, docs/contracts/api.md, docs/contracts/database.md.

Independent static review of the repaired diff (no execution) found no high-severity defects:
- Fixed: provider calls rejected by local checks before any HTTP was sent were parked `uncertain`; they now settle at zero (`Attempt::settle_unsent`, verified uncharged). Connect/DNS errors inside `exchange` stay `uncertain`, so the operator still reconciles them.
- Open (low): the 0005 revocation trigger takes locks in the opposite order from redemption, so manual operator revocation of an issuer can deadlock (40P01) with a concurrent redemption. No application path revokes memberships today.
- Recorded: a revoked member can no longer be restored by invitation (documented in api.md); restoring one needs an operator path.
- Benign: an expired-key sweep batch can fail one tick on a race with a new pipeline stage; the next tick retries.

## UX review follow-up (2026-10-31)

- [x] Web: answer page is a conversation thread (question shown, follow-ups stack, box clears after sending, language auto-detected until chosen), numbered sources matching citation chips, neutral no-evidence state with next steps, History list/detail pages with delete behind a confirmation, account identity card, admin add-document stepper and feedback/budget labels, source editions and Current/Superseded labels, app pages use a quieter header and slim footer, DD Mon YYYY dates. Web suite: 108 passed.
- [ ] Contract: `Answer` and `Conversation` carry no question text, so History titles come from questions asked in the current tab (memory only) and older conversations show a date plus the first answer. Proposed: add `question` to `Answer` (the database already stores it; feedback context returns it). Needs a contracts owner, Rust `answers.rs` change and PostgreSQL tests on Linux.
