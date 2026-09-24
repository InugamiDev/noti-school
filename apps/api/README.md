# Rust evidence pipeline receipt

Status: implemented and tested with synthetic PostgreSQL data and injected HTTP providers; pending integration and independent audit. No live AI, real identity, email, approved university corpus, deployment, push or merge was used. Root README release claims remain coordinator-owned.

## Executable behavior

- Configuration loads both provider keys and the selected OpenAI generation model. Live execution requires the existing explicit flags and valid reviewed prices. Missing configuration/prices fail closed. No price rows ship in migrations. Production provider hosts are fixed; test transport injection is compiled only into unit tests, which reject non-loopback provider requests.
- PDF/text uploads and official URL fetches create immutable checksummed versions with optional `en`/`vi` metadata, defaulting to `en`. Text preserves Unicode scalar offsets and line endings. Chunks are at most 2,000 characters / 8,000 bytes, with at most 512 chunks. Duplicate checksums are rejected before another original is written. PDF/HTML extraction uses resource-limited child processes; scans/parse failures quarantine.
- Fetch uses only the saved HTTPS URL. The frozen `hcmiu` allowlist is exactly `edusoftweb.hcmiu.edu.vn`. Every redirect (maximum three), every DNS address and the connected pinned IP are checked. No proxies or automatic retries. PDF is capped at 20 MiB; text/HTML at 2 MiB. Fetching never approves content or crawls links.
- One native worker indexes one chunk per tick. Row selection and a dedicated PostgreSQL session lock prevent concurrent dispatch. Committed embedding results support recovery after settlement without another HTTP call. Explicit `retry_index` resumes disabled/failed uploads within a three-failure limit and extends the indexing window by 24 hours. Ambiguous dispatches are never retried automatically.
- Approval changes only the selected version and the current-version pointer. It does not archive siblings. Archiving a historical version cannot clear another current version. Ordinary answer retrieval requires current, approved, ready, effective and visible sources. Historical reads preserve original versions while rechecking owner/membership/visibility.
- Answers embed the question, retrieve lexical/vector candidates (24 each), fuse ranks with RRF and retain three passages plus at most one approved one-hop graph expansion. Jev selects relevant evidence and detects conflicts. OpenAI Responses returns strict claims/UUIDs with no tools. A second Jev call checks each claim's actual text against only its cited passages, including numbers, conditions and contradictions. Unknown, unsupported or conflicting results abstain; Jev failure never bypasses checks.
- Answers and citations commit atomically. Identity is re-introspected after inference; membership and current source validity are locked before persistence. Completed idempotent replay reloads the persisted answer with current access checks. Conversations are owner-scoped, including for administrators. Follow-ups can be stored in the selected conversation; previous conversational text is not automatically reinjected into retrieval.
- Graph entity creation, candidate edges, approval/rejection and listing are wired. Institution FKs and approval-time evidence checks enforce provenance. Listing cursors are signed and bound to institution, requester and role.
- Capabilities consume the exact identity `/internal/capabilities` response through fixed loopback Host/bearer, without redirects/proxies/retries. Configured and priced services can report available, meaning ready to attempt rather than externally verified.
- Internal account cleanup removes conversations, feedback and memberships, revokes associated invitations and clears personal stage caches. Late provider replies settle money without restoring deleted text. Cleanup is idempotent. Identity deletion remains a separate transaction: if it fails after product cleanup, product access stays revoked and retry is safe. A bounded worker pass actually deletes up to 100 expired conversations.

## Money and interruption

`0004_pipeline.sql` adds durable child stage IDs under the root request, unique stage/input hashes, recoverable results, immutable version language and operational indexes. Existing migrations are unchanged. Each paid stage reserves the complete component plan and commits, then exclusively marks dispatch and commits before HTTP. Separate stage IDs avoid misusing `(root_operation, attempt<=3)` as a three-stage ceiling.

The existing global USD 50 UTC monthly ceiling and prior-month carry remain enforced in PostgreSQL. Zero-rate components remain in reservation and settlement plans. Cached OpenAI input is charged conservatively at the ordinary input rate. No tools are enabled, so generation cannot incur hidden search/tool charges.

No HTTP client retries automatically. Deadlines: embeddings 30 seconds, Jev 15 seconds, generation 45 seconds, complete answer 140 seconds, outer answer HTTP 150 seconds. Two pipeline slots bound concurrent answers. Requests are capped at 64 KiB and provider responses at 512 KiB. A disconnected caller does not cancel the bounded answer task. The existing 14-second shutdown drain may interrupt it: dispatched funds remain reserved and stale pending roots become failed on recovery. Failed/ambiguous idempotency keys return conflict instead of dispatching again.

Never release dispatched/uncertain charges because of timeout, cancellation, parse failure or cleanup. Reconciliation requires authoritative provider evidence. Index retries currently require the original uploading administrator; reassignment after that administrator is revoked/deleted needs coordinator design. Pre-dispatch orphan reservations and ambiguous stages require reconciliation, not automatic recreation. Private filesystem orphans from ambiguous storage/DB failures still require operator reconciliation and cannot be served without an authorized row.

## Verification

Use this environment for Rust commands:

```sh
export PATH=/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/cargo/bin:$PATH
export RUSTUP_HOME=/home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/toolchain/rustup
export RUSTUP_AUTO_INSTALL=0 CARGO_HOME=$PWD/.cache/cargo CARGO_BUILD_JOBS=2
cargo fmt -p noti-school-api --check
cargo check -p noti-school-api
flock /home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/locks/services.lock cargo test -p noti-school-api
flock /home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/locks/services.lock cargo test -p noti-school-api --lib -- --ignored --nocapture
cargo clippy -p noti-school-api --all-targets -- -D warnings
cargo build -p noti-school-api
flock /home/inu/.ultrathink/campaigns/noti-school-pilot-20260925/locks/services.lock python3 tests/api/smoke.py
```

The opt-in ignored test is hard-pinned to `noti_school_test_api2` on loopback 54390. It checks the actual database, runtime role and test marker. The dedicated migrator installs explicitly synthetic temporary prices; application journeys use `noti_school_api`. It never creates/drops databases or roles. Guarded product (four files) and Better Auth 1.7.6 migrations were run on this dedicated DB. Synthetic database rows remain test evidence; fixture servers are stopped and temporary files removed.

Coverage includes complete English/Vietnamese asks, unknown/unsupported/conflicting evidence, Jev outage, malformed embeddings, invented IDs, request/worker contention, settled-stage recovery, disconnected callers, cancelled stages, global budget contention, exclusive dispatch, free-component settlement, source/version/archive/history/visibility/institution/owner isolation, graph expansion/rejection, invitation contention, account cleanup/late settlement/retention, SSRF address/redirect denial, strict generation envelopes, native PDF/HTML extraction, executable schemas and graceful shutdown. Adjacent `*-output.txt` record commands; `tests/api/pipeline-wire.json` contains generated synthetic wire evidence consumed by smoke.

## Remaining boundaries

- Optional official-host OpenAI web discovery is **not implemented**. Discovery stays disabled and `discover:true` fails before paid calls. No search result enters approved evidence implicitly.
- Live credentials/model availability, real HCMIU retrieval and grounding, held-out bilingual evaluation, SMTP, Google, integrated NOTI-6 account deletion and independent audits remain unverified. Mock probabilities do not prove semantic accuracy.
- SSRF tests cover URL/IP/redirect denial and rejection of an actual connected loopback socket. Controlled public-TLS/DNS-rebinding integration was not run. Adversarial parser corpus/load tests, 500-page boundaries, backup/restore and release builds remain release work.
- Shared TS schemas and endpoint manifest extensions belong to NOTI-6. Language is persisted in SQL/chunks while the existing Version output remains unchanged. The new version-language column and indexes in 0004 require integration-owner review alongside the stage table.

Primary contracts checked: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings), [Jev API](https://docs.typesafe.ai/api), [Jev models](https://docs.typesafe.ai/models), [html2text 0.17.1](https://docs.rs/html2text/0.17.1/html2text/). Installed reqwest 0.13.5 retry source was inspected; every client explicitly disables retries.
