# Services and Configuration Checklist

These are the confirmed initial choices. No live application credentials have been read or configured by this bootstrap.

## What the Owner Supplies

| Item | Required values | Purpose |
| --- | --- | --- |
| OpenAI | OPENAI_API_KEY; available chat model | Answers, embeddings and optional official-domain discovery |
| TypeSafe AI | TYPESAFE_API_KEY | Jev passage/evidence decisions |
| Google OAuth web application | GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET | Google sign-in |
| Existing SMTP | Path to the existing HomeLab mail configuration, or host/port/TLS/sender and locally stored credentials | Verification, invitations and password reset; may remain disabled until configured |
| Deployment | /home/inu/projects/noti-school; existing PM2 and Cloudflare Tunnel; DNS ownership/access for the selected hostname | Approved HomeLab rollout after verification; no main merge implied |
| Pilot corpus | Approved HCMIU documents/URLs and a human approval owner | Evidence collection and benchmark |

Use permission-restricted local secret files outside release checkouts. Do not paste keys/passwords into chat or attach them to issues. Only confirm that they are configured and identify their local location when needed. The Google client ID and service host/port are configuration, not secret keys; still avoid publishing unnecessary operational details. API keys may be added after installation: missing keys must not block a safe application boot or return fabricated answers. Keep paid calls disabled, expose unavailable capability states, and fail closed on dependent operations.

## Generated During Setup

- A high-entropy Better Auth application secret (at least 32 characters), stored only server-side.
- Dedicated PostgreSQL database and role passwords; DATABASE_URL for Rust and AUTH_DATABASE_URL for identity.
- Internal service URLs, storage paths, development port, migration configuration and fixed request limits.

Better Auth is a self-hosted library here, not a separate paid identity provider. Using its TypeScript service does not introduce Next.js or SSR. The Rust API remains the product backend.

## Google Callback Contract

Planned local development origin: http://localhost:3000.

- Development callback: http://localhost:3000/api/auth/callback/google
- Production callback, only when that origin is deployed: https://noti.school/api/auth/callback/google

Register the exact callback for the actual running origin. Add approved pilot users to the OAuth consent configuration when required. Request only sign-in scopes, not Gmail, Drive or unrelated account access. Application invitation checks remain separate from Google login.

## Email Details

Confirm whether the SMTP service expects STARTTLS (commonly port 587), implicit TLS (commonly port 465), or an explicitly approved trusted local relay. Never disable certificate verification to make delivery work. Use a sender address the owner is authorized to send from; domain authentication and delivery tests are release checks, not assumptions.

The owner identified the Financial tab in the HomeLab dashboard. Its invoice UI stores SMTP fields in browser local storage and passes them to a server-side Nodemailer sender. This is the intended existing provider, not the separate financial portal. Reuse the authorized host/port/TLS/sender settings, but store noti.school's credentials server-side; do not reproduce browser-side password storage or read unrelated financial records. SMTP remains disabled until credentials have been installed securely. No new paid mail provider is needed.

Until mail delivery is verified, public password signup/recovery is not ready. Development mail uses a local test sink and is clearly distinguished from real delivery.

## Budget

The owner approved USD 50/month combined application AI usage. Paid live calls remain disabled until credentials, pricing and budget reservations are configured. Tests must be mocked by default. Start the live smoke suite with a small separately bounded allowance, not the whole monthly budget.

## Not Needed Initially

No Pinecone, Qdrant Cloud, Neo4j Aura, Supabase/Clerk, hosted object store, external analytics service, payment processor or separate paid search account. PostgreSQL covers the initial vector and graph storage; files remain in a private HomeLab volume. This reduces providers, not the need for backups and security.

## Documentation

Integration setup commands are documented in [operator commands](contracts/operator.md). Bootstrap
creates coverage-none HCMIU and an email-bound, explicitly chosen invitation role; private output does
not imply mail delivery. Prices require a separate reviewed-rate acknowledgement. Retention uses actual
runtime grants and leaves uncertain budget/audit records intact. None runs automatically during boot.

Identity's authenticated internal capabilities endpoint reports configured Google/mail and core/mail
failures. Account deletion requires email confirmation plus successful Rust cleanup before identity
removal. These cross-service changes are locally tested with synthetic PostgreSQL identities and mocked
cleanup/mail; real SMTP delivery, OAuth credentials and Rust cleanup remain release checks.

- [Better Auth installation](https://better-auth.com/docs/installation)
- [Google provider](https://better-auth.com/docs/authentication/google)
- [TypeSafe HTTP API](https://docs.typesafe.ai/api)
- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search)
