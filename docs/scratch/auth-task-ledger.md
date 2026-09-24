# NOTI-3 auth task ledger

## Goal

Implement the bounded Better Auth identity/mail service against foundation HEAD
18a023ceba2a51af12d17760af26019ca466ae36. No deployment, shared schema edits or acceptance claims.

## Tasks

- [x] Verify exact HEAD, clean initial worktree, origin and both supplied manifests.
- [x] Read global/canonical/target instructions, supplied policy packet and product/contracts.
- [x] Install frozen dependencies; inspect Better Auth 1.7.6 hooks/state/schema and official docs.
- [x] Implement fixed-origin service, session boundary, limits and graceful lifecycle.
- [x] Implement invitation-bound password/Google registration and verified redemption.
- [x] Implement bounded SMTP with disabled/failure behavior and library-backed recovery.
- [x] Run strict typecheck/build and meaningful local negative/flow tests.
- [x] Return knowledge receipt, exact verification, shared additions and unverified surfaces.

## Decisions

Use Better Auth database OAuth state and supported addOAuthServerContext/getOAuthState;
no custom schema/plugin or unsigned role/institution. OAuth state and email/reset replay
behavior require tests against installed source. Shared contracts have no invitation admin/send
endpoint; preparation will occur on sign-in hooks using a bounded invitation header and Rust check.
Current ORDER overrides legacy model/delegation defaults; no children. Target CLAUDE/.ckignore
and checked target/canonical MEMORY files are absent; no private memory accessed.

## Verification log

- git rev-parse HEAD: exact required SHA; git status --porcelain=v1: empty; origin matches ORDER.
- sha256sum -c MANIFEST.sha256 in orders and supplied context: all 4 and all 5 entries OK.
- Node v24.18.0; pnpm 10.29.2.
- pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile: exit 0.
- pnpm install --store-dir .cache/pnpm --ignore-scripts --lockfile-dir apps/auth: exit 0;
  repeat with --frozen-lockfile: exit 0. Root lock unchanged; scoped generated lock retained for integration.
- pnpm --dir apps/auth typecheck: exit 0 (actual installed Better Auth types, strict TS).
- pnpm --dir apps/auth build: exit 0; emits dist/server.js, no dev server.
- pnpm --dir apps/auth test: exit 0, 18 tests pass (includes build and compiled limited-mode Node startup/shutdown).
- pnpm check: exit 0, foundation typecheck/schema drift check/15 tests pass.
- git diff --check: exit 0. Port 3811 has no listener after tests.
- Initial failures fixed: TypeScript self-reference annotation/server option placement/provider profile type;
  fixture IP collisions with library rate-limit storage; swallowed verification-mail exception corrected
  with request-local failure tracking, tested returning 503.
- Live PostgreSQL, SMTP, OAuth, Rust invitation integration, deployment and independent audits NOT run.
- Real Nodemailer against a temporary synthetic loopback SMTP peer: STARTTLS unavailable fails before
  credentials are sent; listener stopped. SMTP socket ownership ensures deadline closes actual TCP work.
- pnpm run setup:check: exit 2, expected absent apps/api/Cargo.toml and apps/web/package.json in this isolated auth checkout.
- git diff --exit-code -- pnpm-lock.yaml package.json pnpm-workspace.yaml packages migrations infra: exit 0, shared files unchanged.
