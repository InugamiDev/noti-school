# Implementation Roadmap

## 1. Foundation

Freeze API/data contracts, versioning, auth/session boundary, environment validation and cost accounting. Establish workspace, pinned dependencies, test fixtures, migrations and private local deployment. This stage unblocks independent service work.

## 2. Vertical Slices

- Rust: source lifecycle, ingestion, retrieval, graph provenance, OpenAI/Jev adapters, grounded answer validation, feedback and cost enforcement.
- Identity: Better Auth, Google and email/password sign-in, invitations, SMTP verification/reset, session introspection and negative security tests.
- Browser: prompt-first landing, answer/citation reader, school/source navigation, account flow, document administration, feedback and usage states.

Each slice must run with mocked external services before live credentials are used. Do not add empty screens or fake success paths to claim completeness.

## 3. Integration and Evaluation

Integrate actual service contracts, exercise browser-to-API-to-database flows, run the English/Vietnamese grounding benchmark and inspect actual provider behavior under bounded live tests. Review correctness, security/tenant isolation and reproducibility independently. Repair and rerun failed gates.

## 4. HomeLab Pilot

Provision dedicated services, verify restore procedures, set operational alerts, configure SMTP/Google and invite a small pilot group. Public exposure remains a separate approval. The four-week plan is a target, not evidence of completion.

## 5. SaaS Readiness

Add institutions only with approved evidence and verified isolation. Complete privacy, abuse, availability, cost and support requirements before a worldwide release. Billing and broad integrations are not part of the initial pilot.
