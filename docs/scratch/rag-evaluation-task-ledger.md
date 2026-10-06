# RAG-2 offline evaluation ledger

- [x] Read campaign receipts, packet policy/plan and target product contracts.
- [x] Verify HEAD `61ad4ef5fc18ac747688cf4a5dbcd1e00cccacef` and all 29 candidate receipt hashes; initial worktree clean.
- [x] Inspect public RRF/input/RAG/provider helpers and production orchestration.
- [x] Implement fixture-driven offline example using production helpers.
- [x] Add independent synthetic English/Vietnamese gold and adversarial fixtures: 32 cases, 21 en / 11 vi.
- [x] Verify pinned Rust 1.94.0, affected formatting, example, integration tests and Clippy with one compiler job.
- [x] Exercise failing CLI inputs and record exact exits/counts: empty/bad/duplicate/monolingual 2, broken expectations 1, valid 0.
- [x] Document denominators, limitations, complementary runtime DB tests and release evaluation.
- [x] Return six-section handoff/result receipt; pending P0 rerun and independent reviews.

Scope: only the assigned new example/test, `tests/fixtures/rag/**`, this ledger,
`docs/rag-evaluation.md`, and ignored local `.cache`/`.handoff`. No paid calls,
network inference, DB runs, commits, deployment, or existing-file edits.

Verification: `cargo check -p noti-school-api --locked` exit 0;
`cargo run -p noti-school-api --locked --example rag-eval -- tests/fixtures/rag/evaluation.json`
exit 0, 32/32 expectations (2 accept, 13 abstain, 17 reject);
`cargo test -p noti-school-api --locked --test rag_evaluation` exit 0, 6 passed,
0 failed/ignored/filtered; `rustfmt --edition 2024 --check apps/api/examples/rag-eval.rs apps/api/tests/rag_evaluation.rs`
exit 0; `cargo clippy -p noti-school-api --locked --example rag-eval --test rag_evaluation -- -D warnings`
exit 0. Cargo metadata confirms both auto-discovered targets.

First example build failed with E0283 (ambiguous `language.into()` map key); fixed to
`language.to_owned()` and reran successfully. No production helper change was needed.
Recall 11/12 and citation-ID coverage 2/2 are synthetic fixture metrics only.
The CLI's elapsed observation is local helper time, not provider latency.
