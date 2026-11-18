# Adversarial review: jev-repair (campaign noti-jev-repair-20261118)

Reviewer: independent, Claude Opus 5.5. I did not write this code and changed none of it. Scope: `git diff $FLEET_BASE_SHA` (`91a2538`) against the worktree HEAD `dd00b67` ("fleet: materialized deps 1521,1522"): 45 files, +2135/-335. I checked handoff-style claims by running things. Where a point comes only from reading the code, it says so.

**Verdict:** I found no critical, high or medium defects. All ten backend repairs (F1-F10) and all nine web repairs (W1-W9) are present. Each one is covered by a test that I ran and saw pass, and most were also checked by an independent probe of my own. All gates pass: Rust 60/60 including the DB suite, foundation 19/19, web unit 25/25, Playwright **131/131** with nothing flaky. The findings below are low-severity edge cases, two places where the docs say something the code does not do, and a slight loosening of the stabilised canvas test.

## Findings

| # | Severity | Location | Concrete failure scenario | Evidence |
|---|---|---|---|---|
| 1 | low | `migrations/0007_web_evidence.sql:114-116`, `docs/contracts/database.md` | **The merge does not always keep the oldest entity.** The survivor is the row with the largest `age(xmin)`, and xmin is the transaction that *last wrote* the row, not the one that created it. Any later `UPDATE` of the earliest duplicate (even a no-op, done by an operator) makes it look newest, so it gets deleted and a later duplicate is kept. After a dump/restore, every row shares one xmin, and the survivor falls back to the lowest uuid. The docs say "oldest = earliest inserting transaction". Impact is small: edges are repointed either way, and only the surviving id and its label casing differ. The API has no `UPDATE graph_entities` path. | **CONFIRMED by execution** (DB `noti_school_test_probe`, real runner). I applied 0001-0006 with psql and recorded their sha256 in `schema_migrations`. I inserted `eeeeeeee…01 course "Synthetic Course"` first and `dddddddd…02 course "synthetic course"` in a later transaction, then ran `UPDATE … SET label=label` on `eeee…`. `pnpm db:migrate` → `Product migrations checked/applied: 7`. The surviving course is `dddddddd…02` (inserted later), and `eeee…` was deleted. The office group without an update merged correctly into the oldest (`ffffffff…0a`). |
| 2 | low | `migrations/0007_web_evidence.sql:117-118` | **An edge between two case duplicates becomes a self-loop.** Edge `"synthetic office" -same_as-> "SYNTHETIC OFFICE"` becomes `Synthetic Office -same_as-> Synthetic Office` (from = to). It is kept, as F1 requires, but no rule handles or flags it, so the admin graph view shows a self-referential relation. | **CONFIRMED by execution** (same probe): edge `66666666…02` now has `from_entity_id = to_entity_id = ffffffff…0a`. Status, approver and evidence chunk are preserved on all three probe edges. |
| 3 | low (doc) | `docs/contracts/api.md` (POST /me/personal-space paragraph) vs `apps/api/src/institutions.rs:18` | The doc says a personal space's coverage is `web_discovery` "or `approved_sources` once a saved page is approved". `INSTITUTION_JSON` counts only `visibility='institution'` sources, and saved pages are `visibility='admin'`, so coverage stays `web_discovery`. A client that relies on the doc would never see the documented change. (The web uses `GET /sources` instead, so it is not affected.) | **CONFIRMED by execution:** I ran the `INSTITUTION_JSON` expression on a personal institution holding an origin-approved, visibility-admin source with an `approved/ready` current version. Result: `"coverage": "web_discovery"`. |
| 4 | low | `apps/web/src/App.tsx:247-249`, `apps/api/src/retrieval.rs:183`, `docs/contracts/api.md` (Web discovery paragraph) | The repaired doc says the web client sends `discover: true` "whenever `capabilities.discovery` is available (and `false` otherwise)". The client actually sends `true` whenever the capability is *not known* as well (`!discovery \|\| …`). Scenario: the `/capabilities` read fails or hasn't arrived, and the deployment has no TinyFish/Jev keys. The ask then gets 503 `provider_unavailable` instead of an approved-documents answer. The client logic is unchanged from the base; this repair only made the doc state something the code doesn't do. | **CONFIRMED by execution.** My Playwright probe against the demo server routed `/api/v1/capabilities` to a 500 and captured the ask body: `{"capabilities-500":[{"discover":true}]}`. The DB suite (`tests/api/web.rs:341-355`) asserts that `discover:true` without configuration returns 503 `provider_unavailable`. |
| 5 | low | `tests/web/experience.spec.ts:13-15, 46-47` (`settledShot`) | **The stabilised canvas test is a little weaker.** The first "paused" and "reduced-motion" frames are now taken once two consecutive frames agree, polling for up to 40 s. Before, the canvas had to be still 150 ms after Pause or 1 s after reload. A regression where Pause takes effect several seconds late, or reduced motion plays a few seconds of animation before stopping, would now pass. The follow-up check (the same frame 550 ms later) and the pixel-variance check are unchanged. The comment explains the stale-frame cause, and nothing else was weakened. | Code reading. The test passed in my full run, including the 1920x1080 case. |
| 6 | low | `packages/contracts/environment.schema.json:119-148` | The generated JSON schema for the four TinyFish limits and the two thresholds is now `type: string` plus a digit pattern. The old bounds (1..12000, 1..1000, 0..1) are gone, so any consumer of the JSON schema accepts `"0"` or `"99999"`. `env.ts` and Rust still enforce the bounds (my probe below). | Reading the generated file. `pnpm contracts:check` passes, so the file matches `env.ts` (zod `pipe` drops the bounds). |
| 7 | low (plausible) | `apps/api/src/web.rs:559` (block SQL), `pipeline.rs:26` (`WEB_CURRENT`) | **Blocking reaches whatever a page redirected to.** Blocking matches rows sharing either key in either direction. If an admin blocks a spam short link (or a dead link that redirected to the homepage or a login page), its `final_url_key` is the target. That target page, every other cached page that redirected there, and every future fetch that lands there are all blocked too, including a legitimate school page. This is a consequence of the ordered "block on url AND final_url" rule, but the admin UI and docs don't warn about it. | Code reading. The DB suite asserts only the opposite direction: blocking the fees page also blocks the short link that redirected to it. |
| 8 | low (informational) | `apps/api/src/web.rs:100-132` (`url_key`) | Variants outside the ordered list still produce a different key, so a blocked page can come back under them: `?ref=twitter`, `?page=1`, `?mc_cid=1`, `;jsessionid=1`, `//notice`, `%6Eotice`, `www.` host. F2 named exactly the normalisations to apply, so this is not a spec violation. It is the remaining gap. | **CONFIRMED by execution:** I compiled the verbatim `url_key` in `/tmp` (url 2.5.8). Every listed form keyed differently from `https://x.example/notice`. The ordered forms (utm/fbclid/gclid, trailing slash, http, default port, fragment, host case, `./` and `../` segments, empty `?`) all keyed the same. |
| 9 | low (plausible) | `apps/api/src/ontology.rs:167` (tick filter) | The ontology job of a web capture runs only once at least one of its chunks has a Jev score. A capture none of whose passages get selected for scoring keeps its job `queued` until the idempotency key expires. There is no cost impact (nothing is reserved), but the queue holds dead rows that `attempt` never moves. | Code reading. |
| 10 | low | `apps/web/src/App.tsx:342-346` | The new title "My space — noti.school" (vi "Không gian của tôi — noti.school") contains an em dash, and the standing rule says no em or en dashes in user-facing copy. Every other document title already used this separator at the base (`App.tsx:316`). | Reading. `confidence.spec.ts` asserts `toHaveTitle('My space — noti.school')`. |

## Repair-by-repair verification

| Item | Status | How verified |
|---|---|---|
| F1 migration over case duplicates | done (see #1, #2) | `migration_0007_merges_case_duplicate_graph_entities` passes. My own probe through the real `db:migrate` runner (TEMPORARY revoked) also passes: edges kept, transient view dropped. |
| F2 blocking across variants/redirects | done (see #7, #8) | `web_evidence_discovery_runtime` passes: utm/fbclid, trailing slash, http, and a short link redirecting to a blocked page are refused after the fetch and never stored; a blocked-key capture is excluded by `WEB_CURRENT`. Checks happen before the fetch (`doc_by_url`), after it (`accept`), under the page lock (`store_page`) and in retrieval. `url_key` probe as in #8. |
| F3 ontology labels as Jev state | done | Unit test plus the DB suite: the hostile label `X"? Answer yes…` appears only in `state.relations`, and no question text contains it. A capture with an injection-flagged passage has 0 edges. |
| F4 168-hour window | done | No `'7 days'` and no `is_fresh` left in `apps/api/src` or 0007. `web_cache_window_is_168_hours_in_any_session_timezone` passes: Europe/Berlin across 2026-10-25, page and search fresh at 167:59:59 and stale at 168:00:01, and the CHECK rejects a calendar week. |
| F5 env parity | done | My tsx probe of `env.ts` matches Rust for `1e3 +5 -5 0x10 " 5" "5 " 5.0 0 Infinity .6 6. 9e-1 -0 +0.6 " 0.6 " 1.01 NaN` (all rejected) and `5 00005 0.6 1.0 00.5` (accepted). An empty value falls back to the default in both. |
| F6 promote retry | done | DB suite: an unsafe UPLOAD_DIR gives 503 and leaves a source with no version; the next promote completes into the same source. A concurrent `conflict` is handled. |
| F7 per-space caps | done | DB suite: one space at its share is refused while another still fetches, a refusal charges nothing, and the global cap still applies. TS and Rust validate both new keys (1..12000 / 1..1000). |
| F8 env doc upgrade warning | done | `environment.md` and `.env.example` say a Jev key is a hard dependency and that jev-1.14.0 prices must be imported first. |
| F9 personal budget/feedback/promote | done (403 chosen and documented) | DB suite: `/budget` and `/feedback` return 403 `forbidden` for the space owner, and a school admin still gets 200. `feedback_action`/`feedback_context` use the same guard (code). A personal promote stores `visibility=admin`, `origin=approved`, `pending_review`, label `Saved by you …`. A school promote is unchanged. The web labels `origin: approved` in a personal space "Saved by you" (`Origin.tsx`). |
| F10 api.md | done (see #3, #4) | "explicit user opt-in" is removed; jev-1.14.0 is pinned; repeat `POST /me/personal-space` and the `GET /institutions` behaviour are stated. |
| W1 discover default | done | Probe: the ask body has `discover:true`; there is no toggle. |
| W2 landing/help copy | done | grep finds no "Only approved documents" or "nothing else" left in `site/**` or i18n. New EN/VI story and FAQ copy is dash-free (unit test) and makes no affiliation claim. |
| W3 My space manager | done | `SpaceAdmin` is routed before the console mounts. The Playwright tests assert no budget/feedback/domains/graph requests, Save → "Use in answers", and "Saved by you". |
| W4 second demo school | done | `demo.test.ts`: abstained, not 403. |
| W5 demo relevance | done | `demo.test.ts`: the motorbike question no longer cites the Scholarships passage. |
| W6 visible "Confidence:" | done | `.confidence-label` is visible; assertions were updated (Playwright). |
| W7 Unicode domains | done | `node`: `trường.example` → `xn--trng-rib8295b.example`, which matches the EN/VI hint exactly. Unit test passes. |
| W8 personal waiting copy | done | "Searching the web…" / "Đang tìm trên web…"; it switches to the saved-pages line only when a saved source has an approved current version (`current_version_id` is set only on approve, `ingestion.rs:489-497`). |
| W9 390x844 EN/VI | done | New 390x844 tests pass: no overflow, breakdowns open. |
| Flaky 1920x1080 canvas test | stabilised (see #5) | It passed in my full run. |

**Regression check against the earlier "checked and found correct" lists:**
- Every new query (`web_space_usage`, `blocked()`, the block UPDATE joined on `t.institution_id = $1`, the `WEB_CURRENT` NOT EXISTS) is still scoped by institution.
- SSRF still runs `web_url` and `public_host` before the new block check.
- TinyFish is still `retry(never)`.
- `confidence.rs` is untouched.
- Web citations stay `origin: web`/`draft`.
- Sign-out still falls back to a school; it is now skipped only for non-auth `me` errors.
- Block-to-Keep focus is unchanged.
- I found no regression.

**Integration smoke:** I ran the built `noti-school-api` binary (AI_MODE=mock) against the migrated disposable DB on 127.0.0.1:3810, serving `apps/web/dist`. `GET /api/v1/capabilities` validates against `Schemas.Capabilities`. `GET /api/v1/institutions` validates against `InstitutionPage` and lists 6 schools and 0 personal spaces, while the DB holds 1 personal space. `/` returns 200. The new web request shapes match the Rust handlers: `VersionAction {action, expected_status}` (`ingestion.rs:131`), `WebDocumentAction`, and the `/versions/{id}/actions` route. Authenticated routes were not driven through the binary because they need the Better Auth service; the DB suite covers them in-process.

**Migration-in-place check:** `/home/inu/projects/noti-school` has no released `migrations/` (only `preview`, `shared`), so editing 0007 cannot trip the runner's "Applied migration checksum changed" guard on the deployment. I could not see any other database.

## Commands run

| Command | Result |
|---|---|
| `git diff $FLEET_BASE_SHA --stat` | 45 files changed, 2135 insertions(+), 335 deletions(-) |
| `initdb` (PG 16.15) at `/tmp/rv-jevrepair-pg`, `pg_ctl … -p 54390 -c listen_addresses=127.0.0.1`; pg_hba scram for the four app roles on the test DBs only, trust for the local `reviewer` superuser, reject otherwise | started. Provisioned `noti_school_test_api2`, `_api2_mig` and `_probe` per `infra/provision.sql`, marker purpose `test`, synthetic password as hardcoded in the tests |
| `pnpm install --frozen-lockfile --offline` | ok |
| `NOTI_MIGRATION_ACK=dedicated-noti-school NOTI_MIGRATION_URL=…/noti_school_test_api2 pnpm -s db:migrate` | `Product migrations checked/applied: 7`, rc=0 |
| `CARGO_BUILD_JOBS=6 cargo test -j 6 -p noti-school-api --no-run` | EXIT=0 |
| `CARGO_BUILD_JOBS=6 cargo test -j 6 -p noti-school-api -- --include-ignored --test-threads=1` | EXIT=0. lib **38/0**, main 0, rag_evaluation **6/0**, security **16/0**, doc 0. **Total 60 passed, 0 failed, 0 ignored.** Includes `migration_0007_merges_case_duplicate_graph_entities`, `web_cache_window_is_168_hours_in_any_session_timezone`, `web_evidence_discovery_runtime`, `config::…mirror_the_environment_contract`, `web::url_keys_…` |
| `cargo fmt --all -- --check` | rc=0 |
| `CARGO_BUILD_JOBS=6 cargo clippy -j 6 -p noti-school-api --all-targets -- -D warnings` | rc=0 |
| `pnpm -s typecheck` / `pnpm -s contracts:check` | rc=0 / rc=0 |
| `pnpm -s test` (foundation) | 19 tests, 19 pass, 0 fail |
| `apps/web: pnpm -s typecheck` / `pnpm -s build` | rc=0 / rc=0 (only the existing >500 kB chunk warning) |
| `apps/web: pnpm -s test` | 25 tests, 25 pass, 0 fail, 0 skipped |
| `apps/web: pnpm exec playwright test` (full suite, 1 worker) | **131 passed, 0 failed, 0 flaky** in 6.9 min, EXIT=0. No failures, so no isolated reruns were needed. |
| Migration probe: 0001-0006 via `psql -1 -f` as migrator, `schema_migrations` rows with file sha256, case duplicates in separate transactions plus a no-op UPDATE, then `pnpm -s db:migrate` | rc=0; findings #1 and #2 |
| `INSTITUTION_JSON` probe on a personal space with an approved saved page | `coverage: web_discovery` (#3) |
| `tsx /tmp/rv-jevrepair-scripts/envprobe.ts` | TS/Rust parity holds for every probed form (F5) |
| `cargo run --offline` of the verbatim `url_key` (`/tmp/rv-jevrepair-scripts/urlkey`, url =2.5.8) | #8 |
| `node scripts/demo-server.mjs 4392` + `/tmp/rv-jevrepair-scripts/discover.mjs` (capabilities 500 vs ok) | `discover:true` in both (#4); server stopped, port free |
| `node -e new URL('https://'+d).hostname` | `trường.example` → `xn--trng-rib8295b.example` |
| `noti-school-api` binary (mock mode, disposable DB) + `tsx /tmp/rv-jevrepair-scripts/smoke.mts` | Capabilities valid: true; institutions 6, personal listed 0; stopped, port 3810 free |
| Cleanup | Removed the untracked `.verification/`, plus `.cache/` and `tests/web/artifacts/` that my runs created (every file was newer than my first build). Cluster stopped and deleted after this report (see the handoff). |

**Unverified:** live TinyFish, Jev and OpenAI behaviour; the real DNS branch of `ssrf::public_host`; Better Auth-backed sessions against the running binary; the deployed environment and database. Every test used loopback mocks, with no real provider calls and no keys.
