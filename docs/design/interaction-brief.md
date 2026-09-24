# noti.school Interaction Brief

Status: design contract for implementation, not a claim of completed UI. Latest owner preference: animated, with zoom motion rather than a static hero background.

## Source Relevance

- Owner's PostHog/Lovable screenshots: prompt-first entry and discoverable navigation, not branding to copy.
- Existing generated luminous-archive concept: art direction only; it is not a functioning screen or evidence of university policy.
- Product/architecture/services contracts: workflow and trust boundaries, not copy to paste into the interface.
- Three.js and reduced-motion references: implementation and accessibility guidance.
- Earlier static-background plan: superseded for the normal motion-enabled experience. The bitmap remains a fallback.

## User Journey

The primary visitor is a university student with an immediate policy or procedure question, often on a phone and potentially unsure which document is current. Success means finding an answer or an honest limitation, then opening the actual supporting source. A memorable landing should invite that first question without making the student wait for a cinematic sequence.

1. Recognize noti.school, see the selected institution and available evidence coverage.
2. Enter an English or Vietnamese question, or select a sample prompt without losing the draft.
3. Submit immediately. The request starts independently of the short camera transition.
4. See truthful progress while evidence is retrieved and validated; no unsupported answer is labeled verified.
5. Read the answer, open citations, inspect a source page/section, or receive an actionable unavailable/insufficient-evidence state.
6. Ask a follow-up, correct the institution, return to the library or submit feedback. Preserve useful context through navigation.

The administrator's separate journey is sign-in, source upload/discovery, approval/versioning, indexing status and error recovery. It should use compact tables and forms, not the animated marketing composition. The institutional message remains: Reconnect with your students.

## Critique and Resolutions

- Motion could obscure the core action: keep heading and input stable in HTML; move only the scene and short navigation transition.
- A blank knowledge base could look broken: show actual source coverage and an honest empty state. Synthetic examples are explicitly Demo, never HCMIU policy.
- Missing providers could produce misleading optimism: surface disabled capabilities and preserve the draft; never simulate live success.
- Zoom can cause discomfort: respect prefers-reduced-motion from first paint, provide a pause control, and use a non-spatial transition when disabled.
- A beautiful graph could imply truth: graph relationships and citations always open evidence; do not show a confidence percentage as a substitute for support.
- Animation could make a lightweight frontend heavy: lazy-load the scene separately, cap resolution and geometry, and stop rendering when hidden or offscreen. Measure rather than advertise unverified performance.

## Visual Contract

Art direction: a luminous archive of rectangular document folios and slender shelves around an open central corridor. Neutral charcoal/platinum, restrained cyan and vermilion architectural accents, chartreuse primary action. No purple gradient, particles/orbs, generic floating cards, fabricated readable policy text or university affiliation.

First viewport: small direct navigation, unframed noti.school H1, a short student-facing sentence, institution select, question composer, sample prompts and a visible glimpse of the collection section below. The composer is a framed tool, not a card around the hero. Keep a single primary action. Responsive layout must fit at 390px wide and on wide desktop without clipping the brand or hiding all next-section content.

Use fixed semantic type sizes with responsive layout breakpoints, zero letter spacing, controls with stable dimensions and a maximum 8px radius. Lucide icons with accessible names/tooltips for submit, attachment, link, pause, source actions and navigation. Real student/admin work uses unframed lists, tables and a focused answer/source split view, collapsing predictably on mobile.

## Motion Contract

- On entry, a brief camera dolly settles into the archive without gating input focus or typing.
- Idle motion is a very slow bounded push/pull with subtle independently moving archive elements. Avoid an endless accelerating zoom or arbitrary UI bounce.
- Fine-pointer movement adds a small damped camera offset. Touch devices use no pointer-follow behavior.
- Submit performs one short eased forward zoom/crossfade into the answer workspace. The network request begins immediately; rapid submits, cancellation and back navigation cannot queue animations or duplicate requests.
- Citation opening has a small opacity/position transition tied to the selected source; it does not restart the hero camera.
- Reduced-motion, the pause control, hidden tabs and offscreen hero each stop nonessential rendering. Reduced-motion mode must never start with an initial zoom flash.
- Dispose geometry/materials/textures, observers, listeners and animation loops on unmount. Handle resize, orientation change and WebGL context loss with a usable fallback.

## Implementation Brief

Implement under apps/web using SolidJS, TypeScript, Vite and direct Three.js, not React Three Fiber, Next.js or SSR. Separate scene, motion preferences, API client and functional screens. Use the frozen foundation contracts; do not create parallel incompatible schemas. Backend features must use real routes. Demonstration fixtures have an explicit boundary and cannot impersonate provider or authentication success.

The generated archive bitmap is approved as an illustrative fallback and reference asset. Its source SHA256 is 3f21acc149cd3c9b75e9a06ab08f0a3939969a92b17021f2850a777b965dd63d. Do not display the entire UI mockup as the application. Optimize the production asset with a reproducible build step and retain its provenance.

Acceptance: functional prompt/answer/citation/auth/source/admin paths and all failure states; typecheck/build; desktop/mobile Playwright screenshots; nonuniform canvas-pixel checks and frame-to-frame changes with motion enabled; stable frames with reduced motion; visible fallback after WebGL failure; no layout overflow, obscured text, dead controls, leaked secrets or duplicated requests. Preserve exact commands/results and screenshots for review. Canvas checks must inspect the actual scene, not a DOM flag that claims it rendered.

## Primary References

- [Three.js scene and animation loop](https://threejs.org/manual/pages/creating-a-scene.html)
- [WebGLRenderer lifecycle](https://threejs.org/docs/pages/WebGLRenderer.html)
- [Reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
