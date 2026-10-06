# Acceptance and Evaluation

## Required Application Tests

- Fresh setup from documented prerequisites, deterministic migrations, health/readiness checks and clean shutdown.
- Existing PM2 daemon manages only the named noti.school processes; native Rust executable uses fork mode with no Node interpreter. Verify loopback binds, startup persistence, bounded logs and graceful restarts without interrupting unrelated services.
- Cloudflare ingress routes only the intended hostname/auth paths, leaves existing routes and the final catch-all intact, and cannot expose internal introspection, uploads or database endpoints. Validate ingress and prove the actual matched rule before rollout. Verify rollback to the previous release.
- Missing selected-provider/Google/SMTP settings permit a truthful limited boot, not insecure authentication or fake answers/delivery. Core database/authentication secrets remain mandatory for protected functionality. Readiness distinguishes failed core dependencies from intentionally disabled optional capabilities.
- Email/password verification, invitation redemption, Google callback, logout, expired/revoked session, reset-token replay and account-enumeration protection.
- Explicit student/admin role checks and institution isolation for list, search, upload, raw document access, citation access, feedback and background jobs.
- Upload size/MIME checks; parser failures; scanned-PDF no-text handling; duplicate checksums; version replacement; archived/expired document exclusion; failed indexing recovery.
- URL fetch denies private IPv4/IPv6, loopback, link-local, metadata endpoints, redirects into forbidden networks, oversized responses and invalid schemes. Validate at connection time, not only once before DNS can change.
- Hybrid ranking and graph expansion retain institution/source scope. Every graph edge and returned citation has a valid evidence source.
- Default OpenAI evidence checks require no Jev key or prices. Opt-in Jev integration contract tests include malformed replies, missing question IDs, NaN/out-of-range values, rate limits, timeouts and refusal to bypass the classifier on outage.
- OpenAI integration contract tests cover embeddings, answer/reference validation, streamed progress, interruption and provider failures. Never invent a live-provider pass when only mocks ran.
- Budget reservation remains correct under simultaneous requests, retries, ingestion batches and ambiguous timeouts. Crossing the cap prevents new paid calls.
- XSS tests for source text, model output, citation URLs and filenames. CSRF tests on all mutating APIs; no secret fields in frontend bundles/logs.
- Feedback access controls, retention/deletion and safe administrative review.
- Desktop/mobile screenshots, keyboard navigation, focus states, readable long Vietnamese text and reduced-motion behavior. All UI controls perform their stated action.

## Bilingual Grounding Dataset

Create a small, versioned set of real HCMIU questions after source approval. Include English and Vietnamese, exact policy facts, cross-document questions, ambiguous terminology, obsolete versions, contradictory evidence, unanswerable questions and prompt-injection passages. Human-label answerability and supporting passages. Keep development and held-out test questions separate.

Report retrieval Recall@k, citation support, citation completeness, factual correctness, unsupported-claim rate, abstention quality, latency and cost. Do not collapse these into a single confidence number. Report sample size and uncertainty; automated judges assist but do not substitute for human evidence checks.

Compare lexical/vector retrieval, hybrid retrieval, hybrid plus OpenAI reranking/checks, and the same pipeline plus bounded graph expansion; assess opt-in Jev separately on the same held-out set. Keep the graph only if it shows a useful measured benefit relative to cost/complexity. Evaluate language groups separately.

## Release Gates

The pilot is not complete until its clean-environment setup, core journeys, security tests, bilingual evaluation and independent reviews pass. Public SaaS additionally requires backup restoration, operational monitoring, abuse controls, privacy notice, authorized source coverage, SMTP deliverability, DNS/TLS, load testing and explicit release approval.

At every milestone label results as implemented, tested with mocks, tested live, reviewed, or not verified. No fabricated benchmarks or screenshots of a concept presented as working software.
