# Architecture and Trust Boundaries

## Services

The proposed deployment uses one public origin through the existing HomeLab Cloudflare Tunnel. PM2 supervises the Rust and identity processes under /home/inu/projects/noti-school:

- Static SolidJS/Vite production assets served by Rust; Vite is a build/development tool, not the production server.
- Rust/Axum API and background ingestion worker for product data, retrieval and generation.
- Better Auth on Node.js/TypeScript for identity, sessions, Google OAuth and SMTP mail.
- PostgreSQL with pgvector, dedicated application/auth roles and migrations; private file volume for originals and extracted content.

The tunnel routes /api/auth and its descendants to the loopback identity listener, then all remaining requests for the application hostname to Rust. Rust serves /api/* product endpoints and static browser assets; unknown API paths must return API errors rather than the SPA HTML fallback. Internal session-introspection endpoints live outside the tunnel's allowed auth path. Do not expose databases, uploads or internal listeners directly. The browser never receives AI keys or database credentials. See docs/deployment.md for the routing, secrets and rollout contract.

## Authentication and Authorization

Rust must validate each authenticated session with the Better Auth service through a fixed internal endpoint and the original session cookie; do not accept a user ID header or merely decode a cookie as proof of identity. Session validation failures fail closed. Mutating endpoints require same-origin CSRF protection and explicit authorization. Do not cache revoked privileges indefinitely.

Keep product institution memberships and roles under product ownership. A verified Google email is identity evidence, not administrator permission. Pilot registration is invitation-bound for both sign-in methods. Do not auto-link an unverified password account by matching its email. Password reset and verification endpoints must resist account enumeration, replay and brute force.

Use a dedicated database and least-privilege roles. Better Auth and product tables must not collide; prefer separate schemas/roles where supported. If PostgreSQL row policies are used, test them with the actual non-owner application role. Do not claim tenant isolation simply because an institution_id column exists.

## Evidence Pipeline

1. Validate source ownership, URL/domain, file limits and allowed document types. Reject private-network/loopback/cloud-metadata fetches, redirects escaping scope, excessive bodies and extraction bombs.
2. Extract with an existing PDF/text parser. Preserve document version, checksum, page and section boundaries. Quarantine unreadable scans; OCR is an explicit future capability unless an implementation is selected and tested.
3. Store page-preserving chunks and OpenAI embeddings. Keep embedding model/dimension metadata; a model change requires a deliberate reindex.
4. Retrieve lexical and vector candidates within the authorized institution/source filters. Fuse ranks, deduplicate and apply limits.
5. Expand through a small number of evidence-backed graph links. Graph entities include courses, procedures, regulations, offices, forms, programs, deadlines, fees and topics. Extracted relations are candidates until approved (or auto-approved from approved sources at high Jev confidence); graph nodes are not sources of truth.
6. Retain at most 12 candidates including approved graph evidence, rerank capped excerpts with one strict OpenAI Responses call, then pack at most four full passages. EVIDENCE_PROVIDER=openai (default) uses typed sufficiency/conflict and claim-support verdicts; jev explicitly opts into pinned Jev with strict question-ID/probability validation. Model decisions never override access controls. Separate calls to the same provider are fallible and may share errors.
7. Ask OpenAI for an answer with explicit claim-to-evidence references, only using retained authorized evidence. Validate references against supplied passage IDs. A separate selected-provider support call must support every atomic claim using only its cited evidence. Unsupported claims, missing support, uncertainty or unresolved conflicts cause abstention; no automatic retry.
8. Return original source identifiers and locators, not model-invented URLs. Record model versions, retrieval/citation trace, token usage and feedback without logging secrets or unnecessary personal content.

During generation, the UI may stream progress. Do not present unvalidated claim text as verified while citation/evidence checks are still pending.

## Web Discovery

Owner decision of 18 November 2026 (supersedes OpenAI official-domain search). The web client sends `discover: true` by default whenever the discovery capability is available; the API honours it and runs discovery only when approved and cached evidence is insufficient. Discovery needs live mode, OpenAI, a TinyFish key, a Jev key with its dated prices and remaining budget. Otherwise the capability is disabled or unavailable with its reason, and an explicit discovery request returns 503.

- Search: TinyFish Search, first restricted to the institution's trusted domains (skipped when none), then open web (question plus institution name; personal spaces use the question only). Results are discovery hints, never evidence.
- Fetch: at most 6 URLs per ask in one TinyFish Fetch batch (`format: markdown`, `ttl: 0`, `per_url_timeout_ms: 20000`, 30 s client deadline, ETag replay for a single URL). Every final URL is re-validated in Rust: https only, no credentials or non-443 port, a DNS name (not an IP literal or local suffix) whose every resolved address is public. TinyFish fetching remotely is not an SSRF defense for us; this check keeps private hosts out of evidence.
- Evidence: a page becomes evidence only after chunking (markdown headings become section locators, page null), embedding (at most 40 chunks per ask) and Jev confidence scoring (at most 8 passages per ask). Web captures are stored as `origin = 'web'` sources whose versions stay `draft`: they are never institution-approved and never appear in the curated source library.
- Trust: a host matches an institution domain when equal to it or a dot-separated subdomain after IDNA/lowercase normalization. Matching hosts get full trust; other hosts are weighted by Jev's source answer.
- Cache: per institution (no page, search or score crosses tenants). Pages and searches are reused for exactly 168 hours (absolute time); the next use after that re-fetches. Changed content becomes a new version (identical chunks reuse embeddings); `not_modified` only refreshes the fetch time. Blocked pages are never used again, under any URL variant or redirect: URLs are compared by a normalized key (http/https equal, lowercase host, no default port, fragment, trailing slash or `utm_*`/`fbclid`/`gclid`) of both the requested and the final URL, checked before fetch, after fetch, before store and in retrieval. Admins can promote a page into the normal review flow (in a personal space: a private "Saved by you" source), force a refresh or block it.
- Limits: discovery has a 60 s sub-budget inside the 140 s work timeout. TinyFish 402 (allowance exhausted), 429, failures, the daily self-limits (`TINYFISH_DAILY_SEARCH_LIMIT`, `TINYFISH_DAILY_FETCH_LIMIT` globally and the `_PER_SPACE` share of each institution, counted in PostgreSQL) or the time budget end discovery quietly: the answer proceeds with existing evidence and abstains honestly. TinyFish calls are not retried.
- Personal spaces: each signed-in user may create one private institution (`kind = personal`) with the same pipeline. It never appears in the public institution list; other users get 404. Budget and feedback administration are school views and return 403 there.
- Ontology: after an approved version or web capture is indexed, a queued job extracts entities and relations (one strict OpenAI call per batch of up to six chunks, at most four batches) and Jev scores each relation. Extracted labels and relation names travel to Jev only as state data; the question instructions are fixed text that refers to them by index. Web captures are extracted only from passages Jev has scored, and never when any passage was flagged as injection. Approved-source relations at or above `GRAPH_AUTO_APPROVE` are approved; web-derived relations stay candidates and may seed one-hop expansion only at confidence >= 0.8 while their page is usable. The expanded passage must itself be approved current evidence.

Unverified: real TinyFish latency, allowance accounting and result quality; Jev calibration on HCMIU material; extraction quality. All tests use loopback mocks.

## Budget and Failure Handling

The initial combined AI budget is USD 50 per calendar month in UTC. Include OpenAI generation, embeddings, search tools and Jev. Reserve a conservative maximum estimated cost transactionally before dispatch; serialize or lock against concurrent overspending, reconcile actual usage, and retain uncertain reservations after ambiguous timeouts. Retries consume budget and have fixed ceilings.

Use configurable, dated model/tool pricing. Fail closed on missing prices or credentials. An application ledger cannot prevent unrelated spending with the same credentials; dedicated project keys and provider-level controls are also needed. Provider budget dashboards may be alerts rather than hard caps, so do not promise an absolute billing guarantee.

If a selected provider is unavailable, return a clear unavailable state or source-only search results. Selected Jev never falls back to OpenAI. Provider 429/5xx responses are not automatically retried. See [RAG pipeline](rag-pipeline.md) for bounds and accounting.
