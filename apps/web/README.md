# noti.school browser app

Client-only SolidJS + Vite. Product responses are validated with the frozen workspace contracts. All requests use relative endpoints, same-origin credentials and the custom CSRF header on mutations; ask and indexing operations send idempotency keys. Production contains no synthetic response fixtures.

## Commands

Use the repository's pinned Node 24.18.0 and pnpm 10.29.2. Install the workspace from the root with `pnpm install --frozen-lockfile --ignore-scripts`. The root lock includes the browser application.

- `pnpm --filter @noti/web typecheck`
- `pnpm --filter @noti/web build`
- `pnpm --filter @noti/web test`
- `pnpm --filter @noti/web test:e2e` (build first; starts and stops an isolated preview at localhost:3304)
- `pnpm --filter @noti/web dev` (localhost:3000, existing auth/API proxy contracts)
- `pnpm --filter @noti/web assets:optimize` (approved input default path; explicit source can be passed as an argument)

Production delivery is the static `dist/` directory served by the Rust app. No production Vite process or deployment changes are included.

## Boundaries

History loads institution-scoped conversations for the signed-in owner. Authentication uses Better Auth native wire format, with `X-Noti-Invitation` for password signup and Google initiation. Reset and deletion callback tokens are consumed into memory and removed from the URL before application resource requests. Passwords and invitation/reset tokens are never persisted. Draft, institution and language may be stored in tab session storage.

Source/citation reads, version files, upload, actions, feedback and budget depend on the real services. Missing services produce visible limitations. No test proves real identity/database/provider/mail operation or factual answer support. Schema and reference validation are a structural safety boundary only.

## Scene and asset

The direct Three scene is dynamically imported, with repeated geometry batched into six instanced meshes. DPR is capped at 1.5, archive dimensions and geometry counts are fixed, and the request starts independently of submit motion. Entry camera motion and submit zoom are separate; returning home does not replay the previous submission. System reduced-motion applies before the first rendered frame. Pause, visibility, intersection and unmount stop animation; context loss reveals the approved fallback. Geometry/materials/renderer/listeners/observers are disposed.

The fallback was inspected before optimization. Reproducible Sharp conversion and source/output hashes are recorded in `public/archive.provenance.json`. It is illustrative and is not source evidence.

When WebGL, the scene import, or the context fails, the same bitmap uses native Web Animations: a 2.2-second entry, a gentle 10-second alternating ambient pan/zoom, and a 600ms submit zoom. One animation is active at a time; there is no fallback JavaScript frame loop. The image stays between 1.04× and 1.2× with less than 1% translation and clips inside its archive container, including on mobile. The HTML prompt does not move. Request dispatch remains independent of animation and historical submit counts do not replay on return home.

Pause, reduced motion, hidden documents and offscreen intersection suspend the fallback in place. Initial reduced motion creates no animation. Unmount cancels the animation and removes the visibility/media listeners and intersection observer. A functioning Three scene never starts bitmap animation. See the [native animation API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate) and [pause semantics](https://developer.mozilla.org/en-US/docs/Web/API/Animation/pause).

NOTI-8 isolated validation uses `pnpm --filter @noti/web exec playwright test --config ../../.handoff/playwright-3316.config.ts` after building. This override owns loopback port 3316 and stops its preview on completion; it does not use the review ports. Fallback tests include actual image pixels, simulated document visibility, real offscreen intersection, cancellation/resource cleanup, mock request timing/counts and normal Three regression. These Chromium checks do not verify the user's physical Chrome installation or hardware.

Tests retain actual screenshots and canvas-only pixel evidence under `tests/web/artifacts`. Screenshots that show Demo use synthetic intercepted contracts exclusively in test files. Unit tests exercise endpoint, transport and response boundaries. Playwright covers rendered components and complete journeys.

Primary references used: [Solid client setup](https://docs.solidjs.com/quick-start), [Three renderer lifecycle](https://threejs.org/docs/pages/WebGLRenderer.html), [Lucide Solid](https://lucide.dev/guide/solid), and the installed Better Auth 1.7.6 password/signup route source. Additional exact dependency pins were checked with `pnpm view`: Three 0.186.1, @types/three 0.186.0, lucide-solid 1.48.0, @playwright/test 1.63.0, Sharp 0.35.4.
