# Environment and release templates

`packages/contracts/src/env.ts` is executable validation; `.env.example` contains blanks and safe defaults.
Use `pnpm env:check` with an explicitly loaded environment. It prints only mode and configuration booleans,
never URLs/secrets. No default dotenv load (avoids accidentally reading populated local secrets).
Rust must implement matching validation and `NOTI_ENV_FILE` loading before creating clients/listeners.
Service validators call `parseEnvironment(input, 'api'|'auth')`; the default combined diagnostic is for
foundation only. API does not require or receive auth DB/Better Auth secrets; it requires its own DB and
the internal secret, then checks identity reachability. Auth does not require the product DB or AI keys.

Safe limited boot has AI_MODE=disabled and AI_LIVE_CALLS_ENABLED=false. Missing DB, auth secret or
internal secret permits public static/health/capabilities only; protected operations fail 503. Secrets,
when configured, need >=32 high-entropy characters. Production mock mode is forbidden. Live mode requires
both switches to agree; missing OpenAI, the selected evidence provider, its required dated prices or DB keeps dependent capabilities disabled. EVIDENCE_PROVIDER is openai|jev, default openai. OpenAI mode needs three OpenAI rates; Jev mode additionally needs its key, pinned model and two Jev rates. No automatic fallback.
Environment presence is never evidence of credential validity, mail delivery or provider readiness.

API restricted file (`shared/api.env`, 0600): NODE_ENV, APP_ORIGIN, DATABASE_URL, INTERNAL_AUTH_SECRET,
API_BIND_ADDRESS, AUTH_INTERNAL_URL, WEB_DIST_DIR, UPLOAD_DIR, AI_MODE, AI_LIVE_CALLS_ENABLED,
AI_MONTHLY_BUDGET_USD, EVIDENCE_PROVIDER, OPENAI_API_KEY, TYPESAFE_API_KEY, OPENAI_CHAT_MODEL,
OPENAI_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, JEV_MODEL, TINYFISH_API_KEY, TINYFISH_DAILY_SEARCH_LIMIT,
TINYFISH_DAILY_FETCH_LIMIT, TINYFISH_DAILY_SEARCH_LIMIT_PER_SPACE, TINYFISH_DAILY_FETCH_LIMIT_PER_SPACE,
WEB_EVIDENCE_MIN_CONFIDENCE, GRAPH_AUTO_APPROVE.

Web evidence settings (2026-11-18): `JEV_MODEL` is exactly `jev-1.14.0` (default) or `jev-1.13.0`; aliases such
as `jev-latest` are rejected. `TINYFISH_API_KEY` is server-side only (never `VITE_*`). `TINYFISH_DAILY_SEARCH_LIMIT`
(1..12000, default 1000) and `TINYFISH_DAILY_FETCH_LIMIT` (1..1000 URLs, default 300) are application
self-limits below the shared free allowance (12,000 searches and 1,000 fetched URLs per UTC day).
`TINYFISH_DAILY_SEARCH_LIMIT_PER_SPACE` (1..12000, default 200) and `TINYFISH_DAILY_FETCH_LIMIT_PER_SPACE`
(1..1000 URLs, default 60) cap each institution (school or personal space) per UTC day in addition to the
global limits, so one space cannot use up discovery for everyone; both counters are charged atomically.
`WEB_EVIDENCE_MIN_CONFIDENCE` (0..1, default 0.6) drops low-confidence web passages; `GRAPH_AUTO_APPROVE`
(0..1, default 0.9) auto-approves extracted relations from approved sources. Discovery is configured only with
OpenAI, TinyFish and Jev keys (`configured.discovery`). The four limits accept plain decimal integers only and
the two thresholds plain decimals only (digits, optionally `.` and digits): no sign, exponent, hex, `.5`,
`5.` or surrounding whitespace. `env.ts` and the Rust config reject exactly the same forms.

Upgrade warning: a configured `TYPESAFE_API_KEY` makes Jev confidence a hard dependency of answers even with
`EVIDENCE_PROVIDER=openai`. Admission then requires dated Jev rates for the pinned `JEV_MODEL`, and a Jev
outage or cooldown makes answers unavailable. The default `JEV_MODEL` is now `jev-1.14.0` (previously
`jev-1.13.0`). Before deploying, import the `jev-1.14.0` input and output prices with the operator price
import (or pin `JEV_MODEL=jev-1.13.0` while its prices are current); otherwise answers report
`unavailable/pricing_missing` until the prices exist. Remove `TYPESAFE_API_KEY` to run without Jev.
Auth restricted file (`shared/auth.env`, 0600): NODE_ENV, APP_ORIGIN, AUTH_DATABASE_URL,
BETTER_AUTH_SECRET, INTERNAL_AUTH_SECRET, AUTH_BIND_HOST, AUTH_PORT, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS_MODE,
REGISTRATION_MODE, AUTH_INVITE_VERIFIES_EMAIL, AUTH_PASSKEYS. SMTP is STARTTLS or implicit TLS, never disable certificate
validation. Missing SMTP disables signup/verification/recovery delivery; existing verified logins may work.

`AUTH_INVITE_VERIFIES_EMAIL` (`true`|`false`, default `false`; owner decision 2026-11-18) only matters while
SMTP is NOT configured. When `true`, an invite-only password sign-up whose `X-Noti-Invitation` token passes
Rust's `/internal/invitations/check` for that exact email creates the account with emailVerified set, sends no
mail, and the user then signs in with the password (sign-up itself issues no session). What it trusts: that
the operator handed the invitation file directly to the person who owns that email (see operator.md), so
possession of the token stands in for a verification link. It does not skip the invitation check, does not
redeem the invitation (redemption stays an explicit signed-in step) and grants no membership or role. With
SMTP configured the flag is ignored and the normal verification email applies; with the flag off and no SMTP,
sign-up stays 503 `email` unavailable. Password reset and account deletion still require working mail.
`configured.password` is identity plus (SMTP or this flag). `AUTH_PASSKEYS` (`true`|`false`, default `false`; owner
decision 2026-11-19: password-only sign-in for the pilot) gates passkeys: when not `true`, `configured.passkey` is false,
the capability reports `disabled/not_configured`, every `/api/auth/passkey/*` route answers 404 and the UI shows no
passkey option. Stored passkey rows are kept. When `true`, passkeys (`configured.passkey`) need only identity:
the WebAuthn relying party is derived from `APP_ORIGIN` (rpID `localhost` in development, `noti.school` in
production, rpName `noti.school`, expected origin exactly `APP_ORIGIN`); no extra variable exists. The plugin does not
require user verification, so a passkey that only proves presence (a security key without a PIN) still signs in:
treat a passkey as a possession factor. Google requires both
credentials. No app secrets in VITE_* or PM2's inherited parent environment: coordinator starts PM2 commands
from a clean shell and audits actual per-process env isolation. Node's env-file does not override inherited
values, so stale parent vars must be removed before start/reload.

Node 24.18.0, pnpm 10.29.2, Rust 1.94.0 toolchain are pinned. `pnpm install --frozen-lockfile` then
`pnpm check` checks foundation only. `pnpm setup:check` / `pnpm build` fail clearly until all three app manifests
exist. Later auth/web packages must provide build scripts and use workspace catalog; API worker asks
coordinator to add apps/api to Cargo members and regenerate lock. Production artifacts: native
`bin/noti-school-api`, `apps/auth/dist/server.js`, `apps/web/dist/` inside immutable release SHA.

PM2 template runs only noti-school-api and noti-school-auth in fork mode. Native Rust has interpreter=none;
Node uses its restricted env file. Rust serves only Vite's dist assets with unknown /api and /internal
paths rejected before SPA fallback. Uploads stay outside static root. Vite dev/preview never production.
Both processes bind exactly 127.0.0.1:3810/3811. Implement SIGTERM/SIGINT graceful shutdown <=15s.
No readiness/health/start success is claimed without the apps. Candidate health commands after approved
start: `curl --fail http://127.0.0.1:3810/healthz`, `/readyz`, `/api/v1/capabilities`, plus auth's `/healthz`
on port 3811. Coordinator resolves the EXISTING daemon's actual CLI, then uses `start ... --only
noti-school-api,noti-school-auth`; never restart all, install a daemon or save an unaudited process inventory.

`pnpm infra:check` validates declaration fields and invokes local cloudflared candidate ingress validation
and rule matching. Candidate is NOT the host's complete tunnel configuration. Only merge the two hostname
rules into the existing config after local security/health checks and DNS ownership decisions. Preserve
all unrelated rules and the original final catch-all. Internal session path matches Rust, not auth; Rust
must 404 it publicly and only permit its own internal invite routes with bearer authentication. Candidate
validation cannot prove the later app's routing/security behavior. noti.school DNS/TLS is unverified.

The logrotate template caps individual rotated files when run by the existing host rotation lifecycle;
`size 10M` is not an instantaneous disk quota. Coordinator must verify scheduling/frequency and available
disk alerts. No PM2 plugin, daemon, provisioning, DNS, tunnel changes or production starts are executed.
