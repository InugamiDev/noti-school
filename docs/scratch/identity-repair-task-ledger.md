# NOTI-10 identity repair ledger

- Source: `e7a18b9261c91665c312489d7231802ee23a91d3`; target `repair-identity`.
- Runtime requested: `gpt-6-astra/high`; no children, no deployment; 30-minute bound.
- Databases: only `noti_school_test_identity2` and `noti_school_test_retention` on loopback 54390.
- [x] Read frozen inputs, product contracts, approved policy packet and relevant finding source.
- [x] Reproduce R2-02 and replace shared public quotas with validated, isolated flow admission.
- [x] Preserve unfinished ingestion roots (R1-01), including disabled jobs without paid stages.
- [x] Implement bounded terminal-operation pseudonymization after 13 months (R2-06).
- [x] Run original 19 auth tests, new regressions, strict build and actual PostgreSQL tests under shared service lock.
- [x] Return scoped diff, hashes, exact verification outcomes and six-section handoff.

No schema/grant changes are authorized. Cross-admin indexing recovery belongs to the core lane.

## Finding dispositions

| Finding | Disposition and evidence |
| --- | --- |
| R2-02 | Reproduced on frozen source: 120 unknown GETs made the next get-session return 429. Repaired validation order, per-user/per-admission path quotas, bounded signed anonymous admission, target-email brute-force quotas and concurrency bounds. Actual HTTP + PostgreSQL regression verifies A cannot exhaust B's session or admitted Google callback; provider transport is mocked. Remaining first-time anonymous/distributed abuse limits are explicit in apps/auth/README.md. |
| R1-01 | Exact runtime operator preserves expired completed enqueue roots for disabled, queued, running and failed jobs, including no-stage fixtures. No uploader/admin-retry changes; those belong to core. |
| R2-06 | Runtime-only bounded scrub of old terminal roots and stage caches/hashes; preserves pending, young/recently extended, unresolved root/stage charges and unfinished jobs. Retains IDs, terminal state and financial receipts. Documented 13-calendar-month threshold uses the later of creation/expiry. Tests verify repeat no-ops, independent row locks, limit=1 and advisory timeout. |
| NOTI-10-BATCH-01 (discovered) | Locking LIMIT subquery rescanned: first integration run returned 2 deleted conversation roots for limit=1. Materialized selections repair the batch bound across product and auth retention; final tests pass. Both deleted roots were this invocation's fixtures. |
| Other R1/R2/R3 findings | Outside this lane; no claim of repair. Coordinator/core/web/fallback owners handle them. |

## Exact commands and outcomes

All pnpm commands used `PATH=/home/inu/.npm-global/bin:/home/inu/.nvm/versions/node/v24.18.0/bin:$PATH`.
Working directory is the target above; `../locks/services.lock` is the campaign shared lock.

| Command | Outcome |
| --- | --- |
| `git rev-parse HEAD` | Exact frozen SHA above; initial git status clean. |
| `pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile` | Exit 0; pinned 150 packages installed, no lock changes. |
| `pnpm exec tsx -e 'import {fixture} from "./tests/auth/helpers.ts"; (async()=>{const f=await fixture(); for(let i=0;i<120;i++) await f.request("/nonexistent"); console.log("unknown-route exhaustion",(await f.request("/get-session")).status)})()'` | Before repair: exit 0, `unknown-route exhaustion 429`. |
| `flock -w 60 ../locks/services.lock pnpm --filter @noti/auth test` | Final exit 0, strict auth build and 19/19 tests; `.cache/auth-final.log`. |
| `pnpm typecheck` | Exit 0, root strict TypeScript; `.cache/strict-typecheck.log`. |
| `NOTI_TEST_ACK=disposable-noti-school flock -w 60 ../locks/services.lock pnpm test:integration` | Final twice: exit 0, integration strict TypeScript and 7/7 tests each; `.cache/integration-final-1.log`, `.cache/integration-final-2.log`. Four PostgreSQL identity/operator/retention scenarios, one HTTP/PostgreSQL quota scenario and two admission/load scenarios. |
| `git diff --check` | Exit 0. |

Intermediate failures are preserved: `.cache/integration-first.log` records the batch-bound defect;
`.cache/integration-third.log` and `.cache/auth-build.log` record TS7006 from a missing Request annotation
during wrapper cleanup. Both were repaired; no failed assertion was removed to obtain a pass.

The old uncertain-fence test now associates its reservation with the actual fence operation and keeps
that fence, instead of relying on unrelated global uncertainty or deleting it during cleanup. Existing
fixtures are locked before creating this run's fixtures, so the exact operator's SKIP LOCKED selections
cannot mutate prior rows. New synthetic financial receipts remain; no money was reset/released.

## Boundaries and return

No api2 connection, migrations, grant expansion, provider/mail/OAuth network calls, other-lane edits,
children, push, merge or deployment. The 19-test suite includes a synthetic loopback SMTP rejection
peer, not a real SMTP service. All owned listeners terminate in test cleanup. No tracked shared
schema/fixture files were generated, so no out-of-scope byte restoration was necessary.

Requested runtime is exact gpt-6-astra/high; process ancestry exposed no model flags, so effective
provider-side identity is not independently attested. Current task policy overrides stale global model
and delegation defaults. Approved five-file policy manifest matches all hashes.

Return artifacts: `.cache/identity-repair.patch`, `.cache/changed-files.sha256`,
`.cache/knowledge-receipts.json`, `.fleet-handoff.json`, and `.handoff/handoff-25-sep-2026-0640.md`.
Independent re-review, trusted ingress/distributed abuse control, real providers/mail/OAuth and
coordinator scheduling/deployment remain unverified or pending.
