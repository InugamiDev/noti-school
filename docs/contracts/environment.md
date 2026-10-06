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
OPENAI_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, JEV_MODEL.
Auth restricted file (`shared/auth.env`, 0600): NODE_ENV, APP_ORIGIN, AUTH_DATABASE_URL,
BETTER_AUTH_SECRET, INTERNAL_AUTH_SECRET, AUTH_BIND_HOST, AUTH_PORT, GOOGLE_CLIENT_ID,
GOOGLE_CLIENT_SECRET, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS_MODE,
REGISTRATION_MODE. SMTP is STARTTLS or implicit TLS, never disable certificate validation. Missing SMTP
disables signup/verification/recovery delivery; existing verified logins may work. Google requires both
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
