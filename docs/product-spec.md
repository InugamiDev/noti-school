# Product Specification

## Goal

Make institutional information accessible through an answer-first interface while preserving the institution, version, effective date and evidence behind each answer. Start with HCMIU. The architecture may support multiple institutions, but an institution is only advertised as covered when approved sources have actually been indexed.

## Primary Journeys

1. A student selects the institution and asks a question directly on the landing page. Suggested questions are backed by an explicitly labeled demo collection or the approved live collection, never invented policy.
2. The answer shows the institution, cited claims, document titles, page/section locations and source dates. Selecting a citation opens the relevant source passage; follow-up questions retain institution scope.
3. Insufficient, expired or contradictory evidence produces a qualified response or abstention with a useful next step. It does not produce a plausible unsupported answer.
4. A student can report an incorrect answer and identify the problematic passage without being asked to reveal unnecessary personal data.
5. An administrator uploads a PDF/text document or proposes an official source URL, checks extracted content, supplies version/effective-date metadata, approves it, and observes indexing status.
6. An administrator reviews feedback, source freshness, ingestion failures and budget consumption. Only approved current sources are available in ordinary answers.

## Pilot Features

- Interactive prompt-first landing page and usable answer workspace, source library, source reader and feedback form.
- Email/password and Google login using Better Auth, initially invite-only. SMTP-backed verification and password reset once configured. Administrative membership is assigned explicitly, not inferred from an email suffix.
- PDF/text ingestion, extraction diagnostics, page-preserving chunks, source-version checksums and document lifecycle states.
- Hybrid lexical/vector retrieval scoped by institution, visibility, approval and validity; bounded graph expansion; Jev assessment; OpenAI answer generation.
- Source-grounded citations, abstention and conflict handling. Separate evidence support from syntactically valid links.
- Optional on-demand official-domain web discovery using OpenAI. Search results are not automatically approved corpus evidence. They remain separately labeled until fetched, validated and reviewed.
- Persistent conversations and feedback with access controls; user deletion and clear retention defaults.
- Local observability, a cost ledger, unit/integration/end-to-end tests and bilingual evaluation fixtures.

## Non-Goals for the Pilot

Public worldwide release, billing, unrestricted crawling, university SSO beyond Google, automated administrative decisions, personal student records, local Jev hosting, automatic policy publication, general legal advice, and a full research reproduction of GraphRAG or HippoRAG.

## Interface Direction

Use noti.school as a visible first-viewport identity. The public first screen is a functional prompt-led landing page with a school selector, example queries and clear evidence coverage. After asking, transition smoothly into the answer and citation workspace without forcing a second onboarding flow.

The public landing may be expressive and futuristic; the repeated student/admin work surfaces remain quiet, dense enough for scanning, accessible and fast. No copied PostHog/Lovable branding, invented institution partnership, distracting background animation or decorative nested cards. Use a real/generative bitmap asset only where it supports the subject, and retain a reduced-motion mode. Test mobile, keyboard interaction, loading, empty, failure, expired-source and unsupported-answer states.

## Constraints

One student owns the project and uses a personal AI-assisted development workflow. Do not describe internal worker allocation in academic/user-facing product copy. The four-week target is a pilot milestone, not an assertion that a public SaaS is complete in four weeks.
