# Core repair ledger

Started 2026-09-24 23:21:27 UTC; hard stop 00:06:27 UTC (45 minutes).
Frozen source e7a18b9261c91665c312489d7231802ee23a91d3 verified; target repair-core.
Exact requested runtime gpt-6-astra/high, no children. Only noti_school_test_api2 authorized.
Policy packet five SHA256 checks passed. Target CLAUDE.md and .ckignore absent; canonical/global instructions read. Current ORDER overrides stale delegation/model defaults.

- [x] R2-01 prior approval on ordinary historical reads; runtime SQL negatives
- [x] R3-02/R3-05 finite packing and Unicode input validation before paid work
- [x] R2-05 complete provider/price admission gate
- [x] R1-02 recovery actor with unchanged stage/funds fences
- [x] R2-03 original cleanup before commit; ambiguous commit retention
- [x] R1-03 observed provider cooldown and explicit recovery
- [x] R3-06 chunk-relative locators
- [x] ChunkPage and FeedbackContext endpoints and negatives
- [x] SSRF 3fff::/20
- [x] fmt/check/test/clippy; actual SQL/runtime; smoke/schema
- [x] final receipts and handoff

All fixtures are synthetic; no live quality claim. No paid calls, deployment, schema edits or grant expansion.

## Finding-by-finding resolution

| Finding | Local resolution / evidence | Boundary |
|---|---|---|
| R2-01 | Frozen archive predicate reproduced via actual SQL; source list/detail, version list/detail, chunk, original, answer and citation routes deny never-approved archives. Student/admin, wrong-tenant and revoked-member tests pass. Existing approved archived citation tests still pass. | Runtime non-owner role; no production corpus. |
| R3-02 / R3-05 | Pure finite packing; shared 4,000-scalar/16,000-byte/control validator before paid work; actual max Vietnamese and non-BMP asks/search pass mocks. Invalid input has zero calls and no request root. Embedding reservation asserted at 16,000 token units. Full Jev envelope checked before reservation. | No live tokenization/provider acceptance claim. |
| R2-05 | Shared complete provider/five-price gate for capabilities, asks, indexing and retry admission. Actual missing/expired Jev prices at a controlled admission clock produce zero mock hits/reservations, with valid OpenAI price fixtures. Per-stage real-time expiry checks remain. | Only the admission clock is test-injected; immutable existing prices and funds were not altered. |
| R1-02 | Current admin recovers after uploader revocation/deletion using same root/stage IDs. Recovery actor/time recorded. Settled institution-owned vectors survive deletion/expiry and late settlement. Concurrent workers reuse cached stages or dispatch once. Dispatched/uncertain stages remain blocked after uploader deletion. | Missing roots and legacy already-scrubbed settled caches remain conflicts; no grant/schema expansion. |
| R1-01 dependency | API test deletes only its own charge-free synthetic root and verifies safe 409 with zero calls. | Root retention itself belongs to identity/ops; operator.ts untouched. |
| R2-03 | 513-chunk text rejected before file write; actual parser saturation and SQL-blocked cancellation remove original and leave no committed row. Valid quarantined originals retained. Guard disarms before COMMIT. | Ambiguous COMMIT is not fault-injected. Private orphans need separately approved reconciliation; documented 100-file/24-hour procedure is manual, not an implemented sweeper. |
| R1-03 | HTTP 503 -> unavailable capabilities -> 30-second cooldown blocks new operations -> explicit post-cooldown mock success clears failure. Existing failed-key conflict remains stable. | Process-local observations; test advances stored monotonic failure time, no paid probes. |
| R3-06 | New text, native same-page multi-chunk PDF, and actual HTML parser/SQL ingestion all have chunk-relative scalar spans. Vietnamese/non-BMP and span/text bounds pass. | Immutable old test rows are not upgraded. Fresh source IDs/reingestion or coordinator-owned migration needed for old data; no approved production data exists. |
| R3-04 / ChunkPage | Exact admin chunks endpoint, signed ordinal/ID pagination bound to institution/version/admin/requester/order. Pending/archived/quarantined and empty extraction tested. Student/guessed/wrong-tenant/revoked negatives pass. | Frozen schema/manifest unchanged. |
| R1-04 / FeedbackContext | Exact existing-report context endpoint, owner evidence restrictions retained, no broad admin answer access. Student/guessed IDs/other institution/revoked/hidden evidence/removed report negatives pass. | No-store and strict generated wire schema checks pass; no browser integration claim. |
| SSRF | Complete 3fff::/20 denied, including first/last addresses; adjacent 3fff:1000::1 remains outside that block. | IANA registry/RFC 9637 checked; no live DNS/TLS rebinding test. |

## Exact final verification

Environment for all Cargo commands:
`PATH=/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/cargo/bin:/usr/local/bin:/usr/bin:/bin`,
`RUSTUP_HOME=/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/rustup`,
`RUSTUP_AUTO_INSTALL=0`, `CARGO_HOME=$PWD/.cache/cargo`, `CARGO_BUILD_JOBS=2`.
Working directory is the exact repair-core target. All commands using 3810/3811 take the shared lock with a 60-second bound. No lock retries were needed.

| Command | Outcome / local evidence |
|---|---|
| `cargo fmt --all --check` | PASS; `.repair/final-fmt.log` |
| `cargo check --locked` | PASS; `.repair/final-check.log` |
| `flock -w 60 ../locks/services.lock cargo test --locked` | PASS: 5 API unit tests, 12 security tests; SQL scenario intentionally ignored here; `.repair/final-test.log` |
| `flock -w 60 ../locks/services.lock cargo test --locked runtime_sql_and_complete_pipeline -- --ignored --nocapture` | PASS: actual noti_school_api runtime role on noti_school_test_api2, all repair regressions plus original full scenario; `.repair/final-sql.log` |
| `cargo clippy --locked --all-targets -- -D warnings` | PASS; `.repair/final-clippy.log` |
| `cargo build --locked` | PASS debug binary; `.repair/final-build.log` |
| `flock -w 60 ../locks/services.lock python3 tests/api/smoke.py` | PASS: native HTML/Vietnamese extraction, both request boundaries, seven generated wire schemas including ChunkPage/FeedbackContext, ten route/error schemas, graceful SIGTERM; `.repair/final-smoke.log` |
| `git diff --check` | PASS |
| `ss -ltnp '( sport = :3810 or sport = :3811 )'` | No listeners after verification. Coordinator Postgres left running. |
| `psql postgresql://noti_school_api:synthetic-test-only@127.0.0.1:54390/noti_school_test_api2 -X -A -t -F '|' -c 'SELECT current_database(),current_user; SELECT name,sha256 FROM product.schema_migrations ORDER BY name'` | Runtime identity confirmed; migration-history SELECT denied as expected by runtime grants. No grants changed. |
| Same read-only query using `noti_school_migrator` and `-v ON_ERROR_STOP=1`, followed by Python exact count/name/SHA256 comparison against `migrations/*.sql` | PASS exactly four applied migration hashes match frozen files; `.repair/schema-migrator-receipt.txt`. No DDL executed. |

## Failures encountered and corrected

- First expanded SQL run failed at the existing budget contention fixture: its price query selected newly inserted future prices without validity filters (zero successful reservations vs expected nine). Added real-time validity filters to that test query; subsequent full SQL runs passed. No preexisting reservations were released or reset.
- First Clippy run rejected an unnecessary let-and-return after parser cleanup became RAII. Removed the binding; strict Clippy passed.
- First final smoke preflight mistook a stopped native test server's TIME_WAIT connection for an active listener. SO_REUSEADDR on the probe permits TIME_WAIT while still rejecting listening sockets; both Python and native-test preflights now use it. Subsequent smoke passed.
- The first ad-hoc migration-hash output checker omitted a row-count assertion and printed success despite denied history access. It was not accepted as evidence: reran a read-only migrator query and required exactly four names/checksums before recording the pass.

## Integration limits

No migrations, contracts, dependency locks, provider keys/config, identity code, operator.ts or deployment files changed. No push, merge, deployment, paid calls, SMTP, real identity, approved source content or live grounding evaluation. Generated `.repair/` logs/receipts and `apps/api/tests/api/.uploads-*` are local synthetic artifacts, not product source to publish. Independent reviews and identity/ops root-retention integration remain coordinator work.
