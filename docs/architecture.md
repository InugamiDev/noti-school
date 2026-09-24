# Architecture and Trust Boundaries

## Services

The proposed deployment uses one public origin and four private application components behind Caddy:

- Static SolidJS/Vite assets for the browser.
- Rust/Axum API and background ingestion worker for product data, retrieval and generation.
- Better Auth on Node.js/TypeScript for identity, sessions, Google OAuth and SMTP mail.
- PostgreSQL with pgvector, dedicated application/auth roles and migrations; private file volume for originals and extracted content.

Route /api/auth/* to the identity service and other /api/* paths to Rust. Do not expose databases or internal listeners publicly. The browser never receives AI keys or database credentials.

## Authentication and Authorization

Rust must validate each authenticated session with the Better Auth service through a fixed internal endpoint and the original session cookie; do not accept a user ID header or merely decode a cookie as proof of identity. Session validation failures fail closed. Mutating endpoints require same-origin CSRF protection and explicit authorization. Do not cache revoked privileges indefinitely.

Keep product institution memberships and roles under product ownership. A verified Google email is identity evidence, not administrator permission. Pilot registration is invitation-bound for both sign-in methods. Do not auto-link an unverified password account by matching its email. Password reset and verification endpoints must resist account enumeration, replay and brute force.

Use a dedicated database and least-privilege roles. Better Auth and product tables must not collide; prefer separate schemas/roles where supported. If PostgreSQL row policies are used, test them with the actual non-owner application role. Do not claim tenant isolation simply because an institution_id column exists.

## Evidence Pipeline

1. Validate source ownership, URL/domain, file limits and allowed document types. Reject private-network/loopback/cloud-metadata fetches, redirects escaping scope, excessive bodies and extraction bombs.
2. Extract with an existing PDF/text parser. Preserve document version, checksum, page and section boundaries. Quarantine unreadable scans; OCR is an explicit future capability unless an implementation is selected and tested.
3. Store page-preserving chunks and OpenAI embeddings. Keep embedding model/dimension metadata; a model change requires a deliberate reindex.
4. Retrieve lexical and vector candidates within the authorized institution/source filters. Fuse ranks, deduplicate and apply limits.
5. Expand through a small number of approved evidence-backed graph links. Graph entities include courses, procedures, regulations, offices, forms and programs. Extracted relations are candidates until approved; graph nodes are not sources of truth.
6. Ask Jev bounded structured questions about each retained passage. Pin the version and evaluate English/Vietnamese errors. Validate response types, numerical ranges and expected question IDs. Classifier results do not override access controls or factual checks.
7. Ask OpenAI for an answer with explicit claim-to-evidence references, only using retained authorized evidence. Validate references against supplied passage IDs. Unsupported claims, missing support or unresolved conflicts trigger retry within a small bound, qualification or abstention.
8. Return original source identifiers and locators, not model-invented URLs. Record model versions, retrieval/citation trace, token usage and feedback without logging secrets or unnecessary personal content.

During generation, the UI may stream progress. Do not present unvalidated claim text as verified while citation/evidence checks are still pending.

## Web Discovery

Use OpenAI Responses web search with official-domain restrictions for discovery, not as a substitute for curated evidence. Make the search invocation bounded and explicit in the cost ledger. Verify fetched URLs again at the application/network boundary; a search filter is not an SSRF defense. Keep external search provenance distinct from institution-approved source provenance.

## Budget and Failure Handling

The initial combined AI budget is USD 50 per calendar month in UTC. Include OpenAI generation, embeddings, search tools and Jev. Reserve a conservative maximum estimated cost transactionally before dispatch; serialize or lock against concurrent overspending, reconcile actual usage, and retain uncertain reservations after ambiguous timeouts. Retries consume budget and have fixed ceilings.

Use configurable, dated model/tool pricing. Fail closed on missing prices or credentials. An application ledger cannot prevent unrelated spending with the same credentials; dedicated project keys and provider-level controls are also needed. Provider budget dashboards may be alerts rather than hard caps, so do not promise an absolute billing guarantee.

If Jev is down, do not silently drop the agreed evidence check. Return a clear unavailable state or source-only search results. Provider 429/5xx responses use bounded retry/backoff and never create an infinite agent loop.
