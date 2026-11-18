---
name: noti.school clay archive
colors:
  primary: '#ef9a76'
  on-primary: '#2b1a12'
  background: '#efe8df'
  surface: '#f6f1ea'
  raised: '#fbf8f3'
  text: '#2b2521'
  muted: '#655b53'
  evidence: '#2a6f77'
  unavailable: '#ac4029'
typography:
  body:
    fontFamily: 'ui-rounded, SF Pro Rounded, Nunito, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: '0px'
  heading:
    fontFamily: 'ui-rounded, SF Pro Rounded, Nunito, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif'
    fontSize: '40px'
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: '-0.02em'
rounded:
  sm: '12px'
  md: '20px'
  lg: '30px'
  pill: '999px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  primary-button:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.pill}'
    padding: '{spacing.md}'
---

## Overview

Soft clay minimalism. A light, warm archive of matte clay shelves, books and floating notes frames a stable question composer. One light theme. System fonts (rounded where the platform has them) avoid another external fetch and cover Vietnamese.

## Colors

Warm clay neutrals with pastel accents. Peach clay is reserved for the primary action, teal for evidence links and labels, deep terracotta red for unavailable states. Pastel tints (sky, sage, butter) only colour large slabs. Status always includes words. Text colours meet WCAG AA on every surface.

## Typography

Fixed sizes at breakpoints: archive hero 58/100/112px with compact-height reductions, marketing page titles 34/40/52/64px, section headings 30/40px, body 16px, question 16/18px. Large headings use light negative tracking (-0.02 to -0.045em); body text none. No viewport-scaled text. Long source titles wrap.

## Layout

Header is 72px on desktop and 64px with mobile disclosure; the account link is a dark pill. Sources, History and account entry remain directly visible. A centered 680px composer opens onto the next answer/evidence section. Marketing bands use a 1160px content measure; audience, pilot and about bands are inset tinted slabs. Lists, FAQs, citations and document rows are separate raised cards rather than ruled rows. Answer/source splits collapse to vertical readers on phones. The minimum supported width is 320px.

## Elevation & Depth

Clay elevation: raised surfaces use a paired warm drop shadow and white highlight (`--clay`, `--clay-sm`); inputs, passages and selected states are pressed wells (`--clay-well`, `--clay-press`). Buttons lift 1px on hover and press in on activation. The Three.js archive supplies spatial depth with matte rounded geometry, hemisphere plus key/fill light and baked contact shadows; no shadow maps.

## Shapes

Rounded everywhere: 12px controls, 20px cards, 30px panels, pill buttons and chips. Scene geometry uses rounded boxes, capsules and spheres.

## Components

Native labels, inputs and buttons. Selects are a clay select-only combobox (`ui/Select.tsx`, WAI-ARIA APG keyboard model, hidden input for forms) so the open list matches the theme instead of the OS picker. Loading uses clay bead loaders with visible status text and content-shaped shimmer skeletons (`ui/Loader.tsx`). Short entrances (select tray spring, answer claim stagger, auth panel swap) use Motion (`motion`, the framework-agnostic framer-motion build) through `ui/motion.ts`, which skips them under reduced motion, the pause control and hidden pages. Sign-in is one card: Google first, email second, with create account, reset, invitation and verification reached by links rather than five tabs. Lucide icons supplement visible labels. Motion control has a title and accessible name; the footer shares its pause preference across routes. Bounded section reveals and evidence transitions stop for pause, reduced motion and hidden pages. Without IntersectionObserver the archive bitmap (a capture of the clay scene) and page content remain visible and still. Loading regions include visible status. The synthetic product example is an isolated framed tool, not a simulated live answer.

## Motion

One system, defined once as custom properties in `style.css` and mirrored in `ui/motion.ts`: durations `--dur-xs` 120ms, `--dur-sm` 200ms, `--dur-md` 320ms, `--dur-lg` 420ms; easings `--ease-out` (settle), `--ease-in-out` (pulse), `--ease-spring` (chip pop); `--stagger` 45ms. Nothing on the task path exceeds 420ms and only transform and opacity animate. Choreography: workspace pages rise in (`page-in`); list rows set `--i` and rise in turn (`.stagger-in`, delay capped at eight rows); an arriving answer fades its status, settles sentences one by one, pops citation chips, then stacks the source cards in the same order; a pending question slides into the thread. Hovering or focusing a citation chip lights its source card and vice versa (`data-hot`); opening one pulses the card, scrolls it into view and reveals the passage a beat later. Every entrance is skipped under system reduced motion, the shared pause control and hidden pages, and the layout is identical without it.

The landing page is the one place allowed to be showy (`site/Flash.tsx`, `site/flash.css`): a reading progress bar, wordmark letters and promise words rising on first load, a shimmering "answered with sources", floating citation chips, scroll parallax on the wordmark and chips, a pinned four-step walkthrough on wide screens, drifting question rows, a statement that lights word by word as it scrolls, pointer light and tilt on cards, a magnetic closing button, eased wheel scrolling and a branded scroll bar. Rules: the composer and every control never move, so the page is usable immediately; decoration pauses when the hero is off screen or the tab is hidden; nothing infinite runs inside a `.site-band` until it has been revealed; and with motion off every one of these is still, with the walkthrough shown as a plain list and the statement fully lit.

## Glass preview (flag)

"Liquid glass" accents are the default (`html[data-style="glass"]`, `ui/style-flag.ts`, `ui/glass.css`); `?style=classic` or the footer "Glass style" switch returns to the solid clay style, remembered in localStorage. Glass appears only over the bookshelf: the hero composer and institution picker (blur + saturate, a masked specular rim, a Chromium-only `feDisplacementMap` refraction on desktop), the header as the page scrolls (a CSS scroll-driven animation over the first 90px; an IntersectionObserver sentinel only where `animation-timeline` is unsupported), and the top edge and handle of the mobile citation sheet. Reading surfaces stay paper. `@supports` and `prefers-reduced-transparency` fall back to solid.

## Splash and loader

`index.html` inlines a splash (critical CSS + SVG, no JS dependency) that paints before the bundle: a droplet falls and becomes the "n." tile, the n draws, the coral dot pops, then the overlay lifts once the app has mounted and at least 700ms have passed, or at 1.6s regardless. It never takes pointer events or focus and exists only on a cold document load. Reduced motion or a paused-motion preference (read synchronously from storage) shows a still tile with a quick fade. `ui/Loader.tsx` loops the same mark at 28–36px for every page-level loading state next to its announced text; skeletons keep the layout.

## Confidence and web evidence

Web pages may support an answer, so every evidence item says where it came from and how sure the system is (`ui/Confidence.tsx`, `ui/Origin.tsx`, `ui/confidence.css`). Nothing new was added to the palette: the labels reuse the existing chips and tints.

- Origin: "Approved document" (teal, file-check icon) or "Web page · example.edu" (ink, globe icon). Web items also show "Fetched 3 Nov 2026". A web page is never worded or coloured as approved, and its passage opens with "Found on the web. This page is not an approved document." and a link to the page itself instead of the library reader. In the private space nobody approves anything, so a page its owner kept reads "Saved by you" (ink, bookmark icon), never "Approved document". The API documents no marker for this yet; the label is derived from the institution kind.
- Confidence: the visible label "Confidence:" first, so a bare "Medium 72%" is never mistaken for relevance or a grade, then a word (High from 0.8, Medium from 0.6, Low below), then the whole percent rounded down so the number never contradicts the word, beside a three-bar glyph with one, two or three bars filled. Tints are sage, butter and warm, the same tones as the status chips. Colour is never the only signal, and the accessible name is the same text a sighted reader sees: "Confidence: Medium 72%". A missing score reads "Confidence: Not scored"; the interface does not invent one.
- Breakdown: on a source card the label is a disclosure button (`aria-expanded`). Opening it lists the four checks in plain words (about this school, trusted source, on topic, answers the question), each with a short bar and its percent, then the scoring model's name.
- Answer header: after the status chip, one line with the overall label and one plain sentence. When any cited evidence is a web page, a calm sky-tinted note follows: "Includes pages found on the web. They have not been reviewed by <school> staff." In the private space the note says nobody has reviewed them. Each claim ends with a small outlined label, quieter than the sentence.
- Waiting: one truthful line, "Searching approved documents and the web…", because the API returns a single final answer. No step list, no progress bar. Web search is on by default whenever the server reports discovery as available (owner decision, 18 Nov 2026); there is no toggle. If the server reports discovery as unavailable the question is sent without it and the line stays "Finding an answer and its sources…". A private space has no approved documents, so there the line is "Searching the web…", or "Searching your saved pages and the web…" once its owner has a saved page in use.
- My space: the last entry of the school picker, with the hint "Private to you" (or "Sign in to use"). Choosing it the first time creates the space; a line under the composer says it is private.
- My space manager: with the private space selected, the management address shows one small card instead of the school console: the web pages found for the owner's questions, each with Save (the promote action, worded for one person), Refresh and Block. A saved row gains the "Saved by you" chip, a link to the saved copy and one line saying whether answers use it; "Use in answers" is the owner's explicit approval, never sent automatically. There is no domains editor, budget, feedback, document flow or graph tool here, and none of their data is requested.
- Collection management: a "Web pages" card lists cached pages as the same raised rows as document versions, with a Fresh, Stale or Fetch failed chip, the confidence disclosure, and Promote, Refresh and Block. Block opens the inline confirmation used for deleting a conversation, with focus on Keep. Promote sends the page into the normal review flow and says it is not approved yet. The school's own domains are edited beside the list, one per line, with a short note on the accepted format; a name with accented letters is converted to its ASCII (punycode) form before it is sent. Graph relations show their confidence label next to their status.
- Landing and help: the four-step walkthrough and the help answer "Where do answers come from?" say that reviewed documents are checked first, then pages from the web, that every answer shows where each part came from and how sure it is, and that web pages are labelled and never shown as approved. Both follow the language chosen in the composer. No page promises answers from approved documents only.

These strings exist in English and Vietnamese (`ui/i18n.ts`) and contain no em or en dashes.

## Do's and Don'ts

Do preserve drafts and give accurate failure recovery. Do not fabricate sources, metrics, affiliation, authentication, or policy answers. Do not add glossy, metallic or neon effects; clay stays matte.
