# Integration Addendum

Coordinator-owned interface decisions for the next implementation pass. This document is a specification,
not a claim these routes already exist. Preserve v1 fields and paths unless explicitly extended here.
New shared Zod/JSON schemas and endpoint manifest entries have one integration owner.

## Identity and Account Lifecycle

- `POST /internal/capabilities` on identity port 3811: empty body, exact loopback Host and the existing
  internal bearer. Return strict `{identity: Capability, google: Capability, email: Capability}` using
  existing enums. `available/ready` means configured and ready to attempt, not externally verified.
  Core/database failure and the mail failure circuit must be reflected. No credentials or user data.
- Rust consumes this endpoint without redirects or proxies and conservatively handles timeout/malformed
  responses. Public capabilities must not hardcode Google/email as permanently unavailable.
- Native signup/social initiation accepts bounded `X-Noti-Invitation` on same-origin requests. Invitation
  tokens must not enter URL history, telemetry or persistent browser storage. Redeem remains unchanged.
- Enable Better Auth's supported email-confirmed account deletion flow only after product cleanup is
  wired. Use the installed library's token validation/replay behavior, never a client-supplied user ID.
  Identity's verified deletion hook calls `POST /internal/accounts/delete` on Rust port 3810 with strict
  `{user_id: string(min 1,max 256)}` and internal Host/bearer. Return `{deleted: true}` after an idempotent
  product transaction. Remove conversations, feedback and memberships; revoke outstanding invitations
  associated with the account. Preserve necessary budget/audit records without raw personal text.
  If product cleanup fails, do not claim deletion or delete identity. If identity deletion then fails,
  product access remains revoked and a retry is safe. Document this non-atomic two-service boundary.
- Expired personal records need an actual bounded retention command/job, not just a SELECT date filter.

## Product Extensions

- `GET /api/v1/institutions/{institution_id}/conversations`: member and owner-scoped, PageQuery;
  `ConversationPage` contains `{id, institution_id, created_at}`. No other student's titles or questions.
  Normal cursor rules apply. Frontend history loads this endpoint instead of only remembering tab IDs.
- Extend `VersionCreate` with optional `language: 'en'|'vi'`, default `en` for backward compatibility.
  Upload UI supplies it explicitly; immutable chunk language follows the submitted metadata.
- `POST /api/v1/institutions/{institution_id}/sources/{source_id}/fetch`: admin, CSRF and idempotency;
  VersionCreate JSON, 202 Job. Fetch only the source's saved HTTPS URL, with the same quarantining,
  checksum and review lifecycle as uploads. Initial approved *fetch hosts*, not approved corpus content:
  institution slug `hcmiu` -> exact `edusoftweb.hcmiu.edu.vn`. No wildcard or arbitrary subdomain.
  This does not authorize crawling, authenticated portals, student lists or automatic source approval.
- `POST /api/v1/institutions/{institution_id}/graph/entities`: admin; strict `{kind,label}` using existing
  GraphEntity kind and a 1..300-character label; 201 GraphEntity with server-generated IDs.
- `POST /api/v1/institutions/{institution_id}/graph/edges`: admin; strict
  `{from_entity_id,to_entity_id,relation,evidence_chunk_id}`, UUIDs and relation 1..100; 201 GraphEdge,
  initially candidate. All entities and evidence must belong to the current institution and be readable.
- `PATCH /api/v1/institutions/{institution_id}/graph/edges/{edge_id}`: admin;
  `{status:'approved'|'rejected'}`, 200 GraphEdge. Approval revalidates evidence and records approver.
  Graph listing uses a signed institution/role-bound ID cursor, an explicit exception to timestamp cursors.
  Ordinary retrieval expands only approved, current, valid, visible evidence with bounded hops/candidates.
- Optional `POST /api/v1/discovery`: SearchRequest, member, CSRF and Idempotency-Key;
  `DiscoveryPage` contains `{title:string,url:https,discovered_at:datetime}`, next_cursor null.
  Results are separately labeled unreviewed candidates, never answer evidence or silently approved.
  Only the institution's exact allowed hosts may be returned. Unknown web-search pricing fails closed.

## Pipeline and Operations

The next API owner may add only `migrations/0004_pipeline.sql` for durable per-stage paid-call identity
if needed. Existing migrations are immutable. One request may need embedding, Jev assessment, generation
and post-generation support checks; the current `(operation_id,attempt<=3)` reservation key must not be
misused as a three-stage ceiling or replayed across calls. Persist stage identity and bounded input hashes,
reserve the complete charge plan, commit exclusive dispatch before HTTP, reconcile exact usage, retain
uncertain charges and reject ambiguous retries. No live rates or credentials are shipped enabled.

The integration owner supplies guarded operator commands for institution/admin invitation bootstrap,
reviewed price-row installation and retention. They require explicit dedicated/test database guards and
confirmation, do not run during boot, and do not reuse other services' secrets. Issue invitation material
to a caller-selected private file, not Git, logs or chat. No real invitation or pricing activation occurs
during implementation; tests use clearly synthetic identities and rates on a dedicated database.
