# Review: clay loading states (campaign noti-clay-loading-20261028)

Reviewer: independent, adversarial. Base `85d8422`. Diff: 20 files, +1672/-689.

## Verdict

D1, D2 and D3 are fixed in a real browser. No critical or high findings. Two low findings and one medium process caveat.

## Findings

| # | Severity | Location | Failure scenario | Evidence |
|---|----------|----------|------------------|----------|
| 1 | low | `apps/web/src/site/SiteShell.tsx:95-105` | The header placeholder ignores `minVisible`. `createDelayedLoading` is only used to un-hide the placeholder. The `<Show>` swaps on `props.session !== 'loading'`, not on the delayed value. If identity resolves just after the 150 ms delay (a slow main thread with the 3D hero, for example), a visible empty pill appears and is removed within about 10 to 15 ms. That is exactly the flicker `minVisible` exists to prevent. The task asked for the placeholder to stay at least `minVisible`. | Real browser, 50 ms API delay, `#/`: `skelFrames` is 1 at both 1440 and 390. Sequence `464:b0s1t0 479:b0s0t0` at 1440, and `421 → 431` at 390. Every other route at 50 ms had `skelFrames` 0. Unproven for a fast machine. The spec's 50 ms test only covers `#/sources`, `#/history`, `#/admin` and `#/answer`, so it cannot see this. |
| 2 | low | `tests/web/loading.spec.ts` (`observeLayoutShift`) | The CLS budget (< 0.02) passes only because the spec aborts every `.woff2` request. In a real browser with fonts, CLS at 390x844 is 0.035 to 0.073 on every route, including `#/auth` and `#/`, which have no loading content. This is font-swap shift, not loading shift. The spec comments disclose the exclusion. The ORDER's (c) asked for CLS over the whole load. | With fonts, delay 2500: `#/` 0.0685, `#/sources` 0.0514, `#/history` 0.0351, `#/admin` 0.061, `#/answer` 0.0399, `#/auth` 0.0713 at 390. At 1440: `#/` 0.0265, the rest below 0.0025. Delay 50 gives the same values, so the shift is independent of loading. Fonts blocked, delay 2500: CLS is 0.0000 on `#/sources`, `#/history`, `#/admin`, `#/answer`, `#/auth` at both sizes, and 0.020 to 0.022 on `#/`. The base commit shows the same font shift (`#/` at 390 is 0.0713, `#/auth` at 390 is 0.0628, `#/` at 1440 is 0.0347). It is pre-existing and not caused by this change. Treat it as a follow-up for font loading (preload or `size-adjust`), not as a loading regression. |
| 3 | note (not a defect) | n/a | `#/admin` at 50 ms showed "No feedback loaded". This is my fixture returning an empty feedback list. It is a legitimate settled empty state shown after load, not during loading. | At 2500 ms the text is absent while pending (`neg: []` during the busy window). |

## Verified per defect

- **D1, wrong state while loading:** For `#/`, `#/sources`, `#/history`, `#/admin`, `#/answer` and `#/auth`, at 1440x900 and 390x844, with 2500 ms and 50 ms delays, none of the signed-out, forbidden, empty or unavailable texts appeared while pending.
  - The tracked texts were "Not signed in.", "No school membership", "The collection is unavailable", "Sign in with an administrator membership", "Sign in to see your conversations", "No conversations", "No sources yet", "Budget unavailable" and "No feedback loaded". They were polled every 100 ms.
  - Header auth control width was 100 px in every sampled state (hidden placeholder, visible placeholder, final "Account").
- **D2, skeleton shape:** Loading-only CLS is 0.0000 on all four workspace routes at both sizes with fonts held constant. `#/admin` renders the real grid with card shells and four regions, each with its own status text.
- **D3, flash and pop-in:** At 50 ms, `#/sources`, `#/history`, `#/admin` and `#/answer` showed zero visible skeleton frames. See finding 1 for the header caveat on `#/`.
- **Slow path:** At 2500 ms the skeleton appears after about 230 ms (the 150 ms delay plus app mount). It is held until about 400 ms after data arrives. Dependent fetches (me, then sources) gave about 5.1 s total, and busy cleared at the end.
- **Screen reader semantics:**
  - Exactly one non-empty `role=status` per region (one on `#/sources`, four on `#/admin`).
  - `aria-busy="true"` is set while loading and absent afterwards.
  - Skeleton wrappers are `aria-hidden="true"`.
  - Status text is cleared after load.
- **Reduced motion:**
  - `prefers-reduced-motion: reduce` and `data-motion="off"`: shimmer `animation-name` is `none` and `.reveal` is `none`.
  - Normal motion: shimmer is active.
- **Background refetch:** After a `visibilitychange` and `focus` refetch of `/me` with a 3 s delay on `#/sources`, there were 0 mutations to a skeleton or busy state, and the header stayed "Account".
- **Error paths (after loading):**
  - `/me` returning 503 or 401: the header shows "Sign in". `#/history`, `#/admin` and `#/answer` show their signed-out states ("Sign in to see your conversations", "Sign in with an administrator membership…", "Not signed in."). No busy regions remained.
  - `/institutions` returning 503: `#/sources` shows "The collection is unavailable…". `#/answer` shows "No school membership on this account." with `/me` OK.
- **Timers:** `createLoadingTimer` clears the show and hide timers on `update(false)`, on re-entering loading, and on `dispose()`. The component uses `onCleanup(dispose)`. The unit tests cover no flash under the delay, minimum visible time and cancel on dispose (see counts below).

## Commands run

Environment note: this worktree had no installed dependencies. I temporarily symlinked `apps/web/node_modules`, `node_modules/.pnpm` and a few root packages from the sibling worktree `noti-clay-loading-20261028-1241-3582613`. They were removed afterwards, and `git status` is clean.

| Command | Result |
|---|---|
| `pnpm typecheck` (apps/web, `tsc --noEmit`) | pass |
| `pnpm build` (apps/web, `tsc --noEmit && vite build`) | pass; only the existing chunk-size warning |
| `pnpm test` (apps/web, `tsx --test`) | 78 tests, 78 pass, 0 fail, once `zod` was resolved from the sibling checkout (without it, `unit.test.ts` could not import `zod`: an environment gap, not a code defect) |
| `pnpm typecheck` (repo root) | fails on `tests/foundation` and `scripts` for missing `yaml`, `pgsql-parser` and `@types/pg`. This is an environment gap and unrelated to the diff, so it is not counted. |
| `pnpm exec playwright test` (apps/web, full suite incl. `loading.spec.ts`) | 131 passed, 0 failed, 4.6 min |
| `/tmp/audit-loading/audit.mjs` (my route × viewport × delay audit; fonts allowed and `NOFONT=1`) | results in findings 1 and 2 |
| `/tmp/audit-loading/audit2.mjs` (503, 401, reduced motion, refetch, ARIA) | results in "Verified per defect" |
| Base `85d8422` built and audited for CLS | font-swap CLS identical to head, so pre-existing |

Not verified: a real browser on a fast machine for finding 1, real provider or backend behaviour (all fixtures are synthetic and mocked), and the visual fidelity of the skeletons beyond what 0.0000 loading-only CLS implies.
