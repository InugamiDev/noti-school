# Rust API implementation receipt

Status: **partial implementation, pending coordinator SQL integration and independent audit**.
No provider, mail, database, PM2, tunnel, or deployment changes were made. Nothing was committed or pushed.

The native binary binds `127.0.0.1:3810`. It loads only an explicitly selected, private
`NOTI_ENV_FILE`; it never loads `.env` implicitly. Without core configuration it serves
health, capabilities, an empty institution page, and a configured Vite `dist` directory.
Protected functionality fails closed. AI routes remain unavailable even with live mode selected.
No synthetic answers or approved corpus are seeded.

## Verification

Use the campaign's toolchain, with PATH prefixed by
`/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/cargo/bin`,
`RUSTUP_HOME=/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/rustup`,
`RUSTUP_AUTO_INSTALL=0`, `CARGO_HOME=$PWD/.cache/cargo`, and `CARGO_BUILD_JOBS=2`.

```sh
cargo fmt -p noti-school-api --check
cargo check -p noti-school-api
cargo test -p noti-school-api
cargo clippy -p noti-school-api --all-targets -- -D warnings
python3 tests/api/smoke.py
```

The Python smoke check requires `jsonschema`; it starts and stops only the built binary,
with an empty environment, on the fixed loopback port. The session HTTP fixture similarly
requires unused port 3811 and stops its server. Other provider mocks use ephemeral loopback ports.
All fixture identities and text are explicitly synthetic. Test outputs are adjacent `*-output.txt`.

**No PostgreSQL instance was used.** SQL queries compile as runtime SQLx queries, not offline
schema-checked macros. Tenant/owner SQL, invitation races, ingestion idempotency, lifecycle transactions,
budget reservation/mark/settlement and runtime-role grants require a coordinator-supplied isolated DB.
The tests do not substitute an in-memory repository or claim SQL concurrency coverage.

## Implemented handler surface

| Frozen route | Implementation / verification limit |
| --- | --- |
| GET `/healthz`, `/readyz` | Executable and JSON-schema tested; real DB/auth readiness unverified |
| GET `/api/v1/capabilities` | Truthful unavailable AI; no credentials loaded; auth capability propagation incomplete |
| GET `/api/v1/institutions` | SQL-derived approved coverage, signed ID cursor; empty when DB absent |
| GET `/api/v1/me` | Fixed introspection, no cache/redirect/retry, original Cookie + bearer; SQL memberships |
| POST `/internal/invitations/check`, `/redeem` | Exact Host + constant-time bearer; email HMAC; locked single-use redemption using stored role |
| GET/POST `/api/v1/institutions/{institution_id}/sources` | Scoped list/create; URL creation fails closed without an approved allowlist |
| GET `.../sources/{source_id}` | Scoped detail |
| GET/POST `.../sources/{source_id}/versions` | Version list; PDF/text multipart upload, private originals, checksum, chunks, idempotency and disabled job persisted |
| GET `.../versions/{version_id}`, `.../file` | Scoped version metadata and attachment download; storage key never in JSON |
| POST `.../versions/{version_id}/actions` | Approve/archive transaction; retry_index returns unavailable |
| GET `.../jobs/{job_id}` | Current admin membership required |
| GET `.../chunks/{chunk_id}` | Authorized historical chunks; archived/expired status retrieved through version endpoint |
| POST `/api/v1/search` | Current approved effective lexical-only evidence; no inference implied |
| POST `/api/v1/answers` | Validates request, membership, owner and idempotency-header syntax, then returns unavailable; generation is NOT implemented |
| GET `.../answers/{answer_id}`, `.../conversations/{conversation_id}/answers` | Owner-only persisted answers with evidence reauthorization; cannot create answers yet |
| GET `.../citations/{citation_id}` | Owner-only historical evidence |
| DELETE `.../conversations/{conversation_id}` | Owner-only SQL delete with database cascades |
| GET/POST `.../feedback`, PATCH `.../feedback/{feedback_id}` | Admin review / owner submission with evidence ownership checks |
| GET `.../budget` | Admin-only combined global ledger including outstanding prior-month reservations |

Unknown API/internal routes return JSON 404, including public Host requests with forged forwarded Host.
Public `/api/auth/*` and `/internal/session` are identity-service-owned, and are not implemented by Rust.

## Incomplete surfaces and integration prerequisites

- GET institution `graph` is not implemented. Vector candidate SQL and approved graph expansion are
  absent. Deterministic bounded RRF exists and is unit tested, but is not connected to lexical search.
- OpenAI generation, answer persistence, follow-up generation, Jev passage/claim orchestration,
  discovery, embedding updates and a bounded indexing queue/retry worker are absent. The answer route
  fails closed. `budget.rs` and `provider_http.rs` supply unconnected reservation-gated Jev/embedding
  building blocks, not a complete paid flow. No generation or discovery prices are guessed.
- Provider schema, usage, probability, ID and claim-support checks have local tests. The Jev HTTP
  interface has mocked success/rate-limit tests. OpenAI HTTP, full claim/evidence correspondence,
  budget dispatch failure/replay and ambiguous-spend integration remain unverified.
- `ssrf.rs` validates HTTPS, every redirect, DNS answers and the connected pinned address with no
  proxies. Pure URL/IP rejection tests pass; controlled TLS/DNS rebinding/redirect integration is absent.
  No official allowlist is supplied or invented, and fetching is not wired to source ingestion.
- PDF parsing uses pdf-extract 0.12.1 / lopdf 0.42.0 in a separate process under `/usr/bin/prlimit`:
  512 MiB address space, 5 CPU seconds, 7-second wall timeout, 500 pages, 20 MiB input,
  2 MiB extracted text and 4 MiB serialized output. At most two parser processes and eight requests.
  Scans/parser failures quarantine. The resource-limited synthetic PDF path passes; decompression-bomb,
  500-page boundary, malicious PDF, and multilingual extraction fixtures remain to be tested.
- UTF-8 text is bounded to 2 MiB; chunks use Unicode scalar offsets and at most 4000 characters.
  Current chunks default to `en`; language selection/Vietnamese ingestion is incomplete because the
  frozen version metadata carries no language. Do not claim bilingual retrieval readiness.
- Retention filters hide conversations older than 30 days, but a retention deletion scheduler and
  account-deletion/auth-session-revocation coordination are absent. Private orphan cleanup after failed
  transactions requires reconciliation; files are never served without their authorized database row.
- Google/email capability health has no frozen internal transport from auth to Rust. Both are
  conservatively unavailable; this is not a verified account/configuration diagnosis.
- Invitation creation/provisioning is coordinator-owned: no creation endpoint is frozen. Invitations
  require a still-active admin creator. Email normalization for HMAC is trim + Unicode lowercase.
- No automatic migrations. No database provisioning. No release build/load test or independent audit.

## Minimal shared decisions requested

1. Provide an isolated, marked test DB/runtime role for SQL and concurrency verification.
2. Define institution-scoped official-domain approval data/configuration and ingestion language metadata.
3. Define internal auth capability transport and product/account deletion coordination.
4. Graph pagination needs a frozen sort key: graph tables lack `created_at`, while the contract's ID-only
   exception currently names institutions only.

Primary interface sources checked: [Jev API](https://docs.typesafe.ai/api),
[pinned Jev model](https://docs.typesafe.ai/models),
[OpenAI embeddings](https://developers.openai.com/api/reference/resources/embeddings/methods/create),
[Axum](https://docs.rs/axum/0.8.9/axum/),
[reqwest retry disabling](https://docs.rs/reqwest/0.13.5/reqwest/retry/fn.never.html).
Dependency additions were checked against crates.io metadata and resolved into Cargo.lock.
