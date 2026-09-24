# Database ownership and money

Coordinator provisions a NEW `noti_school` PostgreSQL database with pgvector. The isolated rehearsal
used PostgreSQL 16.15 and the host's available vector 0.6.0; production extension state still requires
verification. `infra/provision.sql` is a review-only template, never invoked by setup/CI.
`noti_school_owner` is NOLOGIN; product and identity migration roles own only their schemas; runtime
roles are non-owners, non-superusers and have no CREATE. No unrelated project credentials are reused.
pg_hba role-specific reject rules must isolate these login roles from other databases because another
database may grant CONNECT to PUBLIC. This host policy is a coordinator provisioning prerequisite.

Application schema: `product`; Better Auth schema: `auth`; immutable provisioning marker: `noti_meta`.
Auth IDs are opaque text; product keeps no FK into Better Auth's private tables. Cross-institution FKs
bind versions, chunks, graph entities/edges, conversations, citations and feedback to their parents.
Every graph edge requires an evidence chunk, including candidates. Wire evidence may present this as a
one-element array. RLS is not enabled: API must test actual runtime-role tenant/owner filters.

Approved provisioning sequence:
1. Review names, roles, pg_hba isolation, backups and extension on the approved host. Create database,
   marker and schemas via the reviewed template, set unique role passwords using interactive `\password`.
2. Set `NOTI_MIGRATION_URL` for `noti_school_migrator` on loopback `noti_school`, and
   `NOTI_MIGRATION_ACK=dedicated-noti-school`; run `pnpm db:migrate`.
3. Set separate `NOTI_AUTH_MIGRATION_URL` for `noti_school_auth_migrator`; run `pnpm db:auth:migrate`.
   This invokes the **installed Better Auth 1.7.6** `getMigrations` API with `pg.Pool` and search_path=auth.
   Better Auth generates/applies its own core user/session/account/verification tables; no invented DDL.
   Frozen schema configuration: built-in PostgreSQL adapter, email/password, no plugins, no additional
   fields or custom table names. Auth worker must preserve this schema shape. Changes require shared-owner
   migration review and a disposable DB rehearsal. No automatic migrations on service boot.
4. Runtime receives only its own URL. Migration URLs/secrets never reach application processes.

The guard validates URL host, exact database prefix and role before connecting, then checks actual
database/user, nonprivileged role and immutable project/purpose marker before DDL. It rejects URL options
that could override identity/search_path. Product migrations run in one advisory-locked transaction with
SHA256 history; drift aborts. No database create/drop/reset command exists in application scripts.
Auth migration is separately advisory-locked and library-managed; do not claim a cross-service transaction.

Disposable test path: coordinator creates an EMPTY dedicated `noti_school_test_<suffix>` database on an
isolated local PostgreSQL instance with the same roles/schemas, vector extension and purpose=`test` marker.
Supply `NOTI_TEST_MIGRATION_URL`, `NOTI_TEST_API_URL`, `NOTI_TEST_ACK=disposable-noti-school`; run
`pnpm db:test`. It refuses `noti_school`, checks matching target identities and never creates/drops a DB.
No disposable database was supplied to foundation; execution is reported separately from static checks.

## Atomic cost protocol

Currency is integer micro-USD; global calendar UTC cap is 50,000,000. The shared ceiling is not per-tenant.
`ai_prices` holds versioned dated rate IDs (micro-USD per million units), source URL and validity window.
Explicit zero-rate components are allowed and must still appear in complete usage reconciliation;
missing prices remain invalid. A reservation must include at least one positive-cost component.
No rates ship enabled: the coordinator supplies reviewed OpenAI model/token/cache/tool/search content,
embedding and Jev input/output prices before live dispatch. Unpriced components fail closed. Record
cached tokens conservatively at uncached rate unless independently priced. Never overwrite a used price;
insert a new ID. Retain old prices for reconciliation and audit.

API assembles a complete conservative dispatch plan from bounded input/output tokens, every allowed tool
invocation and its content-token charge, embedding batch size, Jev request/input/output limits. If any
maximum or price is unknown, reject dispatch. The model cannot choose the cost plan. `reserve_ai` accepts
`[{price_id,units}]` with positive integer units; rounds each component up and atomically checks/reserves
under a global transaction advisory lock. `operation_id` and attempt (1..3) are unique; retry gets a new
reservation and attempt. A successful replay of a reservation is NOT dispatch permission.

After transaction COMMIT, call `mark_ai(id,'dispatched')` and COMMIT **before** HTTP. At most one caller
can make this transition. Confirm complete provider usage with `settle_ai(id,[{price_id,units}])` including
all plan components (zero allowed only when verified uncharged). Settlement is single-use and records
even unexpected overruns, preventing further spend if cap is exceeded. Pricing maxima are application
obligations; a ledger cannot stop unrelated use of provider credentials or guarantee provider billing.

Release is only `mark_ai(id,'released')` before dispatch. After uncertain transport/cancellation/malformed
usage, mark uncertain or leave dispatched; neither releases funds. No TTL releases. Operator reconciliation
requires authoritative usage or proof of no charge. Outstanding prior-month reservations also reduce
the current month's available cap. Dispatch across UTC rollover is rejected and must be re-reserved.
Late settlement is charged to the reservation month; coordinator reconciles provider billing attribution
before clearing cross-month uncertainty. Pure estimate tests are not proof of SQL concurrency correctness.
