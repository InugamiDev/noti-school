# NOTI-1 foundation ledger

Owner InugamiDev · campaign noti-school-pilot-20260925 · subordinate to current Mac coordinator.
Base d1c385e96f1c403dc630aacc6074b73b25dac646. One attempt, 25 minutes, no children/fallback.

- [x] Verify target HEAD/origin/clean tree and supplied policy MANIFEST.sha256.
- [x] Read target requirements, global/canonical policy and current snapshot; research primary APIs.
- [x] Freeze workspace, wire contracts, environment validation and synthetic fixtures.
- [x] Implement dedicated database migration guard, product schema and atomic budget routines (DB execution unrun).
- [x] Prepare PM2/tunnel declarations and deferred app entrypoints.
- [x] Run deterministic checks; record exact results, missing prerequisites and knowledge receipt.
- [x] Return scoped artifacts for coordinator review; no deployment or database changes.

Policy resolution: current ORDER/snapshot override stale Next.js, shared database, older-model,
delegation and harness-install defaults. No target CLAUDE.md or approved product memory supplied;
target requirements are sufficient. Independent review belongs to coordinator.

Verification: pnpm check (14 passing tests), pnpm infra:check (8 matched routes), pnpm env:check,
frozen pnpm install, TOML parsing and tracked/untracked whitespace checks pass. Cargo absent;
DB/provider/mail/integrated app tests unrun. setup:check/build intentionally exit 2 for absent apps;
db:test intentionally exits 1 before any connection without disposable authorization.

Incident: `pnpm setup` resolved to pnpm's built-in command and appended its PATH block to
/home/inu/.bashrc, violating write scope. The inserted block was removed with apply_patch and its
absence checked. No prior file hash existed to prove byte-identical restoration (a trailing blank line
may remain). Renamed project command to `pnpm setup:check`. Reported to coordinator; no concealment.
