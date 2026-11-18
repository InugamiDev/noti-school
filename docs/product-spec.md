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
- Hybrid lexical/vector retrieval scoped by institution, visibility, approval and validity; bounded graph expansion; OpenAI reranking; selected-provider evidence and claim checks (OpenAI by default, Jev opt-in); OpenAI answer generation.
- Source-grounded citations, abstention and conflict handling. Separate evidence support from syntactically valid links.
- Web discovery through TinyFish Search and Fetch (owner decision, 18 November 2026, supersedes the earlier OpenAI official-domain-only rule). Any public page may become answer evidence, but only after it is fetched, chunked, embedded and scored by Jev for four things: is it about the asked-about school, is the source trustworthy (the school's own domains score highest), is the passage relevant, and does it actually answer the question. Every web-derived claim and citation shows its origin (`web`), domain, fetch time and confidence; it is never presented as institution-approved. An administrator can promote a cached page to an approved source or block it. Cached pages and searches are reused for 7 days and re-fetched on the next use after that.
- Password and passkey sign-in (owner decision, 18 November 2026). Registration stays invite-only. While mail is not configured, `AUTH_INVITE_VERIFIES_EMAIL=true` lets an invitation that the operator handed directly to the invitee count as proof of that email, so the invitee can create a password account and then add a passkey. With mail configured, normal email verification applies. Passkeys (WebAuthn) are an additional sign-in method for an existing verified account; they never create an account or grant membership on their own. Password reset and account deletion still require working mail.
- Evidence ontology: entities and relations extracted from approved and web passages, each relation tied to its source passage and carrying a Jev confidence. Relations are retrieval hints, never independent evidence.
- Personal space: each signed-in user can open a private space with the same search, scoring and citation pipeline for questions beyond one school.
- Persistent conversations and feedback with access controls; user deletion and clear retention defaults.
- Local observability, a cost ledger, unit/integration/end-to-end tests and bilingual evaluation fixtures.

## Non-Goals for the Pilot

Public worldwide release, billing, unrestricted crawling, university SSO beyond Google, automated administrative decisions, personal student records, local Jev hosting, automatic policy publication, general legal advice, and a full research reproduction of GraphRAG or HippoRAG.

## Interface Direction

Use noti.school as a visible first-viewport identity. The public first screen is a functional prompt-led landing page with a school selector, example queries and clear evidence coverage. After asking, transition smoothly into the answer and citation workspace without forcing a second onboarding flow.

The public landing is an animated futuristic archive, not a static background. Use a full-bleed Three.js scene with a gentle camera push-in, bounded pointer parallax and a short zoom transition into the answer workspace. Keep the actual prompt and navigation in accessible HTML with stable geometry. Respect reduced-motion and an explicit pause control; pause offscreen/hidden rendering. When WebGL is unavailable, animate the generated archive bitmap with bounded entry, ambient and submit motion using the browser's animation engine. Reduced-motion and user pause keep either presentation still. Do not hijack scrolling or delay the answer request for animation.

Repeated student/admin work surfaces remain quiet, dense enough for scanning, accessible and fast. No copied PostHog/Lovable branding, invented institution partnership or decorative nested cards. Test mobile, keyboard interaction, loading, empty, failure, expired-source and unsupported-answer states. Verify desktop/mobile screenshots plus canvas-pixel checks that prove the scene is nonblank, framed correctly and moving when motion is enabled. See docs/design/interaction-brief.md.

## Constraints

One student owns the project and uses a personal AI-assisted development workflow. Do not describe internal worker allocation in academic/user-facing product copy. The four-week target is a pilot milestone, not an assertion that a public SaaS is complete in four weeks.
