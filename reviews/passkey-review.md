# Review: password + passkey sign-in (campaign noti-passkey-20261118)

Reviewer: independent adversarial review of `git diff 13f0c31` (HEAD 507a184, branch jev-web). I did not write this code. I made no code changes. This file is my only edit.

**Verdict.** I found no way to create an account, get a verified session or sign in as another user without a valid invitation that matches the email. Every gate is green. The frozen contract shapes are unchanged. I verified all of this on the real services and a real PostgreSQL 16 database, not only with mocks. I found one real data-integrity weakness in passkey storage (finding 1). There is also an important supply-chain item that was already present before this diff (finding 2). The rest is low severity.

## Findings

| # | Severity | Location | Failure scenario | Evidence |
|---|---|---|---|---|
| 1 | medium | `apps/auth/src/schema.ts:8-19` (plugin `verify-registration` in `@better-auth/passkey` 1.7.6 `dist/index.mjs:387-401`; table documented at `docs/contracts/database.md:32`) | **One user can register a passkey under another user's credential ID.** That makes the credential-to-user lookup ambiguous. Registration never checks whether a `credentialID` already exists. `excludeCredentials` is only a hint to the client. The column is not unique. `verify-authentication` runs `findOne({credentialID})` with no ORDER BY (`index.mjs:463`). Example: user B is invited and verified, and knows victim A's credential ID. B registers B's own key pair under that ID. Whichever row PostgreSQL returns first decides the outcome. When B's row comes first, A's passkey sign-in fails with 401, so A is locked out of passkey sign-in, while B's key signs in (as B). I saw no account takeover: the session always belongs to the owner of the row whose public key verified. Precondition: B must learn A's credential ID. No route exposes it to other users. The `afterVerification` hook in schema.ts runs its own separate `findOne`, so it can inspect a different row than the one the plugin verified. Suggested fix (in code, no DDL): reject a duplicate `credentialID` in `registration.afterVerification`. A unique index would be a shared-owner migration decision. | **CONFIRMED by execution** on the real auth service with PostgreSQL 16 (`/tmp/pkrev/scripts/collide.mts`). Bob registered a key under Carol's credential ID: 200. Before the row order changed: `carol=200->carol bob=400`. Then I deleted and reinserted Carol's row, which simulates the new tuple location a non-HOT counter update or a restore can produce. After: `carol=401 bob=200->bob`. The earlier smoke run showed the same 200 for a colliding registration against Alice. |
| 2 | high (already present, not introduced by this diff; whether it applies here is **PLAUSIBLE**, not proven) | `pnpm-workspace.yaml:6-7` (catalog `better-auth: 1.7.6`, `'@better-auth/passkey': 1.7.6`) | **The pinned `better-auth` 1.7.6 has a critical advisory and a high advisory. Both are fixed in 1.7.7.** GHSA-965c-763c-88jm (critical): "OAuth state can be used as a Magic Link to sign in as another user". GHSA-r4xp-prcw-77qf (high): "OAuth Proxy lets an attacker sign in as another user". The owner decision pins the passkey plugin to exactly 1.7.6, so the two packages must be upgraded together. The audit is therefore **not clean**. The passkey plugin itself and `@simplewebauthn/server` 13.3.3 have no advisories. `apps/auth` also pulls zod 4.6.5 (high GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6) and nodemailer 10.0.10 (5 moderate). The web app pulls seroval through solid-js (1 critical, 4 high, 1 moderate). The base lock already had all of these. | `pnpm audit --prod`: 16 vulnerabilities (2 low, 6 moderate, 6 high, 2 critical), exit 1. I could not read the advisory texts, because this session's hook blocks web fetching. So whether GHSA-965c applies to this config (Google with `storeStateStrategy:'database'`, no magic-link or oauth-proxy plugin) is unverified. The coordinator should read them before deploying. |
| 3 | low | `apps/auth/src/service.ts:35-39` (`accountKey`) | **The per-credential ceiling on passkey sign-in (50/min) can be bypassed.** `accountKey` prefers `body.email` when it is present. The plugin's body schema strips unknown keys, so verification still runs. A client that adds a random `email` to `/passkey/verify-authentication` is keyed by that email and never reaches the credential bucket. The per-client limit (10/min) and the shared bucket for clients without a cookie (120/min) still apply. Signatures cannot be brute-forced, so the real impact is load on the passkey and verification tables. | **CONFIRMED by execution** (`/tmp/pkrev/scripts/ceiling.mts`, loopback fixture, 6 admitted clients × 10 attempts on one credential ID). Credential ID only: `{"400":50,"429":10}`. With a random `email` field: `{"400":60}`. |
| 4 | low | plugin `index.mjs:424-428`, passed through by `service.ts:196-202`; web `apps/web/src/Passkeys.tsx:21` | **A rejected registration returns 500, not 4xx.** This happens when the clientData origin is foreign or the rpId is wrong. The plugin wraps every non-APIError from `verifyRegistrationResponse` as INTERNAL_SERVER_ERROR. The UI maps `>=500` to "unavailable", so a refused authenticator reads as a service outage. It also adds noise to 5xx monitoring. Security is not affected: the registration is refused. | **CONFIRMED** in the smoke run: `register with foreign clientData origin 500`, `register with foreign rpId 500`. |
| 5 | low | `apps/auth/src/service.ts:116-131`; plugin body schema `index.mjs:304-308` | **The passkey `name` has no length limit on the server.** The plugin accepts any `z.string().trim()`, so the only bound is the 16 KiB body cap. The UI limits it to 64 (`Passkeys.tsx:218`), but a direct POST can store about 16 KB per passkey name, and that name is returned in every list. | Verified by reading the code only. Not executed. |
| 6 | low | plugin `index.mjs:355,483` (`requireUserVerification: false`, hard-coded); docs `apps/auth/README.md:99-106`, `docs/contracts/environment.md` | **The docs do not say that passkey sign-in accepts assertions without user verification.** An assertion with presence only (for example, a security key without a PIN) yields a full session. So for this account a passkey is a possession factor, not possession plus PIN or biometric. That may be acceptable, but the trust-model docs say nothing about it. | Verified by reading the code only. The `@better-auth/passkey` 1.7.6 options do not expose this setting. |
| 7 | low | `apps/web/scripts/demo-server.mjs:370-372` | **The synthetic demo signs the new member in at sign-up, but the real service does not.** The real service returns `{token:null}` ("now sign in"). So the presentation demo shows a flow the real backend never produces. Playwright does cover the real path with route mocks (`tests/web/passkey.spec.ts:488`). I also confirmed it against the real backend (see the browser smoke below). | Confirmed by reading the code and running the real backend. |
| 8 | low | `apps/auth/README.md:99` | Documentation nit: the passkey section is numbered "4." but sits between items 1 and 2 of the sign-in list. | Confirmed by reading the file. |

### Checked and found sound (verified, no finding)

- **Invitation enforcement** (real auth service plus Rust `/internal/invitations/check` on PostgreSQL 16, `AUTH_INVITE_VERIFIES_EMAIL=true`, no SMTP):
  - These sign-ups returned 403: no invitation; Alice's token with Bob's email; a bogus token; an `emailVerified` field smuggled into the body; a duplicated header (`tok, tok`).
  - A sign-up after redemption with a used token returned 403. A replayed redeem returned 403.
  - Header name case does not matter.
  - Race: two concurrent sign-ups on one invitation (`alice@…` and `Alice@…`) returned `200,422`, leaving one user.
  - Sign-up returns `token:null` with `emailVerified:true` and sets no session cookie.
  - Password sign-in then works, and `/internal/session` reports the session as verified.
- **Flag off with no mail returns 503 (`email`); mail configured keeps the verification flow; a failed mail transport stays 503.** Covered by `tests/auth/invite-verified.test.ts`, which I read and ran.
- **Passkeys:**
  - Register, list and delete need a verified session. Register options without one returned 401.
  - `rp` is `{"name":"noti.school","id":"localhost"}` and the authentication `rpId` is `localhost`. The expected origin is fixed by the `origin` option, so a foreign clientData origin on an assertion returned 400.
  - `verify-authentication` without an `Origin` header returned 403. `createSession` on registration returned 403.
  - Bob cannot list or delete Alice's passkey (401, via `requireResourceOwnership`).
  - Passkey sign-in gives a session that `/internal/session` accepts, for the same user ID.
  - No user is ever created.
  - `update-passkey` is not exposed (404).
  - `APP_ORIGIN` is pinned by `readConfig` to `http://localhost:3000` or `https://noti.school`, so rpID equals the APP_ORIGIN hostname.
- **Rate limits and body bounds:**
  - Passkey routes go through the same per-client and shared limits as sign-in (10/min on authenticate, 120/min shared for clients without a cookie). The flaw in finding 3 is separate.
  - Bodies over 16 KiB return 413.
  - GET passkey routes reject a foreign `Origin` or a `Sec-Fetch-Site` other than `same-origin`.
- **Plugin pin:** `@better-auth/passkey@1.7.6`. npm repository `better-auth/better-auth`, published by "GitHub Actions". The lock integrity matches `npm view`. It pulls `@simplewebauthn/server` 13.3.3.
- **`scripts/auth-migrate.ts` uses `schemaOptions()`,** the same `identityPlugins()` the service passes to `betterAuth`. `tests/auth/oauth.test.ts:71` asserts that the schemas are equal. Migration on a fresh database created `auth.passkey` exactly as `database.md` describes (credentialID index not unique, userId FK ON DELETE CASCADE). A re-run is idempotent (exit 0).
- **Capabilities:** `/internal/capabilities` returns `password` and `passkey`, and `GET /api/v1/capabilities` on the real Rust binary passes them through (`password` and `passkey` both available with the flag on). Rust probe validation and the core-failure fallback include both fields.
- **Docs trust model:** `environment.md` and `operator.md` say plainly what the flag trusts: possession of the operator-delivered invitation file. They say it is off by default, ignored when SMTP is configured, that it does not redeem anything or grant membership, and that reset and deletion still need mail. Finding 6 is the one gap.
- **Web:**
  - The UI is driven by capabilities.
  - When mail is unavailable it says "Password reset needs email, which is not set up yet." (EN and VI).
  - The VI copy exists.
  - No em/en dashes in the added web lines (0 matches).
  - 390px and 1440px are covered by Playwright with an overflow check.

## Commands run

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm contracts:check` | exit 0 |
| `pnpm test` | 19 pass / 0 fail |
| `pnpm --filter @noti/auth test` | 34 pass / 0 fail |
| `pnpm --filter @noti/auth build` | exit 0 |
| `pnpm --filter @noti/web typecheck` | exit 0 |
| `pnpm --filter @noti/web test` | 29 pass / 0 fail |
| `pnpm --filter @noti/web build` | exit 0 |
| `pnpm exec playwright test` (apps/web, full suite, workers 1) | **149 passed** / 0 failed (7.8 min). No failures, so no isolated reruns were needed |
| `CARGO_BUILD_JOBS=6 cargo test -j 6 -p noti-school-api` | 55 passed / 0 failed / 5 ignored (DB-gated), across 3 binaries with tests: 33+5 ignored, 6, 16 |
| `CARGO_BUILD_JOBS=6 cargo clippy -j 6 -p noti-school-api --all-targets -- -D warnings` | exit 0 |
| `cargo fmt --check` | exit 0 |
| `CARGO_BUILD_JOBS=6 cargo build -j 6 -p noti-school-api` | exit 0 |
| `npm view @better-auth/passkey@1.7.6 version repository.url dist.integrity _npmUser.name dependencies` | 1.7.6, `git+https://github.com/better-auth/better-auth.git`, published by GitHub Actions, integrity matches `pnpm-lock.yaml:298` |
| `pnpm audit --prod` (and `--json`) | exit 1: 16 vulnerabilities (2 critical, 6 high, 6 moderate, 2 low). None in `@better-auth/passkey` or `@simplewebauthn/*`. See finding 2 |

**End-to-end smoke** (disposable cluster, all synthetic):

| Step | Result |
|---|---|
| `/usr/lib/postgresql/16/bin/initdb -D <worktree>/.cache/pg-pkrev -U reviewer --auth=trust -E UTF8 --no-locale`; `pg_ctl … -o "-p 54391 -c listen_addresses=127.0.0.1 -k /tmp/pkrev/sock" start` | started, 127.0.0.1:54391 only. Port 5432 not touched |
| `infra/provision.sql`, rewritten to DB `noti_school_test_pk` with marker purpose `test`; synthetic role passwords | ok |
| `pnpm db:migrate` / `pnpm db:auth:migrate` (run twice) | 7 product migrations; auth core + passkey exit 0, re-run exit 0 |
| Rust API binary (`AI_MODE=disabled`, development) on 3810, auth `node dist/server.js` on 3811 (`AUTH_INVITE_VERIFIES_EMAIL=true`, no SMTP) | both ready. `/api/v1/capabilities` shows identity, password and passkey available, email disabled |
| `pnpm operator bootstrap` (6 synthetic student invitations, output files 0600 outside the checkout) | exit 0 each |
| `tsx /tmp/pkrev/scripts/smoke.mts` (HTTP: password sign-up, sign-in, redeem, passkey register and sign-in with a software P-256 authenticator, adversarial cases) | **28 pass / 0 fail** |
| `tsx /tmp/pkrev/scripts/collide.mts` | finding 1 reproduced |
| `tsx /tmp/pkrev/scripts/ceiling.mts` (loopback fixture) | finding 3 reproduced |
| `node /tmp/pkrev/scripts/browser.mjs`: real headless Chromium with a CDP virtual authenticator (ctap2, internal, resident key, UV), the built web app served by the Rust binary, `/api/auth` forwarded to the real auth service by route interception, page origin `http://localhost:3000` (port 3000 is taken on this host, so it was not bound). Flow: invitation link → create account → "Account created. Sign in to continue." with email prefilled → password sign-in → "Signed in and invitation redeemed" → add passkey from the first-sign-up offer → sign out → "Sign in with a passkey" → `verify-authentication` 200 → account with 1 membership → remove passkey | all steps pass. The DB shows 0 passkeys left for that user after removal. This verifies the web client's native `toJSON()` wire format against the real plugin, which the worker had left at "confidence: medium" |
| Cleanup | API and auth stopped. `pg_ctl stop -m fast` then `rm -rf .cache/pg-pkrev`. Ports 54391, 3810 and 3811 are free (count 0). Synthetic invitation files deleted. I also removed `.cache/rag-cli-tests`, `.verification/` and `tests/web/artifacts/`, which my cargo and Playwright runs had created (timestamps after my first run). `apps/auth/dist` and `apps/web/dist` (gitignored build output) were left in place |

**Not verified:**
- Real SMTP, Google or hardware authenticators.
- Whether the better-auth advisories in finding 2 apply here (advisory text unreadable in this session).
- Finding 1 under natural row reordering. I simulated it with a delete and reinsert done as superuser, not observed after organic counter updates: in the smoke run the victim kept working across 4 rounds of counter updates.

## Coordinator resolution (2026-11-18)

- Finding 1: fixed. `registration.afterVerification` refuses a credential id that already exists; `authentication.afterVerification` refuses any credential id with more than one row. Test added in `tests/auth/passkey.test.ts`. A unique index stays a shared-owner migration decision.
- Finding 2: advisory texts read. GHSA-965c-763c-88jm needs the Magic Link plugin; GHSA-r4xp-prcw-77qf needs the OAuth Proxy plugin. Neither is enabled, so neither applies. Upgrading better-auth and @better-auth/passkey together to 1.7.7 is still advised; owner decision.
- Finding 3: fixed. A body with `response` is keyed by its credential id (or `passkey:invalid`) before any email.
- Finding 4: fixed. A 500 from verify-registration is returned as 400 `invalid_request`.
- Finding 5: fixed. Passkey names longer than 64 characters return 400.
- Finding 6: documented in `docs/contracts/environment.md` and `apps/auth/README.md`.
- Finding 7: left open. Matching the demo to the real "now sign in" response breaks the demo-based Playwright journeys; the real path stays covered by the route-mocked spec.
- Finding 8: fixed (list renumbered).
