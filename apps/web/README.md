# noti.school browser app

Client-only SolidJS + Vite. Product responses are validated with the frozen workspace contracts. All requests use relative endpoints, same-origin credentials and the custom CSRF header on mutations; ask and indexing operations send idempotency keys. Production contains no synthetic response fixtures.

## Commands

Use the repository's pinned Node 24.18.0 and pnpm 10.29.2. The coordinator must update the root lock importer before a frozen install. During this scoped worker run: `pnpm install --store-dir .cache/pnpm --ignore-scripts --lockfile=false` preserved the root lock.

- `pnpm --filter @noti/web typecheck`
- `pnpm --filter @noti/web build`
- `pnpm --filter @noti/web test`
- `pnpm --filter @noti/web test:e2e` (build first; starts and stops an isolated preview at localhost:3304)
- `pnpm --filter @noti/web dev` (localhost:3000, existing auth/API proxy contracts)
- `pnpm --filter @noti/web assets:optimize` (approved input default path; explicit source can be passed as an argument)

Production delivery is the static `dist/` directory served by the Rust app. No production Vite process or deployment changes are included.

## Boundaries

History lists only conversation IDs opened in the current tab; the frozen API has no account conversation-list endpoint. Authentication remains Better Auth native wire format, with `X-Noti-Invitation` for password signup and Google initiation, matching the identity worker's read-only implementation observed during this run. Native reset callback query tokens are consumed into memory and removed from the URL. Passwords and invitation/reset tokens are never persisted. Draft, institution and language may be stored in tab session storage.

Source/citation reads, version files, upload, actions, feedback and budget depend on the real services. Missing services produce visible limitations. No test proves real identity/database/provider/mail operation or factual answer support. Schema and reference validation are a structural safety boundary only.

## Scene and asset

The direct Three scene is dynamically imported. DPR is capped at 1.5, archive dimensions and geometry counts are fixed, and the request starts independently of submit motion. System reduced-motion applies before the first rendered frame. Pause, visibility, intersection and unmount stop animation; context loss reveals the approved fallback. Geometry/materials/renderer/listeners/observers are disposed.

The fallback was inspected before optimization. Reproducible Sharp conversion and source/output hashes are recorded in `public/archive.provenance.json`. It is illustrative and is not source evidence.

Tests retain actual screenshots and canvas-only pixel evidence under `tests/web/artifacts`. Screenshots that show Demo use synthetic intercepted contracts exclusively in test files. Unit tests exercise endpoint, transport and response boundaries. Playwright covers rendered components and complete journeys.

Primary references used: [Solid client setup](https://docs.solidjs.com/quick-start), [Three renderer lifecycle](https://threejs.org/docs/pages/WebGLRenderer.html), [Lucide Solid](https://lucide.dev/guide/solid), and the installed Better Auth 1.7.6 password/signup route source. Additional exact dependency pins were checked with `pnpm view`: Three 0.186.1, @types/three 0.186.0, lucide-solid 1.48.0, @playwright/test 1.63.0, Sharp 0.35.4.
