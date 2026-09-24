# NOTI-6 task ledger

Base: `27ac5b877f760a8b1f38c8663881a77ace9f66b1`. Bounded worker; no children, deployment, providers or external mail. Only `noti_school_test_identity2` on loopback 54390.

## Journey brief and critique

Invited students register, confirm email, redeem institution access, ask questions, reopen persistent history, recover credentials and request email-confirmed deletion. Verified institution administrators submit language-tagged source versions or fetch saved URLs. Existing account, workspace and admin components own these steps. Drafts survive sign-in/navigation; secret tokens remain transient. Disabled capabilities and unavailable backend routes must be visible. Successful mocks do not prove delivery or retrieval. Deletion is a non-atomic two-service operation: product cleanup must succeed before identity removal.

Critique: callbacks may place tokens after a hash; mail callback exceptions may be swallowed; animations can leave a second composer keyboard-accessible; history needs owner-scoped pagination. Verify those boundaries using the real library and synthetic database, plus browser mocks.

## Implementation brief

Extend strict v1 schemas/manifest, add internal capabilities and injected cleanup client, enable supported confirmed deletion, supply explicit guarded operator commands, then connect existing UI controls. No scene/style/API/migration edits. Keep one lock and compiled identity entry.

- [x] Verify checkout, read common contract/specs and five hashed context inputs.
- [x] Shared schemas and endpoint manifest.
- [x] Identity capabilities, lifecycle and actual PostgreSQL tests.
- [x] Bootstrap, immutable prices and bounded retention with runtime tests.
- [x] Account/history/source/graph controls and relevant browser journeys.
- [x] Strict checks/builds, handoff and artifact hashes.

## Results and boundaries

Frozen install and setup manifest check pass. Root build passes (web, compiled auth, pinned Rust release); no API SQL runtime tests were run. Foundation/schema/type checks: 16 passed. Auth: 19 passed, including compiled startup/shutdown under the campaign service lock. PostgreSQL integration: 2 scenarios passed with strict typecheck, real runtime roles, synthetic mail and injected cleanup; scenarios include operator CLI private output, immutable expired synthetic prices, and bounded retention preserving uncertain charges/replay records. Web unit: 6 passed. Relevant mocked browser journeys: 12 passed. No scene/motion files or tests changed. Root lock is unchanged and remains the sole lock.

Resolved failures: runtime marker permission required a separate migration-role guard connection; browser hash-only navigation needed keyed callback consumption, query-aware route recognition and capability refresh. An intermediate TypeScript boolean/nullish grouping error was corrected. All affected suites subsequently passed. Existing Vite scene chunk-size warning remains; scene is another lane's scope.

No live providers, SMTP delivery, Google credentials, real Rust cleanup/redemption, production privileges, tunnel routing or independent audit verified. Operator invitation issuer uses a documented non-login principal because the frozen Rust contract requires a current admin issuer. Retention conservatively keeps terminal replay records while any charge is unresolved; personal cached responses can require later operator reconciliation. No production database, deployment, live service, push or merge was touched. Exact commands, loaded path hashes and final artifacts are in `.fleet-handoff.json`.

## Knowledge receipt

All five files in `/home/inu/.ultrathink/campaigns/noti-runner-20260925/context/MANIFEST.sha256` read and `sha256sum -c` passed. Canonical `/home/inu/ultrathink/AGENTS.md` and `CLAUDE.md` read; their older delegation/audit defaults are overridden by integration-wave-common v2 (no children; coordinator audits). Target `CLAUDE.md` and `.ckignore` absent; canonical privacy exclusions read. Relevant product specification, architecture, services, acceptance and addendum read. Full hashes will be recorded in `.fleet-handoff.json`.
