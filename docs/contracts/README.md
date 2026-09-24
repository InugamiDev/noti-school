# Foundation contract v1

Status: shared implementation contracts. Rust, identity and web services are implemented; independent
reviews found release-blocking issues, and repair/re-review is in progress. This is not release clearance.
The product requirements in docs/product-spec.md, architecture.md, services.md, acceptance.md and deployment.md remain authoritative.

The shared owner freezes `packages/contracts/src/index.ts`, generated `schema.json`, endpoint registry,
environment rules, root manifests/locks, migrations and infra. Subsequent workers edit only their assigned
`apps/api`, `apps/auth` or `apps/web` paths. Request shared-contract changes through the coordinator;
do not regenerate locks in parallel. Root scripts explicitly report missing app prerequisites.

- [API and identity boundary](api.md), [endpoint registry](endpoints.json).
- [Database and cost protocol](database.md).
- [Environment and deployment integration](environment.md).
- [Pinned dependencies and primary sources](dependencies.md).
- [Review repair interfaces and request recovery](review-repair-addendum.md).

Wire format: UTF-8 JSON, snake_case, UUID product IDs, opaque string identity IDs, RFC3339 UTC timestamps,
integer micro-USD costs (USD 1 = 1,000,000 micro-USD), ISO language `en` or `vi`. Unknown properties
are rejected on custom requests. `null` is an intentional absence; omitted optional request fields use
only declared defaults. The JSON Schema is draft 2020-12. TS exports use Zod; Rust may implement serde
types but must validate against the same fixtures/schema. Locator offsets count Unicode scalar values
in normalized chunk text, not bytes or JS UTF-16; `end_char` is exclusive, pages are one-based.
Require `end_char > start_char` and at least page or section; JSON schema structural validity alone
does not prove semantic support. Answer references must exist, be unique, match institution and pass
`validateAnswer`; API additionally verifies source visibility, version validity and claim support.

Synthetic fixtures are expressly non-policy, not a seeded HCMIU corpus or evidence of coverage.
Institution HCMIU may be displayed with `coverage=none` until approved evidence exists. No migrations
insert regulations, deadlines or affiliations. User-facing source URLs come from approved records,
never from model-supplied links; private storage keys never appear in wire objects.

No success wrapper: successful JSON is the named schema. Lists return `{items,next_cursor}`.
Errors use `ApiError`, including unknown `/api` paths. Better Auth's own `/api/auth/*` routes retain
its native SDK wire format; custom wrappers and product routes use these v1 contracts.
