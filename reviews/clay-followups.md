# Review: Clay follow-ups FU1 to FU5 (campaign noti-clay-followups-20261030)

Independent adversarial review of `git diff 1f09887..b4688d0` (54 files, +737/-175). The reviewer did not write this
code. Every number below comes from a measurement made for this review: a clean build of HEAD, a clean build of the
base in a separate worktree, the repo suites, and probe specs kept outside the repository (`/tmp/rev-fu-probes`,
synthetic fixtures, mocked `/api`, headless Chromium with the SwiftShader flags from `playwright.config.ts`).

## Findings

| Severity | file:line | Failure scenario | Evidence |
|---|---|---|---|
| Medium | `apps/web/src/api.ts:11` | One failed fetch of the contracts chunk (a flaky phone network, or a deploy that removes the old hashed asset while a tab is still open) is cached forever: `contracts ??=` keeps the rejected promise. After that every API request and every Ask fails until the page is reloaded. Ask does nothing visible: `App.tsx:354` awaits `loadContracts()` before any state is set, so the rejection is unhandled, `busy` never turns on, no request is sent and no alert appears. This breaks the AGENTS.md rule that an outage produces a visible unavailable state. The base build had one bundle, so this failure mode did not exist. | Probe: the `schemas-*.js` route aborted once, then allowed again. Landing showed "School list unavailable right now". Fill the question, click Ask, wait 2.5s: `posts 0`, `alerts []`, URL stays `/`, pageerror `Failed to fetch dynamically imported module …/src-*.js`. The chunk is never fetched again (`schema fetch attempts [true]`). |
| Medium | `apps/web/src/App.tsx:48` (also `:219`, `main.tsx:11`) | Lazy routes have no error path. The repo has no `ErrorBoundary` or `Suspense`, and Solid's `lazy` caches the rejected import. If a route chunk fails, `<main>` renders empty with no message, focus never moves to the heading, and returning to the route after the network recovers is still blank until a reload. `main.tsx` mounts anyway through `.finally`, but the rejection goes unhandled. | Probe, chunk aborted on a direct visit: `#/sources` gives main text `""` and 4 pageerrors; `#/help` (MarketingPages) gives `""`; `#/history` gives `""`. In-app navigation `#/` → `#/sources` gives `""`. With the network restored, `#/` → `#/sources` is still `""`. |
| Low | `apps/web/src/ui/Toaster.tsx:29` | If the `ToasterHost` chunk fails, every toast is dropped without a trace, for example the "Citation copied" confirmation that DESIGN.md requires for every copy action. The rejection is also unhandled. A host that is only slow works: queued toasts replay. | Probe: ToasterHost aborted, then Copy citation: `toast shown 0`, 2 pageerrors. With the host delayed 3000ms the toast appeared 2849ms after the click, so late delivery works. |
| Low | FU1, measured by the coordinator's own definition | `#/` meets the ≤300 kB target only if you count the static entry graph. The contracts chunk (`schemas` 86.43 kB plus `src` 6.69 kB) is requested by the start-up `/me`, `/capabilities` and `/institutions` calls within the first ~300ms on every visit, and no API response can be shown before it arrives. So the JS on the critical path to a usable composer is about 355 kB, not 262 kB. That is still 27% less than before (484.70 kB). P0 should decide whether this counts as "initial". | Probe at 390x844: JS fetched before the `load` event was 355.53 kB (index 112.54, ui 78.28, Icon 28.45, dist 21.77, TextField 19.58, command 1.77, src 6.69, schemas 86.43). At 1440, `load` fired before schemas arrived (262.40 kB), and schemas arrived 23ms later. |
| Low | `apps/web/design/clay/DESIGN.md:204`, `apps/web/src/site/site.scss:61` | The new DESIGN.md sentence "its text wraps to at most two lines inside it on phones, so wrapping never changes its height" is only true from 375px. At 360px (the most common Android width) and at 320px the notice wraps to 3 lines and grows to 58.8px. At 360 the font swap still moves `<main>`, so the shift from the font swap alone is above the 0.02 budget there. R8 asked for 390 and that holds; the general claim in the doc does not. Base was worse at 360 (0.100), so this is an incomplete fix, not a regression. | Probe pilot notice: 320 → h 58.78, 3 lines; 360 → h 58.78, 3 lines; 375 and 390 → h 44, 2 lines. CLS at 360x800 with fonts delayed 1500ms: 0.0357 total, of which 0.0160 at 1701ms (the swap: `MAIN, BUTTON.site-pilot-close`). With no delay: 0.0733. |

No other verified defects. Checked and found clean:

- **FU1 icons.** Every `lucide-solid` import is now per icon (`lucide-solid/icons/*`). `Icon-*.js` (28.45 kB) is the shared base, not the barrel.
- **FU1 lazy-load regressions.**
  - Ctrl+K before the browser is idle opens the menu with focus in the combobox; the second open takes 20 to 24ms. On a cold open, the first keystrokes typed right after Ctrl+K are lost (`"lp"` or `"elp"` for `help`). The base build does exactly the same (`""`, `"elp"`, `"elp"`), so this is pre-existing, not a regression.
  - Closing returns focus to the previous target.
  - The phone Sheet with its chunk delayed 800ms still moves focus into the dialog and back to "Open menu" on Esc.
- **FU2.** The fix targets the real race. A fixed 1200ms server delay against a Stop click let the 503 land first, and the old "immediate" budget also counted the `expect.poll` interval. The answer is now held until after Stop, and the request time is taken in the handler. The double-submit ordering after the new `await loadContracts()` holds: `setBusy(true)` runs synchronously before the next await.
- **FU3.**
  - Every `size="sm"` Button on `#/`, `#/help`, `#/auth`, `#/sources`, `#/history` and `#/universities` at 390px measures a 36.0px box and hits at ±21.5px from its centre.
  - The new hit areas steal no taps from neighbours. A 5x5 elementFromPoint scan of every visible control on `#/` and `#/answer`, at 390 and 1440, gives the same overlap list on base and HEAD: two pre-existing items, the hero's `Student` overlay over a decorative input and the photo credit's `CC BY 2.0`/`Shixart1985` links.
- **FU4.** With fonts actually loading, CLS is 0.0011 to 0.0013 at 390x844 and 1440x900 when fonts are served at once, delayed 400ms or delayed 1500ms (8 font requests each time). So the repo test is not vacuous. Caveat: this host has only DejaVu (no Arial or Liberation), so only the new DejaVu fallback faces were exercised. The Arial-matched faces and Android (neither Arial nor DejaVu) were not measured.
- **R2.** With the 83-character name, the bar height is 50px at 390, 519, 520, 600, 760, 960, 1024 and 1440, with no bar or page overflow and send inside the box. It wraps only at 320 (100px), below the documented 520px breakpoint.
- **R9.** With `/me` returning 503, `#/auth` shows exactly one notice: "Your account could not be checked right now."
- **R10.** The weight changes from 500 to 400 match what font matching already rendered, so they cause no visual change. Citation digits drop the faux bold, as R10 asked.

## Before / after bundle (`pnpm --filter @noti/web build`, clean `dist`)

| Chunk | Base 1f09887 (raw kB) | HEAD b4688d0 (raw kB) | Loaded on #/ |
|---|---|---|---|
| index | 484.70 | 112.53 | entry |
| ui | - | 78.28 | modulepreload |
| Icon (lucide base) | - | 28.45 | modulepreload |
| dist (Kobalte shared) | - | 21.77 | modulepreload |
| TextField | - | 19.58 | modulepreload |
| command | - | 1.77 | modulepreload |
| **static initial total** | **484.70** | **262.38** | |
| schemas + src (contracts, zod) | in index | 86.43 + 6.69 | first API call (~200 to 300ms) |
| ToasterHost | in index | 43.27 | idle |
| CommandMenu + ZR5G2IB7 + Sheet | in index | 4.10 + 4.64 + 1.14 | idle |
| MarketingPages / Admin / Auth / Sources / HistoryView | in index | 30.38 / 28.45 / 11.54 / 9.96 / 5.64 | route |
| scene (hero3d, lazy) | 553.51 | 553.51 | idle, unchanged |

## Commands run

| Command (cwd) | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` (repo root) | exit 0, "Done in 1.1s" |
| `pnpm --filter @noti/web typecheck` | exit 0 (`tsc --noEmit`, no output) |
| `pnpm --filter @noti/web test` | exit 0: tests 81, pass 81, fail 0 |
| `rm -rf apps/web/dist && pnpm --filter @noti/web build` | exit 0, built in 2.06s; table above. Only warning: the pre-existing >500 kB `scene` chunk |
| Base worktree `1f09887`: `pnpm install --frozen-lockfile --ignore-scripts --offline && pnpm --filter @noti/web build` | exit 0; index 484.70 kB, scene 553.51 kB |
| `pnpm exec playwright test` (apps/web, full suite) | exit 0: **146 passed** (5.6m). One `✘` line is the pre-existing `test.fail` annotation on "instanced GPU resources are released on repeated unmounts" (expected failure, counted as passed). This covers loading.spec (CLS with fonts blocked) and the revamp specs (workspace-clay, framing, marketing, followups) |
| `pnpm exec playwright test tests/web/experience.spec.ts --repeat-each 20` | **not completed**: the whole-file 20x run (~20 x 19 tests) was killed at the 10-minute tool limit with no result. Replaced by the next row |
| `pnpm exec playwright test tests/web/experience.spec.ts -g "immediate submit" --repeat-each 20` (apps/web) | exit 0: **20 passed** (1.3m), 20/20 |
| `pnpm exec playwright test tests/web/loading.spec.ts tests/web/followups.spec.ts tests/web/workspace-clay.spec.ts` (apps/web, re-run alone) | exit 0: 37 passed (1.0m) |
| Probe specs `/tmp/rev-fu-probes/{a,b,c,d,e,g,h,i,j}.probe.mjs` against HEAD (port 3399) and base (port 3398) | 22 + 5 + 6 + 4 run against HEAD, 5 + 4 against base. All probes passed. They are measurements, not assertions; their output is quoted in the findings |
