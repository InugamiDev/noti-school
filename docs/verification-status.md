# Verification Status

As of 25 September 2026. Tested and independently reviewed application source:
`b7732e60ef9f6bdb2854900ed6ad01ee52770eff` on `bootstrap/noti-school`.
This document records evidence, not release approval. No main merge or public deployment.

## Passing Evidence

- Integrated checks: 17 foundation checks, strict TypeScript/schema validation, 19 auth tests,
  seven identity/operator integration tests, 10 web unit tests and 53 browser tests.
- Rust formatting, build, clippy with warnings denied, unit/security tests, separately enabled
  PostgreSQL pipeline test and native HTTP smoke pass. External AI providers are loopback mocks.
- Actual Better Auth and Rust with synthetic PostgreSQL identities: signup, locally captured email
  verification, invitation redemption, login, source upload/approval/search/download, history,
  citations, feedback and confirmed account deletion/session revocation pass.
- Independent experience review repeats the strict web build, all 10 units and all 53 browser
  tests without failures, skips or flaky retries. Screenshots cover desktop, wide, short and mobile
  layouts; canvas/bitmap pixel checks verify motion, pause, reduced motion and lifecycle cleanup.
- Entry dolly, bounded ambient motion/parallax, immediate-request submit zoom and animated
  no-WebGL fallback are implemented. The user's Chrome ran the fallback with observed changing
  transforms and an exactly stable paused frame. Browser settings were not changed.

Headless WebGL checks use software rendering, not physical mobile GPU/FPS measurements. The lazy
Three.js chunk produces a non-failing size warning. Synthetic replies and valid citation syntax
do not establish factual correctness, source authenticity or real English/Vietnamese retrieval quality.

## Open Review Findings

All entries are P2/medium. None is silently waived by the passing test counts above.

| ID | Observed Issue | Required Regression |
| --- | --- | --- |
| R4-01 | Index recovery fences stage-linked unresolved charges but overlooks root-level dispatched/uncertain receipts. Reproduced with actual runtime SQL/router and no provider HTTP. | Both receipt shapes must block redispatch until reconciliation; preserve every existing receipt. |
| R4-02 | Eight simultaneous feedback-context reads each hold a transaction and request another pool connection, yielding eight 503 responses. | Assemble using the held connection while preserving author/reviewer authorization; exercise concurrent reads and related nested acquisitions. |
| R5-01 | Invalid public session checks and public capability reads can consume shared internal identity quotas. Service probe reproduced exhaustion; public Rust reachability was source-traced. | Invalid traffic must not exhaust another verified user's capacity; coalesce safe capability reads and retain bounded admission. |
| R5-02 | The outbound address filter accepts the non-global 192.88.99.2 relay address. Function and special-prefix boundary probes reproduce it; no network exploit was attempted. | Reject the prohibited relay range and test registry-derived prefix boundaries without weakening DNS pinning or TLS. |
| R5-03 | A committed but never-dispatched indexing stage with no result appears permanently conflicted on recovery. Source/SQL inference, not an executed crash reproduction. | Reproduce the pre-dispatch interruption, then distinguish safe recovery from dispatched uncertainty without deleting accounting evidence. |
| R6-01 | A definitively completed question retains its operation key, so explicit New question with identical input replays the old answer. Browser reproduction uses backend-equivalent mock replay. | Retire completed operation identity while retaining keys for ambiguous stop/disconnect/timeout/conflict outcomes; no automatic paid retries. |
| R6-02 | Initial sign-in clears a deletion-confirmation callback despite telling the visitor to keep the tab open. Reproduced in a synthetic browser flow. | Preserve the transient initial-sign-in callback with server account binding, or truthfully require reopening the link; keep logout/account-switch cleanup. |

Full scoped reports and reproduction artifacts are retained in the private development evidence
directory, outside the application repository. The review did not find another animation defect.
Corrected application source requires fresh relevant tests and independent review before rollout.

## Live Release Gates

OpenAI and Jev credentials/pricing, SMTP delivery, Google OAuth, approved HCMIU sources and human
bilingual labels remain unavailable or unverified. Optional web discovery is unimplemented and
disabled. Contextual interpretation of earlier conversation turns is not implemented; conversation
ownership and institution continuity must not be described as full conversational reasoning.

HomeLab PM2/Cloudflare configuration is prepared, not deployed. DNS/TLS, production database
provisioning, backups/restoration, operational retention scheduling, abuse/load controls and bounded
live-provider evaluation remain release gates. The private visual preview has no real backend access
and must not be mistaken for a live university service. No paid application call was made in these checks.
