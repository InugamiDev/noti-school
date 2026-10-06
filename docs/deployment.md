# HomeLab Deployment Contract

Status: deployment not applied. Application manifests, guarded migration scripts and build entries exist. The owner approved PM2 plus the existing Cloudflare Tunnel, with API keys supplied later. This replaces the earlier Compose/Caddy proposal.

## Layout and Ownership

The confirmed deployment root is /home/inu/projects/noti-school, alongside the owner's other projects. Keep releases/<commit-sha> immutable after build, point current at the selected release, and keep shared data, restricted environment files and bounded logs outside release directories. Runtime secrets are not part of Git or worker snapshots. Use separate application and identity environment files so mail/OAuth credentials are not passed to Rust and AI keys are not passed to the identity service.

Build workers use campaign-isolated worktrees, not the live deployment directory. Install only reviewed artifacts whose source SHA is recorded. Keep the previous release for rollback. Database changes must be backward-compatible across that rollback window; never roll back destructively or reset a shared database.

## Processes and Routing

Use the owner's existing PM2 daemon. Do not install another daemon, change its shared systemd unit, restart all applications, or change unrelated process environments. Foundation implementation must supply a secret-free ecosystem declaration and verified build/start/health commands.

| Process | Responsibility | Proposed listener |
| --- | --- | --- |
| noti-school-api | Native Rust executable, product API, bounded ingestion, static Vite build | 127.0.0.1:3810 |
| noti-school-auth | Node/TypeScript Better Auth, mail, internal session validation | 127.0.0.1:3811 |

Both ports were unoccupied during inspection; recheck before starting. Rust runs as a native binary with interpreter disabled. Use fork mode and one instance initially. Set bounded restart delay/count, graceful shutdown deadlines and memory/log limits appropriate to the host. Load restricted environment files without putting secrets in command arguments, ecosystem files, frontend assets or logs.

Cloudflare ingress for the confirmed public hostname has this order:

1. Auth path ^/api/auth(/.*)?$ to the loopback identity listener.
2. All remaining requests for the hostname to the Rust listener.
3. Preserve all unrelated existing routes and the existing final catch-all.

Internal identity introspection must not live under /api/auth. The Rust SPA fallback must not turn unknown /api or internal routes into successful HTML responses. Private source files are served only through authorized application endpoints. Never serve the project root, shared directory or arbitrary filesystem paths.

Use the same origin for browser and authentication, correct secure cookies and fixed trusted origins. Trust proxy/client-IP headers only according to the verified tunnel boundary, not arbitrary client-supplied forwarding headers. Development uses Vite proxies for both API routes; production must not run the Vite dev or preview server.

## Existing Host Integration

Read-only inspection found the financial service online under the existing PM2 daemon. Its public ingress is in /etc/cloudflared/config.yml, used by cloudflared.service. Other cloudflared services also run on the host; do not modify or restart them.

The PM2 CLI used by the existing systemd unit currently resides in an npm execution cache, not the normal SSH PATH. Resolve the unit's actual executable at deployment time and use the same user's daemon. Do not silently install a competing PM2 version or repair global host configuration as part of this application rollout.

Only add the application's ingress rules after local health and security checks pass. Back up the active config with restricted permissions, preserve ownership, validate it using cloudflared, and verify the matched rule for auth, app and internal paths. Apply it through the existing service's supported lifecycle, with a short maintenance window if a restart is required. Verify existing routes afterward. Restore the previous config if validation or post-change checks fail.

The intended origin is https://noti.school. Verify DNS and Cloudflare account/zone access before writing records. DNS inspection on 25 September 2026 returned Porkbun nameservers, so attaching this hostname to the current tunnel is not yet verified. Do not move nameservers or replace unrelated DNS records automatically. Domain migration or a temporary alternative hostname requires an explicit owner decision.

## Credentials Later

The application must boot in a clearly limited mode without OpenAI or Jev keys. Paid calls remain disabled by default (`AI_MODE=disabled`, `AI_LIVE_CALLS_ENABLED=false`). Default `EVIDENCE_PROVIDER=openai` requires the OpenAI key, exact configured `OPENAI_CHAT_MODEL`, budget reservations and three current dated price components: `input_tokens` and `output_tokens` for that chat model, plus `embedding_tokens` for `text-embedding-3-small`. Only explicit `EVIDENCE_PROVIDER=jev` additionally requires the TypeSafe/Jev key, pinned Jev model and its two current dated rates (`jev_input_tokens`, `jev_output_tokens`). Keep paid generation, evidence checks, embedding/index jobs and paid discovery disabled until the selected mode is ready and live calls are explicitly authorized. Selected-provider failure is unavailable, with no automatic fallback or invented answers. Plain source browsing and retrieval may run only where approved, indexed evidence is genuinely available.

Google login remains unavailable until its OAuth client is configured. Password registration, invitations and recovery must not claim success while SMTP is unconfigured. Never bypass verified identity because mail is unavailable. Operational health and static public pages may remain available, but protected operations require working identity and database configuration.

The owner clarified that the SMTP source is the Financial tab in the HomeLab dashboard, not the separate financial portal. Source inspection confirms that the invoice form persists SMTP settings in browser local storage and submits them to Nodemailer on each send. Those settings are not an existing server environment file. Transfer authorized mail settings to restricted server-side configuration during setup; do not copy browser-side password persistence into this application. Do not reuse another service's session secret, payment credentials, database identity or OpenAI key. No SMTP password has been retrieved and no live email has been sent during inspection.

## Rollout Gates

Before rollout, install from the single root lock with `pnpm install --store-dir .cache/pnpm --ignore-scripts --frozen-lockfile`, run `pnpm run setup:check`, then `pnpm build` with pinned Rust available. Identity starts from `apps/auth/dist/server.js`; retain workspace dependencies and contracts in the release. See [operator commands](contracts/operator.md) for explicit bootstrap/pricing/retention actions. None creates databases or changes running services. Retention requires an approved scheduled invocation; no scheduler was installed by this worker.

The identity-only internal capability route must never pass through the public auth path. Rust cleanup remains protected by internal Host/bearer and must return 404 under public Host. The coordinator must test the integrated Rust cleanup transaction and the non-atomic identity failure/retry boundary before enabling public account deletion. No successful mock is evidence of tunnel isolation or live cleanup.

- Run application tests and three independent reviews against the frozen build SHA; preserve exact outputs and resolve blocking findings.
- Provision a dedicated database and least-privilege roles on the approved local PostgreSQL installation; verify pgvector, migrations and restore behavior without changing unrelated databases.
- Start only the two noti.school processes, verify local health, disabled-provider behavior, auth isolation, static assets and source permissions.
- Confirm hostname ownership/routing; validate the candidate tunnel config before applying it, then verify public TLS, routing and same-origin auth behavior.
- Check unrelated PM2 processes and tunnel routes after the change. Save startup state only after comparing the complete process inventory and ensuring it contains no temporary/test entries.
- Record deployed SHA, process names, health checks, backup/rollback paths and remaining disabled capabilities. Public reachability alone is not proof that the HCMIU pilot or global SaaS is complete.

## Primary Documentation

- [PM2 application declaration](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [PM2 non-Node runtimes](https://pm2.keymetrics.io/docs/usage/bun-deno/)
- [Cloudflare local tunnel configuration](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/)
