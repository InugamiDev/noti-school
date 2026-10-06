# Offline RAG contract evaluation

This evaluator exercises the real public Rust helpers against explicitly synthetic English
and Vietnamese fixtures. It measures deterministic software behavior, not real HCMIU policy
correctness, model semantic accuracy, or human-verified entailment. No university regulation
in this dataset is real. The fictional academy is not HCMIU and implies no affiliation.

The baseline is campaign candidate `61ad4ef5fc18ac747688cf4a5dbcd1e00cccacef`.
The evaluator adds no dependencies or manifest entries: Cargo discovers the `rag-eval`
example and `rag_evaluation` integration test automatically.

## Reproduce

Run from the repository root, with pinned Rust 1.94.0 (including rustfmt and Clippy):

```sh
export RUSTUP_HOME=/home/inu/.ultrathink/campaigns/noti-school-rag-20261006/toolchain/rustup
export RUSTUP_AUTO_INSTALL=0
export CARGO_HOME="$PWD/.cache/cargo"
export CARGO_TARGET_DIR="$PWD/.cache/target"
export CARGO_BUILD_JOBS=1 RUST_TEST_THREADS=1
export PATH=/home/inu/.cargo/bin:$PATH
rustc --version
cargo run -p noti-school-api --locked --example rag-eval -- tests/fixtures/rag/evaluation.json
cargo test -p noti-school-api --locked --test rag_evaluation
rustfmt --edition 2024 --check apps/api/examples/rag-eval.rs apps/api/tests/rag_evaluation.rs
cargo clippy -p noti-school-api --locked --example rag-eval --test rag_evaluation -- -D warnings
```

Use the complete PATH from the campaign's `tools/README.md` on the campaign host. Elsewhere,
use an already installed pinned 1.94.0 toolchain and omit the host-specific RUSTUP_HOME/PATH.
Only pinned build dependencies may be downloaded; evaluation performs no HTTP calls,
reads no application environment/secrets, and needs no database. After dependency preparation,
`--offline` may be added to Cargo commands. The integration test invokes the real example
CLI through Cargo with `--locked --offline`; it uses the same isolated caches and tests
empty, malformed, duplicate-case, monolingual, failing-expectation and valid inputs.

Stdout is one JSON report. Exit **0** means every expectation matched, **1** means at least
one expectation failed, and **2** means invalid dataset/arguments or unreadable input.
A nonzero report is a failing check. Do not label a process that printed a report as passed
without checking its exit code. Compilation diagnostics go to stderr.

## Controlled inputs and independent gold

[`evaluation.json`](../tests/fixtures/rag/evaluation.json) has a strict versioned schema:

- `passages` explicitly identify synthetic text. `repeat` expands exact UTF-8 text to test
  byte/scalar limits without embedding huge strings. Expansion is bounded to 100,000 bytes.
- Each case supplies two candidate ID rankings, a question/language, and scripted structured
  replies for rerank, selection, generation and support. Unreached replies may be null.
  A `raw_envelope` reply supplies an invalid provider envelope directly. Normal replies are
  wrapped in a synthetic completed Responses envelope with fixed protocol-only usage.
- `gold` separately specifies outcome/stage, relevant passages, ordered RRF/excerpt/packed/
  selected IDs, published citation IDs and truncated excerpt IDs. Gold is never an input
  to RRF, packing, provider parsing or support validation. Mutating gold or replies separately
  demonstrably changes pass/fail results.
- Duplicate passage, case, ranking and gold IDs, unknown ranking/gold IDs, missing fields,
  unknown fields, empty datasets, and absent `en`/`vi` coverage fail dataset validation.
  Unknown/duplicate IDs inside provider replies instead test production rejection.

All reached stages use [`retrieval::rrf`](../apps/api/src/retrieval.rs),
[`input::validate/pack`](../apps/api/src/input.rs),
[`rag::excerpts/retain/request/validate`](../apps/api/src/rag.rs), and
[`providers::validate_response/validate_generation`](../apps/api/src/providers.rs).
Generation requests also use the production builder. Fixture parsing validates the dataset
format, not a separate implementation of production provider validation.

The example orchestrates these public helpers; it does not execute the SQL-backed pipeline.
Its terminal vocabulary is local: `accept` means structurally validated generated claims
and a scripted supported verdict; `abstain` means valid empty/insufficient/conflicting/
uncertain/unsupported results; `reject` means a helper returned an error. Error codes and
the last reached stage appear in each case. Generated unknown citations are caught by the
public support validator here; the full pipeline rejects them earlier, before a support call.
This distinction prevents treating this harness as exact runtime trace parity.

## Metrics and evidence

The report includes the exact fixture SHA-256, actual intermediate IDs, excerpt character counts, serialized envelope
and request bytes, selection/support verdicts, generated claims, expected gold, and a mismatch
list per case. Aggregate and per-language counts and metrics make sample sizes explicit.

| Metric | Numerator / denominator |
| --- | --- |
| Expectation pass count | Cases matching **all** gold outcomes, stages and ID lists / all cases |
| Retrieval recall@11 | Gold relevant IDs present in actual fused top 11 / gold relevant IDs |
| Citation-ID coverage | Gold citation IDs present in actually accepted output / gold citation IDs |

Recall and citation coverage are micro-aggregated across case/ID pairs; an ID repeated in
different questions contributes once per question. Per-case denominators are also included.
A zero denominator yields JSON null, never 0 or 1. Recall includes rejected and abstaining
cases when they have relevant gold. Cases with no relevant gold contribute no recall weight.
Citation coverage uses only cases with explicit gold published citations; missing accepted
output earns zero coverage. Extra/wrong IDs fail exact citation expectations even when a
coverage ratio alone would hide them. The deliberately incomplete retrieval case ensures
the sample's recall is not a pre-recorded perfect score.

RRF uses the production limit of 11 initial candidates, reserving the twelfth slot for graph
expansion. There is no graph expansion in this fixture harness. Rankings are controlled
inputs, not measured PostgreSQL lexical/vector search results. Likewise citation-ID coverage
is **not** citation completeness or factual support: all support judgments are scripted.
Malicious-passage cases verify request boundaries and consumption of a scripted abstention;
they do not prove that a live model resists prompt injection. The bilingual labels and text
exercise both fixture groups but do not measure language understanding.

`offline_elapsed_ms` measures parsing, validation and helper execution only, excluding Cargo
compilation/process startup. It is observational and is the sole nondeterministic report field.
`live_latency_ms` and `real_cost_usd` remain null. Fixed envelope token usage is never reported
as measured usage, price, latency or savings. No accuracy improvement is claimed.

## Complementary runtime and release evidence

The actual database test is
[`runtime_sql_and_complete_pipeline`](../tests/api/pipeline.rs), with
[RAG runtime checks](../tests/api/rag.rs) and [recovery/accounting checks](../tests/api/repairs.rs).
Those exercise runtime roles, source/session revalidation, provider-mode readiness,
reservation/replay handling and financial boundaries. This offline evaluator does not verify
those protections and does not replace those tests. This lane does not run the DB suite.
P0 must verify `tools/db-ready.json`, take the campaign `services.lock`, and use only the
dedicated disposable database before running the documented ignored runtime test. A skipped
DB test or zero selected tests is not evidence. OpenAI remains the default evidence provider;
Jev is explicit opt-in with no outage fallback and needs its separate runtime checks.

Before release, administrators must approve the HCMIU source corpus and immutable versions.
Humans must label held-out English/Vietnamese questions, answerability, exact supporting
passages and page/section locators, including ambiguity, contradictions, obsolete sources,
cross-document answers, injection and unanswerable questions. Keep tuning and held-out sets
separate. Evaluate actual retrieval, citation support/completeness, factual correctness,
unsupported claims and abstention quality by language with counts and uncertainty. Compare
retrieval/reranking/graph variants on the same labels; evaluate Jev separately. Measure live
stage latency and actual accounted cost only under separately approved bounded live calls.
P0 rerun, scope review and three independent reviews are required before acceptance.
