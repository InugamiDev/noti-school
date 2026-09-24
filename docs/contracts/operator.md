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

Product retention deletes old conversation roots (cascading answers/citations/feedback), old standalone feedback, and invitations expired beyond the retention interval. It removes orphan operator principals. It never changes prices, budget months, reservations or charge states. Pending idempotency fences and roots referenced by pipeline stages are retained as operational audit records. Other expired terminal fences are deleted only when no reservation is reserved/dispatched/uncertain. The Rust worker clears expired stage-result caches, and account deletion separately removes personal ownership links. Unresolved charges require operator reconciliation, never automatic release. The budget advisory lock prevents races with charge transitions. Five-second statement and two-second lock limits bound execution; conversation descendant counts can exceed the root limit, and timeout rolls back that transaction.

Auth runtime deletes bounded expired sessions and verification records. Active identities, institutions, sources and audit/budget records are not purged. The operational ledger's longer retention requires a separately reviewed audit archival policy; it is not deleted by this command.

## Rehearsal

The identity/operator suite uses `noti_school_test_identity2` at `127.0.0.1:54390`. The coordinator's combined-schema retention regression uses a separate marked `noti_school_test_retention` database on the same disposable cluster, with no unresolved reservations so the deletion branch is actually exercised. Provision those dedicated databases and apply all four product migrations first; the identity database also needs the auth migration. Then run `NOTI_TEST_ACK=disposable-noti-school pnpm test:integration`. Tests execute real Better Auth PostgreSQL operations as `noti_school_auth`, setup/retention as `noti_school_api`, and append synthetic expired prices as the migration role. Cleanup HTTP and mail are injected mocks. This does not verify Rust cleanup, real invitation redemption, providers, delivery or production.
