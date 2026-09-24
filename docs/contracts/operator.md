# Explicit operator actions

These commands are never run at boot. They neither create databases/roles nor contact providers or mail servers. The operator reviews a dedicated target and supplies private JSON inputs outside Git. There are no bundled active rates or real recipient files.

All commands require `NOTI_OPERATOR_ACK=dedicated-noti-school`. Tests additionally set `NOTI_TEST_ACK=disposable-noti-school`, enforcing test-only targets. Database URLs must pass the existing loopback/name/role guard. Product runtime work requires `DATABASE_URL` plus `NOTI_MIGRATION_URL`: the latter connection only reads the immutable provisioning marker, because runtime roles deliberately lack that permission. Runtime connection identity/target must match. No grants are broadened.

## Bootstrap

Run `pnpm operator bootstrap /private/bootstrap.json` with `DATABASE_URL` (role `noti_school_api`), its matching `NOTI_MIGRATION_URL`, and the application's dedicated `INTERNAL_AUTH_SECRET` used by Rust's invitation email HMAC. Do not borrow another service's secret.

Input is strict `{email,role,output,expires_hours?}`. Role is explicitly `admin` or `student`, without a default. Expiry is 1–168 hours, default 24. Output is an absolute caller-selected path outside the checkout; its parent must exist. Parent symlinks are resolved before checking the checkout boundary. Exclusive creation prevents overwriting an existing file or following a destination symlink. Mode is 0600. File sync precedes database commit; failures roll back and remove the new file. Stdout contains only institution/invitation IDs, never token/email.

The command creates HCMIU with coverage `none` if absent, preserving an existing institution's coverage. It writes a SHA256 token hash and lowercased email HMAC. Invitation material appears only in the private output file. Distribution is a separate coordinator action; no delivery is claimed.

Rust's frozen invitation contract requires a current admin issuer. Each operator-issued invitation therefore has a random `operator:<uuid>` membership principal. It is not an identity account and cannot sign in. No real student is granted membership until authenticated email-bound redemption. This deliberate bootstrap bridge needs coordinator review; expired invitations and unused operator principals are removed by retention. Do not revoke this principal before redemption unless intentionally revoking its invitation.

## Prices

Run `pnpm operator prices /private/reviewed-prices.json` with `NOTI_MIGRATION_URL` and `NOTI_PRICING_ACK=reviewed-dated-prices` in addition to the operator acknowledgement. Runtime roles cannot insert or alter prices.

Input is an array of 1–100 strict rows: `id`, `provider` (`openai|jev`), `model`, `component`, `units` (exactly `micro_usd_per_million_units`), integer `micro_usd_per_million_units`, RFC3339 `effective_at`/`valid_until`, and an HTTPS `source_url` without credentials. End must follow start; provider and component must agree. IDs must be unique. The operator must verify the source's date, component semantics and conservative units before acknowledging. Validation cannot prove the commercial rate itself.

Rows append in one transaction. Duplicate IDs fail instead of upserting. The existing immutable database trigger rejects updates/deletes, including by the migration role. Importing reviewed currently effective prices makes them eligible to existing dispatch code, so this is an explicit activation action. Implementation tests import only expired synthetic prices into the dedicated test database. No active rates ship in the repository.

## Retention

Run `pnpm operator retention /private/retention.json` with product URLs above plus `AUTH_DATABASE_URL` and `NOTI_AUTH_MIGRATION_URL` for matching auth runtime/guard roles on the same target. Input is strict `{days?,limit?}`: default 30 days and 100 records per table; 30–3650 days and 1–1000 records. Both targets are checked before deletion. Transactions are separate and safely rerunnable; a later failure does not undo an earlier completed service slice.

Product retention deletes old conversation roots (cascading answers/citations/feedback), old standalone feedback, and invitations expired beyond the retention interval. It removes orphan operator principals. An expired terminal idempotency root is deleted only if it has no pipeline stage, no reservation of any state, and no unfinished ingestion job. A completed enqueue response does not mean indexing finished: queued, running, failed and disabled jobs retain their roots even without a paid stage, regardless of expiry or retry count. Only `succeeded` jobs are finished for retention. An unrelated operation's uncertain charge does not block ordinary retention.

Terminal operational metadata is pseudonymized when **both root creation and replay expiry are older than 13 calendar months**, the root is `completed` or `failed`, no associated job is unfinished, and no root-level or stage-level reservation is `reserved`, `dispatched` or `uncertain`. The schema has no terminal-transition timestamp; using the later of creation and expiry conservatively preserves recently extended recovery windows. `days` does not shorten this fixed 13-month threshold. The runtime performs these changes without new grants or migrations:

| Surface | Scrubbed | Retained / reason |
| --- | --- | --- |
| `idempotency_keys` | `user_id` becomes `retained:<operation_id>` (distinct per operation); `request_sha256` becomes 64 zeroes; `response` becomes `{}` | Institution, key UUID, operation UUID, terminal state, creation and expiry preserve the operational record and fence identity. The original account-scoped replay lookup ends after pseudonymization. |
| `pipeline_stages` | `result` becomes NULL; `input_sha256` becomes 64 zeroes | Stage ID, root ID, stage name and creation time retain dispatch/reconciliation joins and uniqueness fences. |
| `ai_reservations`, `ai_months`, `ai_prices` | Nothing | Reservation/operation IDs, attempts, dated price plans, reserved/actual amounts, charge states and aggregate month totals are necessary non-personal financial receipts. Existing runtime grants intentionally forbid direct mutation. |
| Unfinished jobs, pending roots, unresolved money | Exempt from terminal scrubbing | Preserve recovery and reconciliation evidence. Operators must review these exemptions; retention never releases funds or claims that time alone resolves a charge. |

Schedule this explicit command **daily** after coordinator approval; scheduling/deployment is not installed by the repair. Default each run is 100 roots and, independently, 100 stage rows; maximum is 1000 of each. A root with more stages stays eligible until its remaining cache/hash rows are scrubbed, so repeat bounded invocations to drain a backlog. Reported `pseudonymized` and `stages` counts measure changed rows; rerunning a drained slice returns zero. Monitor overdue eligible rows and exemptions rather than claiming an instantaneous blanket deletion at 13 months. Non-personal financial receipts and fence identities remain beyond that date; their eventual archival is outside this command.

The budget advisory lock serializes retention with charge transitions. Five-second statement and two-second lock limits bound execution. Row selections use materialized CTEs with locking and `SKIP LOCKED` so the batch cannot be rescanned into extra rows; independently locked roots/stages wait for a later run. Conversation descendant counts can exceed the root limit, and a statement timeout rolls back the product transaction. Auth runtime independently deletes bounded expired sessions and verification records. Active identities, institutions, sources and source content are not purged by this command.

## Rehearsal

The identity/operator suite uses `noti_school_test_identity2` at `127.0.0.1:54390`; retention uses separate marked `noti_school_test_retention`. The coordinator provisions these targets with all four product migrations; identity also needs the auth migration. Run `NOTI_TEST_ACK=disposable-noti-school flock -w 60 /home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/locks/services.lock pnpm test:integration`. Tests execute real Better Auth HTTP/PostgreSQL operations as `noti_school_auth`, setup/retention as `noti_school_api`, and append synthetic expired prices and accounting fixtures as the migration role. Existing rows are protected with a separate locking transaction while the exact operator uses `SKIP LOCKED`; pre-existing or newly created unresolved charges are never reset. Repeated tests append their own synthetic receipts. Tests cover disabled/no-stage recovery roots, old settled versus young/pending/uncertain/dispatched operations, bounded stage/root batches, idempotence and advisory-lock timeout. Cleanup HTTP, Google transport and mail are injected mocks. This does not verify Rust cleanup, real invitation redemption, providers, delivery or production.
