# NOTI-11 web repair ledger

Frozen source: e7a18b9261c91665c312489d7231802ee23a91d3. Target: repair-web. No children, database, live providers or deployment. Browser listener: 3317 only.

## Journey and implementation brief

Students share a browser tab across accounts and institutions. Their question, answer, history and recovery operation must follow the currently verified identity and memberships. Anonymous drafts may transfer to the first login only. A stopped wait remains an explicit replay of the same operation, with no promise of server cancellation.

Administrators select a source version, read extracted passages with locators and IDs, and explicitly approve. Feedback review opens only the selected report's question, answer and current evidence. Missing or failed context must remain visibly unavailable. Existing visual classes and safe JSX text rendering are retained.

Critique: identity alone is insufficient: role/membership, institution, route and asynchronous request generation all matter. Resource invalidation must include the unchanged source preview component. Admin form DOM and callbacks need disposal on scope changes. Recovery storage must contain only owner-bound fingerprints and keys, not questions; drafts are separately owner-bound. Reduced motion must describe the system restriction without removing ordinary pause controls.

- [x] Verify source, frozen interfaces, review findings and policy packet.
- [x] Isolate resources, drafts, history and asynchronous operations.
- [x] Preserve exact-operation identity and 155-second answer waits.
- [x] Add extracted passages and narrow feedback review context.
- [x] Validate Unicode/control input and truthful reduced-motion control.
- [x] Strict build, units, all browser tests and independent regressions; desktop/mobile overflow.
- [x] Stop owned listener; record commands, hashes and six-section handoff.

## Finding dispositions

- R3-01 / R2-04: owner includes user, institution and sorted complete membership/role set. Keyed resources clear retained data and refuse mismatched keys; ownership changes abort protected HTTP and remount source/admin/auth form state. Answers, history detail, citations, feedback and drafts clear on changes and explicit logout/deletion. Anonymous drafts transfer only to first login in the same institution. Focus/visibility/navigation revalidate identity. Bare history never exposes detail/delete controls.
- R3-03: frozen `ANSWER_WAIT_MS` (155000), ordinary requests 45000. Exact payload and owner fingerprint selects a persisted idempotency UUID. Stop/disconnect/conflict/reload do not rotate it; no automatic POST retry. Follow-up reload restores owner-checked conversation context. Stop wording describes waiting only. Request dispatch remains before animation.
- R3-04: selected-version ChunkPage review exposes page, section, text and selectable chunk/version/source IDs, original-file link and opaque pagination. Empty extraction is explicit. No automatic review/approval.
- R1-04: selected FeedbackContext only, semantic answer validation and response scope checks, safe literal JSX question/claims/current evidence, original-file links. Review/resolution disabled until context loads; failed/missing context remains unavailable. Tenant/role changes remove context.
- R3-05: frozen AskRequest and both input limits; Unicode scalars, permitted tab/LF/CR, forbidden controls/unpaired surrogates and meaningful form errors. No UTF-16 maxlength truncation.
- R3-07: reduced-motion control disabled with an accessible system-preference description. Normal pause/zoom retained. Ordinary no-WebGL animation is the separate fallback worker's scope and is not claimed here.

## Verification notes

All fixtures are synthetic and interception stays in browser test files. No database, provider, mail or 3810/3811 listener used. Initial focused tests had two locator mistakes (citation number in paragraph and Pagination's actual generic role), corrected without reducing assertions. First all-browser run found duplicate initial history loading before scope establishment; resource admission now waits for scope initialization and the unchanged pagination regression passes independently.

Strict web build, existing 6 web units, new 4 repair units and root `pnpm check` (17 foundation tests plus strict typecheck/schema drift) passed. Additional independent regression invocation passed 4/4: exact follow-up replay after reload, obsolete callback isolation, delayed admin context/role loss, and existing pagination. Final all-browser rerun passed 40/40 in 2.6 minutes, including the real 46.5-second answer wait and callback-token cleanup. Callback tokens are also cleared at ownership boundaries to prevent remounting a consumed token.

Desktop 1440×900 and mobile 390×844 admin screenshots were visually inspected; both automated overflow checks passed. Generated receipts in `.handoff` record actual instruction paths/hashes and runtime turn_context model `gpt-6-astra`, effort `high`.

## Exact commands

Commands run from TARGET_ROOT unless otherwise stated. Every pnpm command uses `PATH=/home/inu/.npm-global/bin:/home/inu/.nvm/versions/node/v24.18.0/bin:$PATH` as shown in the execution log; no environment/provider credentials were set.

| Command | Result |
| --- | --- |
| `git rev-parse HEAD` | Matches frozen source SHA above; initial `git status --short` empty. |
| `sha256sum -c MANIFEST.sha256` (approved context directory) | All 5 approved policy files OK. All 3 supplied review-report hashes match repair-input.json. |
| `pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile` | Exit 0, 150 pinned packages; lock unchanged. |
| `pnpm check` | Exit 0: strict root typecheck, schema drift, 17 foundation tests; SQL parser only, no database. |
| `pnpm --filter @noti/web build` | Final exit 0; strict tsc + Vite; `tests/web/artifacts/repair-build-final.log`. Existing scene >500 kB warning. |
| `pnpm --filter @noti/web test` | Exit 0, existing 6 units. |
| `pnpm --filter @noti/web exec tsx --test tests/repair.test.ts` | Exit 0, 4 new units; `repair-unit.log`. |
| `pnpm --filter @noti/web exec tsx --test ../../tests/web/unit.test.ts tests/repair.test.ts` | Final exit 0, 10 units; `repair-units-final.log`. |
| `pnpm --filter @noti/web exec playwright test --config tests/repair.playwright.config.ts repair.spec.ts` | Initial 7 pass / 4 fail from two locator mistakes; corrected. |
| `pnpm --filter @noti/web exec playwright test --config tests/repair.playwright.config.ts --grep 'independent regression\|history loads after reload'` | Final exit 0, 4/4 in 4.1 seconds, `repair-independent-final.log`. Pipe is a literal quoted regex alternation. |
| `pnpm --filter @noti/web exec playwright test --config tests/repair.playwright.config.ts` | First all-suite pass 36/37 (initial history double load); subsequent and final revisions 40/40. Final exit 0, 2.6 minutes, `repair-all-browser-final.log` and `repair-all-results.json`. |
| `git diff --check` | Exit 0. |
| `git diff --exit-code HEAD -- apps/web/src/Archive.tsx apps/web/src/style.css apps/web/src/scene.ts apps/web/README.md packages/contracts docs/contracts/endpoints.json pnpm-lock.yaml` | Exit 0; other lanes/shared files untouched. |

The Playwright override starts only `pnpm exec vite preview --host 127.0.0.1 --port 3317 --strictPort`, with cwd apps/web. It owns shutdown; final `ss -ltnp 'sport = :3317'` returned only the header (no listener), exit 0, at 2026-09-24 23:48:58 UTC. Source and generated-output SHA256 manifests are in `.handoff/changed-files.sha256` and `.handoff/artifact-hashes.sha256`.
