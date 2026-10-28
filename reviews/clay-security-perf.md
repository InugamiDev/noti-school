# Clay security / performance review (campaign noti-clay-20261028)

Head = integrated worktree; base = `af5a30f`. Reviewer did not edit code.

## Findings

| # | Severity | file:line | Failure scenario | Evidence |
|---|----------|-----------|------------------|----------|
| 1 | medium | apps/web/src/landing/Hero.tsx:8, apps/web/dist/assets/index-*.js | Initial JS roughly doubles versus base (231.8 kB → 476.1 kB raw; 69.1 → 144.4 kB gzip) and initial CSS grows 70.5 → 94.6 kB (31.0 → 34.3 kB gzip). The cause is the UI kit's Kobalte primitives, solid-sonner and lucide icons now statically imported by the entry chunk (16 "kobalte" matches in the entry bundle). On slow mobile connections the landing page pays for dialog/popover/select/tooltip code it may never use. Not a security issue; a budget concern. Whether this breaches `tests/web/performance.spec.ts` was not run. | `pnpm --filter @noti/web build` on both trees (see below) |
| 2 | low | `pnpm audit --prod` | 12 advisories in production dependencies (2 critical, 3 high, 5 moderate, 2 low). None come from a package this campaign added: `package.json`, `apps/web/package.json` and the lockfile are unchanged versus base. Web-side: `seroval` via `solid-js` (1 critical, 1 high). The rest are in `apps/auth` (better-auth, zod, nodemailer). Pre-existing and outside this diff; the `seroval` issues only matter if Solid SSR/serialisation is used, which this repo does not use (not verified in depth). | `pnpm audit --prod` → "12 vulnerabilities found, Severity: 2 low \| 5 moderate \| 3 high \| 2 critical" |

No critical or high findings attributable to this change.

## Verified clean

- **XSS:** no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` or `dangerouslySetInnerHTML` anywhere in `apps/web/src` or `index.html`. Source titles, version labels, locator sections, filenames and model answers are rendered as Solid text nodes.
- **Citation and original URLs:** every `original_url` goes through `safeLink` (`api.ts:112`), which accepts only `https:` and returns the normalised `href`. External links carry `target="_blank" rel="noopener noreferrer"` (Sources.tsx:207,292; Admin.tsx:364,444,445). Cited-original hrefs are built by `scoped()` from the API endpoint template, with `locator.page` appended after `#page=`. The contract defines it as a positive integer (`packages/contracts/src/index.ts:22`), so no injection. The only other external hrefs are the hardcoded `https://github.com/InugamiDev` links (HelpContact.tsx:99, MarketingPages.tsx:341).
- **Dependencies:** no new or changed packages versus base. Pins are exact: three 0.186.1, @kobalte/core 0.13.14, lucide-solid 1.48.0, solid-sonner 0.3.3, fontsource packages 5.3.0. `pnpm-workspace.yaml:14` has `onlyBuiltDependencies: []`, so no install scripts run. Provenance of the registry packages was not independently verified.
- **No runtime third-party loads:** the built entry, CSS and `scene` chunk contain no CDN or font-host URLs. The only `http(s)` strings are XML namespaces, JSON-schema ids, a three.js docs URL in a comment and the GitHub link. Fonts are fontsource files emitted into `dist/assets`. `hero3d/scene.ts` uses `document.fonts` only and has no `fetch`, `Image` or `TextureLoader`.
- **Secrets and env:** no `import.meta.env`, `VITE_*` or `process.env` in `apps/web/src` or `vite.config.ts`. Auth callbacks send only `location.origin + '/#/auth'`. Token inputs are bounded (`TOKEN_MAX` 256). The `sessionStorage` use (drafts and operations, owner-scoped) is pre-existing and unchanged in nature.
- **CSP compatibility:** the only CSP strings in the repo are in `apps/api/src/ingestion.rs`, unrelated to web. The new web code has no inline `<script>` and no `eval`/`new Function`. The built `index.html` has one external module script and one external stylesheet. Not tested under a live CSP header; style handling in Kobalte was not checked at runtime.
- **three.js isolation:** `WebGLRenderer` appears 0 times in the entry chunk and 6 times in `scene-*.js` (552.9 kB raw, 138.8 kB gzip; base 539.2 kB). The built `index.html` has no modulepreload for it. `ClayHero.tsx:43` loads it with `await import('./scene')` only after an IntersectionObserver hit plus idle callback. Its static import in Hero.tsx is a component wrapper, not three.
- **WebGL disposal:** `ClayHero` `onCleanup` sets `alive=false`, cancels the idle timer, disconnects the observer and calls `handle.dispose()`. `scene.ts:414-441` is idempotent. It cancels the RAF, disconnects the Resize and Intersection observers, removes the visibilitychange, pointermove, pointerleave and `webglcontextlost` listeners, disposes geometries, materials, sprite maps and numeral textures, then calls `renderer.dispose()`. The `alive` guard after the async font and chunk load prevents mounting after unmount. Not runtime-tested (no browser run). `forceContextLoss` is not called; low impact.

## Commands run

- `git diff $FLEET_BASE_SHA --stat` → 51 files changed, 6607 insertions, 4335 deletions. No package.json or lockfile entries.
- `pnpm install --frozen-lockfile --offline --ignore-scripts` (head and a temporary base worktree, since removed) → done.
- `pnpm --filter @noti/web build` (head) → built in 8.46s.
  - `index-*.js` 476.11 kB (gzip 144.37 kB)
  - `index-*.css` 94.60 kB (gzip 34.27 kB)
  - `scene-*.js` 552.93 kB (gzip 138.77 kB)
  - warning: a chunk is over 500 kB (the lazy `scene` chunk).
- `pnpm --filter @noti/web build` (base) → built in 9.36s.
  - `index-*.js` 231.77 kB (gzip 69.14 kB)
  - `index-*.css` 70.52 kB (gzip 31.04 kB)
  - `scene-*.js` 539.16 kB (gzip 134.48 kB)
- `pnpm audit --prod` → 12 vulnerabilities (2 low, 5 moderate, 3 high, 2 critical); all under `apps__web>solid-js>seroval` or `apps__auth>*`.
- `grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|dangerouslySet" apps/web/src` → no matches.
- `grep -c WebGLRenderer dist/assets/index-*.js dist/assets/scene-*.js` → 0 and 6.
- Not run: unit tests, Playwright e2e, live-browser WebGL leak check, live-CSP check.
