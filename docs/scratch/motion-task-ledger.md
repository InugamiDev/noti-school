# NOTI-7 motion task ledger

- [x] Confirm clean checkout at `27ac5b877f760a8b1f38c8663881a77ace9f66b1`; read integration wave, target specs, canonical instructions and verified five context manifest files.
- [x] Measure baseline actual WebGL draws using synthetic fixture at 1440×900.
- [x] Instance repeated boxes; retain archive composition, camera and folio motion; guard lazy lifecycle.
- [x] Typecheck/build and browser pixel/lifecycle checks at desktop/mobile/wide.
- [x] Record draw comparison, screenshots, scoped diff/hashes and handoff; stop owned server.

Scope: only scene.ts, Archive.tsx, experience.spec.ts, performance.spec.ts and authorized ledger/handoff paths. Generated test output stays under tests/web/artifacts. No DB, external providers, accounts, deployment or child agents.

## Implementation and evidence

Six material batches replace individual box Mesh draws. The 144 transparent folio outlines retain their existing sorting and geometry. Folio groups remain the transform source; dynamic instance matrices follow their original bob. Static batches upload once. Bounds include the full 0.045-unit motion amplitude. Instance GPU buffers, shared geometry/materials, renderer, observers and listeners are disposed; disposal is idempotent. Draws also guard hidden/offscreen/dead/context-lost states. Lazy import rejection does not update an unmounted component, and a zoom requested before import resolution is replayed.

Same 1440×900 viewport, synthetic institution, disabled/mock providers, Chromium 153.0.8010.12, ANGLE SwiftShader: baseline final sample 1,507–1,510 calls/frame (median 1,507); after 145–146 (median 146), 90.31% median reduction. Initial baseline sample was 1,508–1,509; normal motion/frustum culling accounts for small variation. Counts include drawArrays/drawElements and both instanced forms, grouped by actual RAF timestamp. No product globals or telemetry added.

Actual canvas pixel tests pass at 1440×900, 390×844 and 1920×1080: normal frames differ, pause and reduced-motion pairs match, image channel deviation exceeds 5. Fixed reduced-motion before/after comparisons are exactly equal on desktop/mobile; wide maximum channel difference is 1, mean 0.000000445. Images were visually inspected for desktop composition and mobile framing. HTML and CSS are unchanged.

Hidden (test document.hidden override plus visibilitychange), real offscreen scrolling/IntersectionObserver and unmount stop all instrumented draw methods. Three repeated unmounts leave zero live WebGL buffers/programs. Lazy import resolving after unmount produces no canvas. Existing context-loss and WebGL-unavailable fallback tests pass. GPU model-view uploads prove entry camera movement from -13.20 to -12.33 and submit movement to -9.49; request dispatch was 2 ms after submit. This is headless software-rendering evidence, not physical-phone FPS or a real background-tab scheduler benchmark.

## Exact commands and outcomes

Commands use `PATH=/home/inu/.npm-global/bin:/home/inu/.nvm/versions/node/v24.18.0/bin:$PATH`.

- `pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile`: exit 0; no lock edits.
- `pnpm --filter @noti/web typecheck`: exit 0.
- `pnpm --filter @noti/web exec vite build --outDir ../../tests/web/artifacts/dist`: exit 0 before and after; existing >500 kB lazy scene chunk warning remains (after gzip 134.48 kB). Outdir override keeps generated output in the assigned artifact directory.
- `MOTION_BASELINE=1 pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts performance.spec.ts`: exit 0, 1 passed; repeated once before rebuilding to add fixed reduced-motion comparison screenshots.
- `pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts experience.spec.ts performance.spec.ts`: exit 0, 11 passed in 1.3 minutes (before the two additional tests below).
- `pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts experience.spec.ts --grep 'instanced GPU'`: exit 0, 1 passed, three disposal cycles.
- `pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts experience.spec.ts --grep 'entry dolly'`: final exit 0, 1 passed. Three earlier instrumentation attempts failed because GLSL eliminated viewMatrix/cameraPosition; probe now observes the actual modelViewMatrix of identity-world instanced batches. No product fix was needed for those probe failures.
- `git diff --check`: exit 0.
- `ss -ltn '( sport = :3314 )'`: no listener before or after tests. Preview uses supported Playwright `--config` and Vite `--port` overrides, strictPort and reuseExistingServer:false; no other services terminated.

Artifacts: `tests/web/artifacts/` includes before/after draw JSON, screenshots, per-viewport canvas hashes, pixel-comparison.json, lifecycle-draws.json, gpu-disposal.json, camera-request-evidence.json, Playwright result JSON and generated override config. The full 11-test result is retained at `tests/web/artifacts/tests/web/artifacts/results.json`; the final camera test result is at `tests/web/artifacts/results.json`. Scoped patch and all artifact hashes are referenced by `.fleet-handoff.json`.

Status: implemented and locally tested, pending coordinator independent review. No physical GPU/phone benchmark, real providers, identity/backend validation, deployment or external exposure performed. Canonical older delegation/model defaults are superseded by the current integration contract (no children, Astra/high). Target-local CLAUDE.md and .ckignore are absent; supplied global/canonical policies and harness .ckignore were read. No model-switch operation was performed; separate launcher telemetry was unavailable.

## Follow-up: historical submit counter

- [x] Read versioned motion-followup-ORDER.md and integration-wave-common.md; HEAD and all five returned file hashes match. Preserve prior diff.
- [x] Reproduce with real browser navigation against the prior build: ask, return home without reload; GPU camera reached -9.487 instead of remaining below -11.8. Regression failed at the intended assertion (followup-before.log).
- [x] Archive records props.zoom at component creation. Only a later observed change triggers zoom or queues it while the scene import is pending. A newly mounted archive ignores its historical nonzero counter.
- [x] Rerun typecheck/build and all scoped browser tests; refresh hashes and return with preview stopped.

Follow-up commands (same PATH prefix and existing ignored port 3314 configuration):

- `pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts experience.spec.ts --grep 'entry dolly' > tests/web/artifacts/followup-before.log 2>&1`: expected exit 1 against the previous build, reproducing historical zoom.
- `pnpm --filter @noti/web typecheck > tests/web/artifacts/followup-typecheck.log 2>&1`: exit 0.
- `pnpm --filter @noti/web exec vite build --outDir ../../tests/web/artifacts/dist > tests/web/artifacts/followup-build.log 2>&1`: exit 0; existing lazy chunk warning unchanged.
- `pnpm --filter @noti/web exec playwright test --config ../../tests/web/artifacts/motion.config.ts experience.spec.ts performance.spec.ts > tests/web/artifacts/followup-tests.log 2>&1`: exit 0, all 13 passed in 1.6 minutes. Results JSON now contains the full 13-test follow-up run.
- `git diff --check`: exit 0. `ss -ltn '( sport = :3314 )'`: no listener after the suite.

Actual GPU regression: initial ask dispatch 3.1 ms, request count 1; return-home camera stays between -13.20 and -12.07 with request count still 1; subsequent ask dispatch 2.7 ms, total count exactly 2, zoom reaches -9.84. Camera locations are captured separately per WebGL context so the new Archive mount is measured. All three viewport pixel checks, paused/reduced behavior, late-import/unmount race, hidden/offscreen suspension, fallback and GPU cleanup still pass. Follow-up draw sample remains 145–146/frame (median 145 versus the frozen baseline median 1507). No scene.ts, performance.spec.ts or App.tsx edits in this correction. No production test globals were introduced.
