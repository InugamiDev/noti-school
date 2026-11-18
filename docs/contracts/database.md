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
   Better Auth generates/applies its own core user/session/account/verification tables plus the passkey
   plugin's `passkey` table; no invented DDL.
   Frozen schema configuration (owner decision 2026-11-18): built-in PostgreSQL adapter, email/password and
   the official `@better-auth/passkey` 1.7.6 plugin, no other plugins, no additional fields or custom table
   names. The service and `scripts/auth-migrate.ts` both take these options from `apps/auth/src/schema.ts`
   (`schemaOptions`), and an auth test asserts the runtime schema equals it. Auth worker must preserve this
   schema shape. Changes require shared-owner migration review and a disposable DB rehearsal. No automatic
   migrations on service boot. The passkey table (rehearsed on PostgreSQL 16.15, 2026-11-18) holds `id`,
   `name`, `publicKey`, `userId` (FK to `user`, ON DELETE CASCADE, indexed), `credentialID` (indexed, not
   unique by the library's choice), `counter`, `deviceType`, `backedUp`, `transports`, `createdAt`, `aaguid`.
   The migration is additive on an existing core schema and idempotent on re-run; the runtime role receives
   the same SELECT/INSERT/UPDATE/DELETE grant as on the core tables. Deleting a user removes their passkeys.
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
No rates ship enabled; paid calls remain disabled by default. For default `EVIDENCE_PROVIDER=openai`,
the coordinator supplies an OpenAI key, exact configured `OPENAI_CHAT_MODEL` and three reviewed rates
whose dated validity windows cover dispatch: that chat model's `input_tokens` and `output_tokens`,
plus `text-embedding-3-small`'s `embedding_tokens`. Explicit `EVIDENCE_PROVIDER=jev`, or any configured Jev key (confidence scoring and discovery),
additionally requires the TypeSafe/Jev key, the pinned `JEV_MODEL` (`jev-1.14.0` default or `jev-1.13.0`) and its
two current dated rates, `jev_input_tokens` and `jev_output_tokens` (operator `prices` import; Jev rows must
name a pinned model; USD 0.042 per million input tokens and free output per docs.typesafe.ai/models, consulted
2026-11-18, to be re-reviewed before import). Missing selected-provider configuration or prices fails
closed; selected-provider failure never triggers automatic fallback. Unpriced components fail closed. Record
cached tokens conservatively at uncached rate unless independently priced. Never overwrite a used price;
insert a new ID. Retain old prices for reconciliation and audit.

API assembles a complete conservative dispatch plan from bounded input/output tokens, every allowed tool
invocation and its content-token charge, embedding batch size and, only in Jev mode, Jev request/input/output limits. If any
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
For a matching recoverable stage, the API holds root/stage ownership locks followed by the global accounting lock. It may atomically release a proven never-dispatched prior-month `reserved` receipt and reserve a new current-month attempt using current dated prices. Already safely `released` receipts also permit a new attempt; all historical receipts remain, with the existing maximum of three attempts. A failed replacement reservation rolls back the release, preserving funds. Same-month reserved recovery keeps the original receipt and exact plan. Dispatched, uncertain and settled-without-result stage/root receipts remain fenced; no automatic paid request is retried. Settlement takes ownership locks before the accounting lock to match recovery and avoid inverted lock ordering.
Late settlement is charged to the reservation month; coordinator reconciles provider billing attribution
before clearing cross-month uncertainty. `product.reconcile_ai(id, actual_micro_usd, reason)` (0006,
owner/migrator only, no HTTP route) settles one `dispatched`/`uncertain` reservation to an operator
amount in `[0, reserved]`, charging the reservation month and recording an immutable
`product.ai_reconciliations` row. Migration 0005 removes runtime DELETE on evidence, graph, job, answer
and citation tables (conversation-cascade deletes still run as owner), adds BEFORE DELETE fences on
versions/chunks/edges, expires invitations on membership revocation, and keeps a hashed
`product.deleted_identities` tombstone indefinitely so redemption cannot recreate a deleted user. Pure estimate tests are not proof of SQL concurrency correctness.

## Migration 0007: web evidence, confidence, ontology and personal spaces

- `institutions.kind` (`school`|`personal`, immutable), `owner_user_id` (required exactly for personal, one
  personal space per user via a partial unique index), `domains text[]` (`product.valid_domains`: at most 20
  distinct lowercase ASCII/punycode hostnames, no IP literals) and coverage `web_discovery`.
- `sources.origin` (`approved`|`web`, immutable). Web captures are web-origin sources whose versions stay
  `draft` (superseded captures become `archived`); chunks, citations and graph FKs work unchanged.
- `web_documents`: per-institution page cache keyed by `(institution_id,url)` with final URL, normalized
  `url_key`/`final_url_key` (indexed; blocking and cache lookup compare these), domain, title, language,
  `fetched_at`, `stale_after = fetched_at + interval '168 hours'` (checked; absolute hours, never a calendar
  '7 days' that follows the session TimeZone across DST), sha256, ETag, Last-Modified, state
  `fresh|stale|failed`, blocked flag/actor/time, internal web `source_id` and `promoted_source_id`.
- `web_searches`: per-institution search cache by normalized parameter hash; params exclude the raw query
  text; the worker deletes rows older than 30 days (the only runtime DELETE grant added).
- `web_usage`: global UTC-day counters for TinyFish search/fetch self-limits; `web_space_usage`: the same
  counters per institution (`TINYFISH_DAILY_*_LIMIT_PER_SPACE`), charged in one transaction with the global row.
- `evidence_scores`: Jev components (school, source, relevance, answers, injection, overall; numeric(4,3)) and
  model per `(institution_id,chunk_id,question_sha256,model)`; stores a hash, never question text.
- `graph_entities` kinds add `deadline|fee|topic`, with a unique `(institution_id,kind,lower(label))` dedupe
  index. Before the index is created, existing case duplicates are merged into the oldest entity of each group
  (no creation timestamp exists, so oldest = earliest inserting transaction, `age(xmin)` descending, then id):
  `graph_edges` are repointed (never deleted, so status, approver and evidence chunk stay), then the duplicate
  entity rows are removed through a transient view (provisioning revokes TEMPORARY); `graph_edges.confidence numeric(4,3)` nullable; `ontology_jobs` queue (one job per version, rooted
  in an idempotency key so its paid stages use the normal reservation fences).
- `citations` gain `confidence jsonb`, `retrieved_at` and `domain` snapshots.
- Runtime grants: SELECT/INSERT/UPDATE on the new tables (plus DELETE on `web_searches`). `web_documents` and
  `evidence_scores` carry the `retained_evidence` BEFORE DELETE trigger like other evidence.
No row-level security is added; tenant scope remains enforced by API queries and tested with the runtime role.
