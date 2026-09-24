# noti.school identity service

Implemented for NOTI-3 against foundation `18a023ceba2a51af12d17760af26019ca466ae36`.
Independent audit and live integration are pending. Node 24.18.0 / pnpm 10.29.2,
Better Auth 1.7.6, PostgreSQL core `auth` schema, no plugins or additional fields.

## Run locally

From the repository root, with the pinned Node/pnpm on PATH:

```sh
pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile
pnpm --dir apps/auth typecheck
pnpm --dir apps/auth test
pnpm --dir apps/auth build
pnpm --dir apps/auth start
```

The workspace root `pnpm-lock.yaml` is the installation contract. The worker's temporary scoped lock is
retained outside the repository as integration evidence, not as a second install path. Added exact dependencies:
Nodemailer 10.0.10 and `@types/nodemailer` 8.0.2 (npm registry checked 2026-09-25).

`test` builds first, then runs local memory-adapter, provider-boundary and mail-transport tests. It also
temporarily starts the compiled Node service on 127.0.0.1:3811 with an explicitly empty credential
environment, then stops it. The test refuses an occupied port. A temporary loopback SMTP peer tests
STARTTLS rejection before credentials are sent. No external database, Google or SMTP connections are
made. Test fixtures are synthetic and use `example.invalid` addresses.

`build` emits `dist/server.js` and the compiled shared environment module. The entry uses the workspace
`@noti/contracts` package; retain installed workspace dependencies and packages/contracts in the release.
`start` runs compiled Node code, never a dev server. For approved production execution use
`NODE_ENV=production APP_ORIGIN=https://noti.school`, or the existing PM2 declaration with restricted env.
`NOTI_ENV_FILE` is loaded only when explicitly supplied. Node env-file precedence preserves inherited
values, so the coordinator must start from a clean environment. No populated env file is included.

## Identity boundary

- Production origin is exactly `https://noti.school`; development/test exactly `http://localhost:3000`.
  Extra Better Auth origin/telemetry environment overrides are rejected. Cookies are HttpOnly,
  SameSite=Lax, host-only, and Secure in production. Built-in CSRF/origin checks remain enabled in tests.
- Native Better Auth routes live below `/api/auth`; the public surface is explicitly limited to the
  requested sign-in/signup/recovery/session functions and supported email-confirmed deletion.
  Account linking and email changes are not exposed. Deletion calls Rust's internal cleanup first;
  missing cleanup fails closed. The integrated Rust transaction remains a coordinator release gate.
- `POST /internal/session`: Host `127.0.0.1:3811`, exact internal bearer, empty body, original Cookie.
  Bearer comparison uses fixed-size SHA256 digests and `timingSafeEqual`. Only Cookie is passed to
  `auth.api.getSession`, with cookie cache and refresh disabled. Each call checks DB-backed identity,
  user/session association, verified email and expiry; response is the frozen four-field Session.
  Revocation is checked on every call; user headers do not establish identity. No token/email/roles
  appear in this response. Failure is 401 or dependency failure 503; responses are no-store.
- Limits: 16 KiB headers/body, 8 KiB URL, 100 connections, bounded request/header/socket timeouts,
  48 active public requests and a separate 16 active internal requests. Route/method, header, CSRF,
  body size and JSON-object checks precede public flow quota consumption. Internal authenticated paths
  each allow 600/min. Public paths each allow 120/min per verified user or signed anonymous admission;
  email login allows 10/min, signup/reset-request/verification-resend 5/min. Those four email paths also
  enforce a normalized target-email quota, so rotating anonymous cookies does not bypass password or
  mail abuse limits. A user's other sessions share their account quota. Callback, reset-token links,
  session reads and unrelated paths have separate buckets; reset-token URL variations share one bucket.
  Each quota table has at most 4096 entries, expires entries after 60 seconds and rejects new keys when
  full. Anonymous and verified-user maps are separate. Better Auth's peer-IP limiter is replaced by
  these `createService` limits; the raw library handler must never be exposed outside this boundary.
- Anonymous admission uses a server-random ID, HMAC signature and ten-minute expiry in a host-only,
  HttpOnly, SameSite=Lax cookie scoped to `/api/auth` (Secure in production). New issuance is globally
  capped at 120/min; valid existing admissions and verified sessions bypass that issuance bucket.
  The process-local signing key rotates on restart. The cookie grants no account or tenant access;
  Better Auth still validates callback state, tokens and sessions. Forwarded IP headers are stripped
  at the listener and are never used to establish quota identity. The loopback peer is not a student ID.
- Remaining anonymous/distributed limits: attackers can exhaust **new admission issuance**, target an
  email's login/recovery quota, churn issued cookies within the issuance ceiling, or saturate shared
  connections/concurrency/CPU. A first-time or expired-cookie browser may therefore receive 429/503.
  Process-local quotas reset on restart and are not coordinated across replicas; signed admissions
  are not proof of a unique human. Trusted ingress identity, edge rate limits and distributed admission
  remain coordinator release work. The regression proves quota isolation for existing verified sessions
  and admitted callbacks, not immunity to connection floods or fairness for unadmitted anonymous users.
- `/healthz` is process liveness; `/readyz` checks the DB and returns unavailable without core config,
  degraded with core config. Config presence does not claim successful provider/mail operation.
  Missing core configuration permits liveness but rejects protected work. SIGTERM/SIGINT close the
  listener, mail work and pool within 12 seconds. No raw request, token, DB error or mail credentials log.

## Browser invitation flow

The frozen native Better Auth JSON shapes are retained. The coordinator/web worker must use the
`X-Noti-Invitation` header (1..256 characters) when starting an invited signup. This is an opaque token,
not a role/institution assertion. It must not be retained in URL history, analytics or logs.

1. Password: `POST /api/auth/sign-up/email`, native `{email,password,name,callbackURL?}` plus
   `X-Noti-Invitation`. Same-origin Origin is mandatory. The before hook and user-create hook call
   Rust `/internal/invitations/check` with the email/token. Passwords require 12..128 characters.
   SMTP must be configured. Verification does not automatically establish a session; sign in afterward.
2. Google: native `POST /api/auth/sign-in/social` with `{provider:"google",callbackURL,...}` and the
   invitation header for new users. The server stores the pending token with a five-minute expiry using
   `addOAuthServerContext`; Better Auth stores OAuth state in its existing verification table and binds
   it to a signed browser cookie. No token is sent in the Google URL. The callback's user-create hook
   reads only validated server context, requires Google's verified email and checks the Rust invitation.
   Existing Google accounts may sign in without an invite. ID-token shortcuts and arbitrary scopes,
   login hints, additionalData, role and institution assertions are rejected. Email matching never links
   a password account to Google automatically.
3. After verified sign-in, `POST /api/auth/invitations/redeem` with `{token}` and `X-Noti-CSRF: 1`.
   Auth derives user ID/email from the current session, then calls frozen Rust redemption. Rust owns
   atomic token consumption, email HMAC, expiry, institution and role. Existing verified users can
   redeem another invitation. Check never consumes; identity creation alone gives no product membership.

There is no frozen invitation creation/sending endpoint. A server-side invitation mail template exists,
but no public sender/admin grant route is invented. Coordinator provisioning must issue approved tokens.
The integration addendum now freezes internal capabilities and cleanup. The guarded operator bootstrap
creates invitation material in a private file; it does not send mail or grant a real account membership.

## Mail and replay

SMTP credentials stay server-side. STARTTLS is required in `starttls` mode; `implicit` uses TLS from
connect. Certificates are verified with TLS >=1.2. The configured `SMTP_FROM` is the fixed sender.
Mail links and callback URLs must remain on the approved application origin. Network timeouts and an
absolute eight-second delivery deadline bound sends and destroy the owned TCP socket; transport errors open a process-local mail failure
circuit until restart. Accepted SMTP delivery is still not proof of inbox delivery or DNS authentication.

Better Auth 1.7.6 catches mail callback errors internally. Request-local AsyncLocalStorage tracks
verification-send failure so signup returns 503 after that failure. It holds no user/role context.
An identity can remain unverified after a failed send; it has no membership and cannot pass introspection.
Recovery/resend use the library endpoints and uniform, non-delivery-confirming responses; ordinary
known/unknown-account paths have an 8.5-second response floor. Disabled/failure circuits are visible as
unavailable instead of claiming mail is queued. No durable mail queue is claimed.

The library's password reset consumes tokens atomically and revokes sessions. Its email JWT verification
is additionally gated by an atomic single-use hash marker in the existing verification table. OAuth
callbacks likewise consume a separate marker after checking the signed state cookie, closing the
library state read/delete replay window. All markers expire. NOTI-6 rehearses real PostgreSQL verification,
reset, session expiration/revocation and deletion concurrency using the non-owner auth runtime role.

`POST /internal/capabilities` has the same exact Host/bearer and empty-body checks as introspection.
It returns strict identity/Google/email capability states, including database and mail-circuit failure.
Supported deletion sends a UI confirmation link; the browser consumes the token without storage and
confirms through native POST. `beforeDelete` calls strict internal Rust cleanup via an injectable client.
Cleanup failure leaves identity intact but consumes the confirmation token; request a new confirmation.
An identity failure after cleanup requires an idempotent cleanup retry and must not restore product access.
Better Auth catches the deletion mail callback exception, so the request-local after hook restores 503.
See [lifecycle contract](../../docs/contracts/api.md) and [operator retention](../../docs/contracts/operator.md).

## Verification and remaining work

Local tests exercise actual installed Better Auth handlers/types/core schema, memory-backed session
creation/revocation, password and mocked Google signup, no-email linking, state tamper/replay/expiry,
email/reset concurrent replay, bearer/CSRF/header/body limits, disabled/failing mail and Google, SMTP
configuration/timeout, and compiled limited-mode startup/shutdown. Separate NOTI-6 integration tests verify
the actual PostgreSQL identity runtime on the dedicated database. They do not verify
Google credentials/JWKS/token exchange, SMTP TLS handshake/deliverability, Rust's real invitation
transaction/role checks, ingress isolation or production readiness. Required independent audits remain
coordinator-owned. See root `.fleet-handoff.json` and `docs/scratch/auth-task-ledger.md`.

Primary API verification: [Better Auth hooks](https://better-auth.com/docs/concepts/hooks),
[OAuth server context](https://better-auth.com/docs/concepts/oauth),
[email/password](https://better-auth.com/docs/authentication/email-password),
[Google](https://better-auth.com/docs/authentication/google),
[session management](https://better-auth.com/docs/concepts/session-management),
[database hooks/schema](https://better-auth.com/docs/concepts/database),
[Nodemailer SMTP](https://nodemailer.com/smtp). Installed 1.7.6 source was authoritative for mail
exception handling, `consumeVerificationValue`, OAuth state and the adapter schema.
