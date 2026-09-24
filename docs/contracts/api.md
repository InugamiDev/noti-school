# API v1 and identity boundary

`endpoints.json` freezes method, path, request, response and scope. All product endpoints are under
`/api/v1`. `/healthz` is liveness (200 if process alive); `/readyz` returns Health with 503 for failed
DB/identity, 200 degraded when only optional providers are intentionally disabled. Capabilities return
200 even in limited mode and contain no secrets. See the integration addendum for extended contracts;
their presence in the manifest alone does not claim the Rust implementation has been integrated.

## Error and pagination behavior

`ApiError.error` contains stable `code`, safe `message`, UUID `request_id`, boolean `retryable` and
optional affected `capability`. HTTP mapping: invalid_request 400; unauthenticated 401; forbidden 403;
not_found 404; conflict 409; payload_too_large 413; unsupported_media 415; rate_limited 429;
provider_unavailable / pricing_unavailable / budget_exhausted / core_unavailable 503; internal_error 500.
Cross-institution IDs return 404. No SQL errors, credentials, stack traces or private excerpts in errors.
Retryable 503/429 may include `Retry-After`; clients cannot retry paid POSTs automatically.

Lists use `limit` default 20, max 100 and opaque base64url cursor max 1024 bytes. Sort ascending
`(created_at,id)` or `id` for institutions. Cursor payload is HMAC-authenticated with endpoint,
institution, requesting user, filters and last sort key. Invalid/tampered/mismatched cursor is 400.
Every page reapplies current authorization; a cursor is never authorization. No arbitrary SQL sort input.

## Same-origin and session verification

Browser uses relative paths with credentials. Production origin is exactly `https://noti.school`;
development is exactly `http://localhost:3000` with Vite proxying auth before other `/api` routes.
Auth worker uses Better Auth 1.7.6 Node handler (`better-auth/node`), basePath `/api/auth`, fixed
baseURL/trustedOrigins, secure HttpOnly SameSite=Lax cookies in production, no cross-domain cookies,
cookie cache disabled, verified email required, invite-only registration. Disable automatic account
linking by email. Google email verification never grants institution/admin membership.

Rust forwards only the original Cookie and an internal `Authorization: Bearer <INTERNAL_AUTH_SECRET>`
to fixed `POST http://127.0.0.1:3811/internal/session` with empty body. Timeout 2s, no redirects and no
retry. Auth constant-time checks the secret, queries Better Auth `auth.api.getSession` with cookie
caching disabled, checks expiry and email verification, and returns Session, 401 ApiError for invalid
sessions or 503 ApiError for failed core dependencies. It does not return cookie tokens, emails or roles.
`Cache-Control: no-store`; never cache validation/roles across requests. No user-ID header is trusted.
Rust loads active product.memberships per request and checks institution/role explicitly in parameterized
queries. Database/auth failures fail closed. Auth role has no access to product tables.

All custom mutating browser requests require exact Origin, reject cross-site Fetch Metadata and require
`X-Noti-CSRF: 1` (a non-simple custom header), with no cross-origin credentialed CORS. This includes
multipart upload, invitation redemption and deletion. Missing/null Origin is rejected. Better Auth keeps
its built-in origin/CSRF checks enabled; OAuth callbacks use its state/PKCE checks rather than requiring
the custom header on provider redirects. Never set skipCSRFCheck/disableOriginCheck. Auth process
rejects forged internal headers arriving at public `/api/auth`; internal routes never forward through it.

Invitation integration: custom public `POST /api/auth/invitations/redeem` accepts `{token:string}` after
verified session and CSRF validation. Auth calls Rust `POST /internal/invitations/redeem` with internal
bearer secret and `{token,user_id,email,email_verified:true}`. Rust atomically consumes a SHA256 token
hash once, matches invitation email HMAC (INTERNAL_AUTH_SECRET), expiry and unredeemed status, and
creates membership using the stored invitation role. Response Membership; no client role/institution
override. An auth before-create hook must call `POST /internal/invitations/check` with `{token,email}`
and internal bearer before either password or Google account creation; 200 `{valid:true}` or generic
403 ApiError. OAuth pending invitation must be in server-side state bound to the browser OAuth state,
not an unsigned callback parameter. Check is read-only; redemption rechecks inside a transaction.
Existing verified invitees may redeem another invitation. A created identity without redeemed membership
has zero product privileges. Authentication worker owns hook ordering, rate limits and replay tests.
Initial pilot invitations are provisioned by the coordinator through an audited product operation;
no invitation-sending/admin-membership endpoint is frozen in v1. Do not claim mail was queued without
an implemented durable queue and configured SMTP. Future invitation administration needs a contract update.
Rust's internal invitation router is accessible only with Host exactly `127.0.0.1:3810` AND the internal
bearer. The public Host router always returns 404 for `/internal/*` before SPA fallback. The tunnel
candidate fixes the Rust origin Host to `noti.school`; never trust X-Forwarded-Host for internal routing.
Test both direct public-Host requests and tunnel requests to prove this separation before release.

## Product authorization and lifecycle

Public: health, capabilities, institutions with truthful coverage only. All evidence, source files,
search, answers and feedback require an active membership. Admin operations require current admin
membership. Conversation/answer reads and deletes require owner, while admin feedback review exposes
only necessary answer/evidence context. Recheck permissions on jobs, graph traversal, citations and
raw downloads. Expired/archived sources are excluded from new search/generation. Historical citations
remain inspectable for an authorized viewer with the archived/expired status visibly labeled.

Upload: POST version endpoint is multipart with `metadata` JSON VersionCreate and one `file` (PDF or
UTF-8 text), max 20 MiB file, max 64 KiB metadata, parser content/MIME checks, max 500 PDF pages.
URL sources use an approved official-domain allowlist, HTTPS only, DNS + actual connected-IP validation,
private/loopback/link-local/metadata IPv4/IPv6 rejection at every redirect, max 3 redirects, 20 MiB body,
15s total fetch deadline. Fetch runs in Rust. SourceCreate URL requires original_url, other kinds omit it.
New version enters draft/quarantine; parser completion -> pending_review; explicit admin approval ->
approved; embedding job readiness is separate. Only current approved effective ready versions feed answers.
Approval switches current_version_id transactionally. Expected status mismatch returns 409.
Retry indexing is bounded and retains prior job diagnostics. Scans without text stay quarantined.

Ask returns one final validated Answer; progress streaming is deferred (no unvalidated token stream in v1).
`Idempotency-Key` UUID is mandatory on ask and ingestion enqueue; persist unique user/institution/key plus
request hash and final response in the same transaction as job/operation creation. Same key/different body
is 409, same in-flight key is 409, completed key replays the response; no second paid dispatch. Retain 24h.
Retain in-flight/uncertain keys beyond 24h until terminal reconciliation; expiry alone is not cleanup permission.
Conversation institution/owner is immutable. `discover=true` requires separately available discovery and
explicit user opt-in; discovery candidates never enter approved answer evidence without review.

Missing either OpenAI/Jev, unknown/stale pricing, exhausted budget or provider outage disables paid answers,
embedding/indexing and discovery. Return 503 with the affected capability, never mock text in live mode or
OpenAI classification replacing Jev. Lexical/source-only search may continue against approved indexed
records, explicitly indicating coverage; no inference pass is implied. Provider failures mark capabilities
unavailable; intentionally missing configuration marks disabled. Configuration presence is not health.

Provider dispatch: at most 3 total attempts, 30s request timeout (Jev 15s), bounded backoff 250ms/1000ms
plus jitter <=250ms; reserve every attempt including repair prompts and tool calls before dispatch.
Persist dispatched state before HTTP; cancellation, disconnect, malformed usage or ambiguous timeout
retains reservation. No retry on schema-invalid replies unless explicitly budgeted. Jev pinned version
`jev-1.13.0`; validate expected question IDs exactly and finite probabilities in [0,1]. Never send auth
secrets or treat retrieved instructions as authority. English and Vietnamese need separate live evaluation.

Default retention: conversations/answers/feedback 30 days; ordinary terminal idempotency records expire
after 24h, subject to recovery and financial-fence exemptions. After both creation and replay expiry
are older than 13 calendar months, bounded operator batches pseudonymize eligible terminal personal
metadata and clear stage content/hashes. Unfinished jobs and unresolved money remain exempt; financial
receipts and stable dispatch identifiers remain for reconciliation. See [operator commands](operator.md)
for exact eligibility, retained fields and the daily cadence, which is not yet deployed. Account deletion
revokes auth sessions, deletes product personal content and memberships; originals follow institution
retention, not student deletion. No raw chat logs.

## Integration extensions (v1 compatible)

`IdentityCapabilities` is returned by authenticated `POST /internal/capabilities`, empty body, identity
Host exactly `127.0.0.1:3811`. Core failures return unavailable states; configured mail/Google indicate
ready to attempt, not external verification. A failed mail circuit reports `provider_failed`.

Identity enables native Better Auth email-confirmed deletion. Initiation requires a session and working
mail. Confirmation uses native POST `/api/auth/delete-user` with the transient email token, never a user
ID supplied by the browser. Better Auth consumes the token and calls `beforeDelete`; identity then calls
fixed `POST http://127.0.0.1:3810/internal/accounts/delete`, strict `AccountDelete`, exact Host/bearer,
two-second timeout/no redirect, bounded strict `AccountDeleted` response. The public cleanup route stays
unavailable. Cleanup failure prevents identity deletion. The consumed token cannot retry: request a new
confirmation. Product cleanup followed by an identity failure is non-atomic; access must stay revoked
and Rust cleanup must be idempotent. This lane verifies that boundary with an injected cleanup mock,
not the Rust transaction. Mail exceptions swallowed by Better Auth are surfaced by a request-local hook.

Account callbacks use `/#/auth`; OAuth failures use `/#/auth/error`. Reset/deletion mail links carry
transient credentials in the fragment, which is not sent in HTTP requests. The browser synchronously
consumes query/hash callbacks and replaces the address before creating API resources or rendering
forms. It never persists tokens. Deletion requires an explicit confirmation POST; reset uses the
library's native token-consuming POST. Legacy native reset redirects remain accepted.

`ConversationPage` contains only owner-scoped IDs, institution IDs and creation times. History reads the
persistent list endpoint and uses normal cursors. `VersionCreate.language` defaults to `en` when omitted;
new upload/fetch controls explicitly submit `en|vi`. Saved-URL fetch returns a Job, never an approval.
Graph create/action and optional discovery schemas/paths follow the addendum. Admin controls create
entities and evidence-backed candidates, and approve/reject listed edges through those exact routes.
An empty listing is explicitly empty; missing backend integration renders unavailable. Discovery results remain
unreviewed; graph ID cursors are the documented institution/role-bound exception to timestamp cursors.

See [operator commands](operator.md) for the guarded setup, immutable price import and retention paths.
