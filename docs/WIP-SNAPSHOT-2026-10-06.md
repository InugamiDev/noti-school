# WIP Snapshot: 6 October 2026

This branch preserves the current noti.school work at the author's request. It is
not an accepted release, a merge into main, or a deployment.

## Included Work

- Existing landing-page and product-page changes, design notes and browser tests.
- OpenAI RAG pipeline with hybrid retrieval, approved graph expansion, structured
  evidence checks, claim citations, abstention and bounded provider accounting.
- Synthetic bilingual evaluation fixtures and runtime regression tests.
- Latest duplicate-key parsing repair for Jev and embedding provider responses.

## Source Provenance

- GitHub base: `2f9aad2492c806de271a5e32455e636e0b0b414e`.
- The original 176-file source snapshot includes the uncommitted website work.
- Remote isolated source baseline: `590d0dd41661278af1d8676c96b501f5fe3c9cd6`.
- Last frozen RAG candidate: `507a86dfd3f44402be6de33f631eaa11e8f2153f`.
- This backup additionally includes the six uncommitted RAG-R6 repair files.
- Full 37-file RAG delta SHA-256:
  `fe1780795a4a60067247301f24b7625d3afce68fa650367224f11724156a0da2`.

Source hashes were checked when retrieving and reconstructing this snapshot.
Private logs, credentials, populated environment files, uploaded documents,
runtime databases, dependency caches and build outputs are excluded.

## Verification Limits

The coordinator previously ran 15 successful acceptance commands against the
frozen `507a86d` candidate. Independent review then found an additional Jev
duplicate-key ambiguity; the latest repair addresses it and the equivalent
embedding-response boundary.

The RAG-R6 worker reports passing 17 library, six evaluator and 12 security tests,
one separately enabled database suite, 32 synthetic offline evaluation cases,
formatting, compilation and Clippy. These are worker-reported results, not fresh
coordinator verification or independent approval of this final snapshot.

Final coordinator reruns and three independent reviews of the final source remain
pending. Historical release findings and operational prerequisites remain listed
in [Verification Status](verification-status.md). No real provider calls, HCMIU
answer-quality validation, email-delivery verification or production deployment
are established by this backup. Paid application calls remain disabled by default.

## Execution Infrastructure

The RAG jobs ran in isolated HomeLab worktrees through the existing UltraThink
companion runner. They were not submitted to the separate new Fleet Rust cloud
service and are not automatically represented by its desktop task sidebar.

Preserving this branch does not repair Fleet connectivity, accept the product,
or authorize starting additional workers or deploying services.
