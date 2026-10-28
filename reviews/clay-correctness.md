# Clay correctness review (campaign noti-clay-20261028)

Base `af5a30f`. Reviewer did not write the code. Nothing was fixed.

## Findings

| # | Severity | file:line | Failure scenario | Evidence |
|---|---|---|---|---|
| 1 | medium (verified by code reading, not run in a browser) | `apps/web/src/landing/Landing.tsx:26-31`, `apps/web/src/landing/Hero.tsx:70-85`, `apps/web/src/App.tsx:~288 ask()` | "My university isn't listed" only sets a local `scope='request'`. It never reaches App. The composer stays enabled and its submit calls `ask()` with the previously selected `institution()`. A visitor who picked "Your university", typed a question and pressed Ask is silently routed to `/answer` for the pilot school (HCMIU or the demo). That contradicts the hero's own card ("there's nothing to answer from yet") and AGENTS.md ("Never invent ... official affiliation"). The scope is also persisted via `localStore('scope')` across reloads. | `Landing.tsx` `chooseSchool` returns before `props.onSchool`. `Hero.tsx` PromptInput has no `disabled` or guard on `scope`. `ask()` has no scope input. |
| 2 | low (flaky test, not a product regression as far as I could show) | `tests/web/experience.spec.ts:46` ("immediate submit, one request, cancellation...") | It failed in the full suite (`Stop` click timed out: "element is not visible", then "detached") and in 1 of 2 isolated reruns. It then passed 5 of 5 isolated runs. The fixture answers 503 after 1200 ms. Playwright waits for the Stop button (the AnswerCard loading state) to be stable and visible. Under load the card is replaced by the error state first, and the click retries until the 30 s timeout. A real race is plausible but unproven: `ask()` calls `setRoute('/answer')` and focuses the heading while the AnswerView enters. Treat as a gate-stability risk. | See "Commands run". |
| 3 | low | `apps/web/src/App.tsx:6` | Dead import `For` (`tsc --noUnusedLocals` TS6133). The default `typecheck` does not enable this flag, so the gate passes. | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` -> `src/App.tsx(6,3): error TS6133: 'For' is declared but its value is never read.` |
| 4 | low (observation) | `apps/web/src/hero3d/ClayHero.tsx:60-72` | Not a defect. If `load()` rejects after `IntersectionObserver` has already disconnected, nothing retries. The static illustration stays, which matches the intended fallback. If the Sprite shared-geometry dispose gap noted in `tests/web/experience.spec.ts` is real, it is hero3d scope and was not verified here. | Code read only. |

## Checked, no defect found
- Submit -> `/answer`: `ask()` starts the request before `setRoute('/answer')`. The idempotency key, `AbortController`, `owner !== accessScope()` checks and `controller !== active` guards are intact. Stop calls `cancel()`, which sets `errorCode='cancelled'`.
- Drafts across auth: the `createComputed` scope logic (`loadDraft`/`saveDraft`, anonymous adoption) is unchanged versus base.
- Admin authority: derived from `me().memberships` role === 'admin' for the current institution (`App.tsx` Admin `allowed`). Unavailable provider state: `errorCode` is forwarded to AnswerView, and the e2e specs for it pass.
- History: tab-local via the `visibleHistory()` owner/institution check. The 3 history specs pass.
- Listener and observer cleanup: the `hashchange`, `focus`, `visibilitychange`, matchMedia, `/` keydown, Cmd+K (`useCommandMenu`, registered in `onMount` and removed in `onCleanup`), `IntersectionObserver` (`ClayHero`, `Band`) and scroll listeners all have matching cleanup. The lazy-import-after-unmount e2e test passes (`alive` flag).

## Commands run
- `git diff $FLEET_BASE_SHA --stat` -> 51 files changed, 6607 insertions(+), 4335 deletions(-).
- `pnpm install --frozen-lockfile --ignore-scripts` -> Done in 1.2s.
- `pnpm --filter @noti/web typecheck` -> exit 0, no errors.
- `pnpm --filter @noti/web test` -> tests 63, pass 63, fail 0.
- `pnpm --filter @noti/web build` -> built in 5.14s. Warning: `scene-*.js` is 552.93 kB (over the 500 kB chunk limit). `index-*.js` is 476.11 kB.
- `pnpm --filter @noti/web test:e2e` (Playwright, full) -> **122 total: 121 passed, 1 failed** (`experience.spec.ts:44`, finding 2), 5.7m.
- `pnpm exec playwright test experience.spec.ts -g "immediate submit"` (isolated) -> 1 failed, 1 passed, then 4 consecutive passes.
- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` -> 1 error (finding 3).
