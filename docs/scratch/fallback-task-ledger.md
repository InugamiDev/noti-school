# NOTI-8 fallback motion

- [x] Read policy packet, verified five manifest inputs, product contracts and existing motion flow.
- [x] Implement bounded native bitmap entry/ambient/submit motion and lifecycle cleanup.
- [x] Typecheck, build, unit tests and all browser suites on isolated port 3316.
- [x] Record source hashes, scoped diff, knowledge receipt and six-section handoff.

Intent / journey: a student with unavailable WebGL sees the approved archive move while the accessible prompt remains stable; submitting starts exactly one request immediately and returning home starts a fresh entry.
Critique: pause, initial and changed reduced motion, hidden/offscreen, lazy failure, context loss and repeated unmounts need evidence; animation must never run behind a live scene. Mobile overscan must cover every bounded transform.
Implementation brief: use native Web Animations on the existing image, with one active animation, no frame loop, fallback-only listeners/observer, and per-mount submit accounting. Preserve direct Three and request code. Tests intercept synthetic APIs; no database or service3810/3811 access.
Policy override: this ORDER forbids children, database access, shipping and out-of-scope writes; it supersedes older harness delegation/database allowances. Implementation only, pending coordinator review.

Source relevance: fallback brief fixes motion intent; product/design docs preserve stable HTML and truthful data; architecture/policy constrain implementation. No new visual system, cards, copy or assets. GSAP facade recommends native motion for this routine sequence; no GSAP dependency was introduced.

## Verification log

All pnpm commands use `PATH=/home/inu/.npm-global/bin:/home/inu/.nvm/versions/node/v24.18.0/bin:$PATH` from TARGET_ROOT.

- `pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile`: exit 0; lock unchanged.
- `pnpm --filter @noti/web build`: exit 0, includes strict `tsc --noEmit`; existing Three chunk-size warning (539.16 kB).
- `pnpm --filter @noti/web test`: exit 0, 6/6 unit tests.
- `pnpm --filter @noti/web typecheck`: exit 0.
- `pnpm --filter @noti/web exec playwright test --config ../../.handoff/playwright-3316.config.ts`: exit 0, 31/31 in 118.4s. All experience, performance, workspace suites plus first five fallback tests. Preserved `.handoff/browser-all-results.json`.
- Expanded fallback command, same config plus `fallback.spec.ts`: two intermediate runs exited 1 (5 passed, one offscreen CDP screenshot comparison failed). CDP capture changed capture/layout conditions; stable real-offscreen transform checks already passed. No production patch was made in response.
- Final same fallback command: exit 0, 6/6 in 23.2s. Standard image screenshots retain the actual preceding offscreen observer state during capture; real scroll/IntersectionObserver pause and resume are separately asserted. Capture temporarily scrolls into view, so this is not an untouched offscreen raster read. Final report `tests/web/artifacts/results.json`.
- `git diff --check`: exit 0. All 32 distinct scenarios passed across the full run and expanded fallback rerun; no claim of one 32-test run.

Evidence: actual bitmap PNG hashes differ for entry/ambient and match paused/reduced/hidden/offscreen-state captures; initial reduced motion creates zero animations. Listener/observer balances reach zero on unmount, animation becomes idle with null time/callback, repeated home/submit keeps per-mount counts, lazy failure preserves pending zoom. Real WebGL has zero fallback animations, with normal Three pixel/lifecycle/GPU regression passing (145–146 calls/frame). Mobile fallback pixels were visually inspected. Hidden state uses a test `document.hidden` override; not a physical browser background-tab benchmark.

Unverified: user's Chrome/hardware, Firefox/Safari, real providers/auth/mail/database, real retrieval quality, production deployment and independent audit. No out-of-scope defect discovered. No database or service3810/3811 operations, browser settings changes, children, pushes, merges or deployment.
