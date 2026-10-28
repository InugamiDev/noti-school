# Clay redesign: decisions and context for implementers

Owner decisions (2026-10-28), recorded for remote workers who cannot see the design conversation.

1. **Look:** the "Clay" direction in `DESIGN.md` (clean, minimal, tactile). It replaces the dark charcoal/teal/lime theme and the folio-corridor archive scene. Light theme only for now.
2. **Audience:** every university, not only HCMIU. Each account belongs to one school and only gets answers from that school's approved documents. HCMIU is the first pilot. Copy says "your school / your university". Never name other real universities as partners, customers or upcoming schools.
3. **Stack:** SolidJS + Vite + TypeScript only (no React, no Next/SolidStart, no Tailwind). Styling in **Sass** (SCSS modules plus global token partials). Accessible behaviour from **@kobalte/core** headless primitives. Toasts may use `solid-sonner`. Icons from `lucide-solid` (already a dependency). Fonts self-hosted via `@fontsource` / `@fontsource-variable` packages (Bricolage Grotesque, Hanken Grotesk, JetBrains Mono), never a runtime Google Fonts link.
4. **Component anatomy:** shadcn/ui patterns (Solid UI is the Solid port reference). The question composer follows shadcn AI Elements Prompt Input: one bordered group, auto-growing textarea, bottom bar with school picker, language toggle and a round send button. Enter asks, Shift+Enter adds a line, IME composition never submits.
5. **3D:** Three.js (already a dependency) for one hero scene only: a clay plinth with one bookstack per school (yours in colour with an open page and a moving citation pin, another school locked, an empty "+" slot). Lazily imported, paused off-screen, single frames under reduced motion, static fallback without WebGL.
6. **Quality of life:** Cmd/Ctrl+K command menu, `/` focuses the question, persisted draft/language/scope, dismissible pilot notice, copy-citation toast, FAQ filter that ignores Vietnamese diacritics, mobile sheet menu, designed loading / empty / no-answer / unavailable states.

## Reference implementation

`reference/index.html`, `reference/components.html`, `reference/clay.css`, `reference/ui.js`, `reference/hero3d.js` are a working static mockup (they load fonts, lucide and three from CDNs, which the app must NOT do). Match their look and behaviour; do not copy their CDN loading or global-script structure.

## What still holds from `../DESIGN-CONTRACT.md`

Keep the functional contract: drafts survive auth in tab session storage; admin authority derives from Me membership; history only lists conversations opened in this tab (no list endpoint); schema validity is not evidence verification, so never show a "verified" label on answers; the full state matrix (loading, unavailable institution, empty collection, unauthenticated/forbidden, archived source, malformed response, network error, pending/cancelled generation, supported/qualified/abstained answer, feedback success/failure, upload pending/failure, missing mail/OAuth); no provider calls in tests.

Superseded by Clay: the dark-only theme, the folio-corridor scene and its route zoom, and the "no pills" rule (Clay uses pill buttons, chips and badges by design).

## Truthfulness

Example answers are labelled "Sample handbook, not HCMIU policy". Do not invent regulations, deadlines, offices, email domain formats, partners or affiliation. Forms that have no backend endpoint must say so (or be clearly marked preview) instead of pretending to send.
