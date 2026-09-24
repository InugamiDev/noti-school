# noti.school

Answers students can trace. A connection universities can rebuild.

noti.school is an evidence-grounded university knowledge assistant. Students ask about regulations, handbooks, courses, forms and procedures. The system retrieves approved institutional evidence, checks it with Jev, and uses OpenAI to compose a cited answer. A bounded knowledge graph connects related documents and institutional entities without replacing source evidence.

For universities: **Reconnect with your students.**

For students: **Your university questions, answered with sources.**

## Current State

Repository bootstrap and implementation specification. The application is not implemented or deployed yet. Do not treat this README, the proposal, or UI concepts as evidence of a working product.

The first pilot targets HCMIU and English/Vietnamese questions. Application services, files and PostgreSQL will run in HomeLab. OpenAI and TypeSafe's Jev remain external inference services. Worldwide SaaS access is a later release, gated on testing, privacy and operational readiness.

## Confirmed Stack

| Area | Choice |
| --- | --- |
| Product backend | Rust, Axum, Tokio, SQLx |
| Browser application | SolidJS, TypeScript, Vite; client-side only |
| Identity | Better Auth in a small TypeScript service; email/password and Google OAuth |
| Retrieval | PostgreSQL full-text search, pgvector, reciprocal-rank fusion |
| Knowledge graph | PostgreSQL entity/edge tables with evidence provenance |
| Generation and embeddings | OpenAI |
| Evidence classification | TypeSafe AI / Jev, required from the first live build |
| Email | Existing SMTP server |
| Files | Private local volume initially |
| Deployment | HomeLab containers behind Caddy, same-origin routing |
| Initial AI budget | USD 50/month combined application usage |

No Next.js, SSR, separate vector database, separate graph database, managed auth provider, or paid search provider is required for this pilot. Those are scope decisions, not performance claims.

## Build Contract

- [Product specification](docs/product-spec.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Services and secrets checklist](docs/services.md)
- [Acceptance criteria and evaluation](docs/acceptance.md)
- [Implementation roadmap](docs/roadmap.md)
- [Primary technical sources](docs/references.md)

Only placeholders belong in [.env.example](.env.example). Real credentials, private uploads, user data and the academic proposal are not repository content. Setup/build commands will be added with the executable implementation and verified before being advertised.

## Licensing

No open-source license has been selected. Public distribution is not authorized by this repository bootstrap.
