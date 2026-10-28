# Implementation design contract

Visual system: Clay light theme, see DESIGN.md and clay/CONTEXT.md. The dark-only theme, folio corridor scene, route zoom and "no pills" rule are superseded; the functional contract below still holds.

The supplied docs/design/interaction-brief.md is the authoritative, already critiqued journey and composition contract. This file and the task ledger specialize it for the scoped client. The skill pipeline CLI was attempted but its read-only installation lacks commander; no harness install or modifications were performed.

Source relevance: README/product spec supply student and university promises; interaction brief supplies the stable prompt; contracts supply endpoint constraints only. The hero scene fallback image is a reference, never an app screenshot.

Journey: student recognizes institution/coverage, writes in English or Vietnamese, submits without an animation gate, receives final validated claims or a limitation, opens source version/page, follows up, or reports. Auth forms retain question drafts in tab session storage. Admin authority derives from Me membership; unauthorized visitors see sign-in guidance, not fabricated controls/data.

Critique: unavailable resource reads must not crash the application. Initial reduced motion renders a single still frame with no entry flash. History cannot promise all account conversations because the frozen registry has no list endpoint; show only IDs opened in this tab.

Anti-generic gate: no gradients as brand decoration, glass, glow, KPI cards or mock policies. Pill buttons, chips and badges are part of the Clay system. One composer is the primary tool. Repeated screens use simple rows and forms.

Scene/motion: one Clay hero scene (plinth with one bookstack per school) in direct Three.js, independent lazy chunk, capped DPR 1.5, fixed geometry count. Pause, system preference, hidden tab, off-screen intersection and disposal stop frame scheduling; reduced motion renders single frames. Without WebGL, or on context loss, show the static fallback. No model/provider calls in tests.

State matrix: initial loading, unavailable institution, empty collection, unauthenticated/forbidden, source expiry/archive, malformed response, network error, generation pending/cancelled, supported/qualified/abstained answer, feedback success/failure, upload pending/failure and missing mail/OAuth. Schema validity is not evidence verification; no verified label.

QA: desktop 1440×900, wide 1920×1080, phone 390×844; rendered canvas screenshots and pixel statistics; changed normal frames, stable pause/reduced frames, fallback and context loss, real form keyboard navigation and network timing, long Vietnamese overflow, source and auth failure. Backend success uses explicitly synthetic intercepted fixtures in tests only. Keep exact outputs and screenshots in tests/web/artifacts.
