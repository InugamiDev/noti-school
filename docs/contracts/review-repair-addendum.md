# Review Repair Interfaces

These are frozen repair requirements, not a claim of completed implementation or audit clearance.

## Administration

- `GET /api/v1/institutions/{institution_id}/versions/{version_id}/chunks`: current institution
  administrator only, including pending/quarantined/withdrawn versions. PageQuery -> ChunkPage.
  Signed cursor binds institution, version, role and ordering; order by ordinal then ID. Empty
  extraction returns an empty page, not invented text. Students cannot use this review endpoint.
- `GET /api/v1/institutions/{institution_id}/feedback/{feedback_id}/context`: current institution
  administrator only. FeedbackContext contains exactly feedback, the reported answer's question,
  and the answer with currently authorized evidence. No user email/ID, other answers or broader
  conversation history. A guessed answer ID without a matching feedback row confers no access.
  Revoked membership, wrong tenant, removed feedback/answer or now-inaccessible evidence fails
  closed or is redacted using the existing answer rules. Responses are no-store.
- Never-approved archived versions remain private to administrators. Historical student access
  requires actual prior approval, as well as current membership and source visibility.

## Questions and Recovery

- The input ceiling is 4,000 Unicode scalar values, at most 16,000 UTF-8 bytes. The pinned Zod
  version counts code points, matching JSON Schema; do not use JavaScript string.length as the
  character count or cap the textarea at 4,000 UTF-16 units. Tab, LF and CR are permitted;
  other ASCII control characters are not.
  Rust validates the same rules before reservations or paid calls. Reject an oversized serialized
  question-only evidence envelope before inference, and terminate evidence trimming when empty.
- Locator offsets are Unicode scalar-value offsets within the normalized chunk, half-open
  `[start_char,end_char)`. Whole-chunk citations start at zero, including second/subsequent chunks.
- Answers have a 140-second server work allowance, 150-second HTTP allowance, and 155-second
  browser waiting allowance. Other browser requests retain shorter timeouts.
- A browser stop command stops waiting, not server work. Preserve the same idempotency key for
  the exact user/institution/question/language/conversation payload after ambiguous outcomes,
  including timeout, disconnect and stop-waiting. Replay is explicit, never an automatic paid
  retry. A pending/failed conflict must not silently generate a new key. Clear identity-owned
  state on logout/deletion/account or membership changes and ignore stale asynchronous results.
- Indexing recovery is an explicit current-admin operation for institution-owned sources. It
  must survive departure/deletion of the uploader without bypassing old uncertain/dispatched
  charges or running two workers on one version. Retention must preserve recoverable job roots.

## Provider Admission and Retention

- Both providers and all five required dated price entries are checked before the first paid
  stage of asks and indexing, not only when rendering capabilities. Stage-time checks remain.
- Observed provider failures affect capabilities for a bounded cooldown; no active paid health
  probes. A later explicit admitted operation may re-test after cooldown; success clears failure.
- Retention must bound personal text and user/linkable request metadata. At 13 months, terminal
  operations with no unresolved money or unfinished job may be pseudonymized in bounded batches.
  Do not release uncertain funds, remove dispatch fences or destroy financial reconciliation
  evidence. Non-personal accounting records may remain with a documented reason. Document the
  exact implementation, exemptions and operator cadence rather than claim blanket deletion.

## Review Conditions

All repair tests use dedicated synthetic databases and loopback provider mocks. Pinned package
registry downloads are permitted; external inference, email, public deployment and production
data are not. Independent reviews must be repeated against the integrated repair snapshot.
