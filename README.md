# noti.school

Answers students can trace. A connection universities can rebuild.

noti.school is an evidence-grounded university knowledge assistant in development. Students will ask about regulations, handbooks, courses, forms and procedures. Its planned answer pipeline retrieves approved institutional evidence, checks it with Jev, and uses OpenAI to compose a cited answer. A bounded knowledge graph connects related documents and institutional entities without replacing source evidence.

For universities: **Reconnect with your students.**

For students: **Your university questions, answered with sources.**

## Current State

The application includes an animated SolidJS/Three.js landing and student/admin interface, Better Auth identity service, and a Rust evidence pipeline: document extraction/indexing, hybrid retrieval, approved graph expansion, Jev evidence and claim checks, and OpenAI cited answers. Account setup, history, feedback, guarded migrations and a persistent budget ledger are implemented. Optional OpenAI web discovery is not implemented and remains visibly disabled; administrators can propose and fetch allowed official URLs for review.

Coordinator reruns pass 19 identity tests, two PostgreSQL identity/operator scenarios, one comprehensive PostgreSQL evidence-pipeline scenario, and 13 motion/browser tests. Provider and email fixtures are synthetic. Combined-schema checks and three independent reviews are pending on this snapshot. Live providers, approved HCMIU coverage, human-labeled bilingual quality, and production release gates remain unverified. Nothing is publicly deployed.

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
| Deployment | Existing HomeLab PM2 daemon and Cloudflare Tunnel; same-origin routing |
| Initial AI budget | USD 50/month combined application usage |

No Next.js, SSR, separate vector database, separate graph database, managed auth provider, or paid search provider is required for this pilot. Those are scope decisions, not performance claims.

## Build Contract

- [Product specification](docs/product-spec.md)
- [Architecture and trust boundaries](docs/architecture.md)
- [Services and secrets checklist](docs/services.md)
- [HomeLab deployment contract](docs/deployment.md)
- [Acceptance criteria and evaluation](docs/acceptance.md)
- [Implementation roadmap](docs/roadmap.md)
- [Primary technical sources](docs/references.md)

Only placeholders belong in [.env.example](.env.example). Real credentials, private uploads, user data and the academic proposal are not repository content.

## Foundation checks

Prerequisites: Node 24.18.0 and pnpm 10.29.2. Install with `pnpm install --frozen-lockfile --ignore-scripts`, then run `pnpm check`. This runs strict TypeScript, generated-schema drift checks and deterministic tests without providers or databases. `pnpm env:check` reports safe disabled configuration; `pnpm infra:check` additionally requires cloudflared and validates only the candidate configuration.

Read the [frozen service contracts](docs/contracts/README.md) before implementing an app. Use `pnpm run setup:check` for the manifest check, then `pnpm build` with Rust 1.94.0 available. Never use `pnpm setup`, which is pnpm's global shell-setup command. The root pnpm lock is the single workspace installation contract. Per-service checks are documented in `apps/api`, `apps/auth` and `apps/web`.

Database provisioning/migration, PM2 starts and tunnel changes are separate coordinator actions. The [database contract](docs/contracts/database.md) supplies guarded migration and disposable-test paths; no existing database is used by default. See `docs/scratch` and each service README for verification boundaries and remaining work.

## Licensing

No open-source license has been selected. Public distribution is not authorized by this repository bootstrap.
