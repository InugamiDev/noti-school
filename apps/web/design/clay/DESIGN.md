---
version: alpha
name: noti.school / Clay
description: Multi-university, per-school scoped. Clean, minimal clay. Slate-stone neutrals, one terracotta accent, soft tactile surfaces, a product-meaningful 3D hero.
colors:
  primary: "#1e2529"
  secondary: "#56616a"
  faint: "#636e75"
  tertiary: "#a8431f"
  tertiary-hover: "#8f3818"
  tertiary-soft: "#f6e6dc"
  on-tertiary: "#ffffff"
  neutral: "#f4f5f2"
  surface: "#ffffff"
  sunken: "#eceee9"
  line: "#dfe2dc"
  line-strong: "#c9cec6"
  field-border: "#868f89"
  sage: "#5f7d6e"
  sage-soft: "#e3ebe5"
  mark: "#f6d9b8"
  danger: "#b42318"
  danger-soft: "#fdebe9"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontSize: 4.25rem
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.035em
  h2:
    fontFamily: Bricolage Grotesque
    fontSize: 2.25rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.022em
  h3:
    fontFamily: Bricolage Grotesque
    fontSize: 1.25rem
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.015em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 0
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 1.125rem
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0
  label:
    fontFamily: Hanken Grotesk
    fontSize: 0.8125rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  locator:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
rounded:
  sm: 10px
  md: 18px
  lg: 28px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  section: 96px
  section-phone: 64px
components:
  page:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 18px
  button-primary-hover:
    backgroundColor: "{colors.tertiary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    height: 44px
  button-ghost-hover:
    backgroundColor: "{colors.sunken}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: 24px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    borderColor: "{colors.field-border}"
    rounded: "{rounded.sm}"
    height: 44px
  prompt-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 16px
  prompt-input-send:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.full}"
    size: 40px
  segmented:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.full}"
  citation-chip:
    backgroundColor: "{colors.tertiary-soft}"
    textColor: "{colors.tertiary}"
    rounded: "{rounded.full}"
    size: 24px
  citation-chip-active:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
  evidence-mark:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.primary}"
  badge-label:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.secondary}"
  badge-approved:
    backgroundColor: "{colors.sage-soft}"
    textColor: "{colors.sage}"
  badge-error:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  divider:
    backgroundColor: "{colors.line}"
  divider-strong:
    backgroundColor: "{colors.line-strong}"
  meta-text:
    textColor: "{colors.faint}"
    typography: "{typography.locator}"
---

## Overview

Clean, minimal clay. A cool slate-stone page, white surfaces that feel slightly pressed out of clay (soft slate-tinted shadow plus a 1px top highlight), and one terracotta accent that only ever means "act" or "this is the evidence". Whitespace does the organizing; there is no decoration that the product does not explain.

Product framing: noti.school is for every university, and each account belongs to exactly one school. Answers use only that school's approved documents; schools never see each other's documents, questions or feedback. HCMIU is the first pilot, not the whole audience. Never name other real universities as partners or upcoming schools.

The 3D hero tells that story: one clay bookstack per university on a shared plinth with grooves between them. The reader's school is in colour with an open page and a citation pin that moves to the cited line; another school sits under a padlock; an empty slot with a + waits for the next university and fills with colour when selected. It is never decorative noise.

Reference implementation: `.handoff/clay/index.html` (landing), `.handoff/clay/components.html` (component contract), `clay.css`, `ui.js`, `hero3d.js`.

## Colors

- **primary (#1e2529)** slate ink for text. **secondary (#56616a)** for supporting text. **faint (#636e75)** only for metadata, hints and placeholders (passes AA on page and surface).
- **tertiary (#a8431f)** terracotta: primary button, active citation, focus ring, links. One filled clay control per view.
- **tertiary-soft (#f6e6dc)** inactive citation chips, step numbers, "under review" badges. Never sample, demo or draft labels: those use the neutral badge (sunken + secondary), so terracotta keeps its two meanings.
- **field-border (#868f89)** the boundary of text fields, selects and search boxes: 3.33:1 on surface, 3.04:1 on page (WCAG 1.4.11). Hover darkens to secondary. **line** is for dividers only.
- **neutral / surface / sunken** page, cards, recessed controls (segmented track, skeletons).
- **sage** positive or approved state only. **danger** errors and unavailable states only.
- **mark (#f6d9b8)** highlights supporting source text. Never decorative.
- Not allowed: beige or cream page backgrounds, gradients on surfaces, a second accent hue, pure-black shadows.

## Typography

Bricolage Grotesque for headings, Hanken Grotesk for interface and body, JetBrains Mono for document locators and keyboard hints. All three ship Vietnamese glyphs. Self-host with @fontsource packages in the app; the Google Fonts link is mockup-only. Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`. Body line-height stays at 1.6 or more for diacritics.

Weights shipped: Hanken 400 and 600, JetBrains Mono 400, Bricolage variable. Labels and emphasis (`strong` included) use 600. CSS asks only for shipped weights: a missing weight is silently resolved to a neighbour or, for a heavier mono weight, faux-bolded, so do not add a weight without a component that needs it. While a web font loads, text uses a metric-matched local fallback (Arial, or DejaVu Sans where Arial is missing) so the swap does not rewrap headings; font-swap layout shift on `#/` stays under 0.02 at 390x844 and 1440x900.

Scale: hero h1 68px (40px phone). Section h2 36px (30px phone); only the hero is larger. Card titles 18 to 20px. Body 16px, ledes 17px, meta 13px, locators 12px mono.

## Layout

Max width 1200px, 16px gutter on phones and 32px from 720px. Sections are 96px apart (64px below 720px, token `--section`). Hero is a split: copy and prompt input left, 3D stage right with the answer card overlapping only the plinth's base (stacks under the stage below 1000px).

Landing order and arrangement. No two sections share an arrangement, and only content that is a real UI state sits in a card:

1. Hero: headline, lede, prompt input, two sample question chips (no "proof row" of icon claims), 3D stage with the sample answer card.
2. "How an answer gets made": a numbered list with hairline rules (no cards, no icon tiles) beside the no-answer example card, captioned. This section also carries "it won't guess"; there is no separate band for it.
3. "What it reads": four document kinds as rows with a mono sample locator each, beside the credited photo figure.
4. "Every school gets its own sources": rules as a plain list beside one example account card labelled "Example account".
5. "Built for everyone at a university": role tabs; each panel is a plain feature list plus one small real-UI preview card.
6. "Bring noti.school to your university": a light sunken panel, 3 numbered steps and the request form (the only card).
7. "Common questions": filterable FAQ.

One section heading per section, no eyebrow labels (marketing page headers included), no two-line slogans, no word art.

### Photography

One stock photo, used where it supports the "what it reads" section: a `<figure>` at 4:5 from 960px and 3:2 below, `object-position` keeping the open pages in frame, 18px radius, e2. The credit (author, licence, link) is a visible `<figcaption>` under the image, never overlaid, and says the photo is illustrative, not a university document. `sizes` must match the rendered column. Credits live in `src/assets/photos/CREDITS.md`. Never present stock imagery as a partner university, its documents or its students.

### Site shell

Sticky nav is opaque (`--page`) with a hairline when scrolled. Marketing routes show How it works, Who it's for, For universities, Help. Workspace routes (answer, sources, history, admin, account) show Ask (the answer page, `#/answer`), Sources, History and, for admins, Admin, with `aria-current` on the current one; the footer drops its Workspace column there, and below 960px the same links sit in one row under the bar. The pilot notice is marketing chrome: it hides on workspace routes (by route, not by identity, so resolving Me never shifts the page). Header controls are 44px. The pilot notice row is 44px high and its text wraps to at most two lines inside it on phones, so wrapping never changes its height. The account control reads "Sign in" (filled) only when the visitor is known to be signed out; while identity is unknown it is a same-size placeholder, and during an identity outage it is a neutral "Account".

### Workspace

The answer page echoes the asked question (sunken bubble, right-aligned) above the answer card and clears the composer once the answer arrives. Below 960px the order is answer, supporting sources, follow-up composer; from 960px sources take the right column and flow with the page (no inner scroll container). Before anything is asked it is one centred column with the composer. List rows (sources, history) use a plain muted glyph, not an icon tile. Dates use the reader's locale with a month name (`dateStyle: 'medium'`). Identity outages say "could not be checked", never "not signed in", and never offer a sign-in button for a failure that is not about access.

## Elevation & Depth

- e1: hairline lift for inputs, chips, secondary buttons.
- e2: cards and the prompt input.
- e3: floating layers (command menu, toasts, mobile sheet, school picker).
All shadows are slate-tinted and include an inset top highlight; that highlight is what makes surfaces read as clay.

## Shapes

10px for inputs, inner panels, kbd and small tiles, 18px for cards, the prompt input and the photo, 28px for the 3D stage and the join panel, full pill for buttons, chips, badges and segmented controls, 50% only for avatars and dots. No other radii (skeleton text lines and the 2 to 4px evidence mark are the only exceptions).

## Components

Built in SolidJS. Styling in Sass (SCSS modules + global tokens), behaviour from headless Kobalte primitives, shadcn/ui anatomy copied from Solid UI where it exists, icons from lucide-solid.

| Component | Built from | Contract |
|---|---|---|
| Button (primary, secondary, ghost, icon, sm, loading) | Kobalte Button | 44px default. Small keeps a 36px visual box but still has a 44x44px hit area (a transparent centred `::before`, `hit-area` mixin). Loading replaces label with spinner and disables |
| Prompt input | Kobalte TextField (textarea) + ToggleGroup + Button | shadcn AI Elements Prompt Input layout; Enter asks, Shift+Enter new line, IME never submits; send disabled when empty; draft and language persist locally. Bar controls: picker 40px, language track 40px with 34px thumbs, send 40px with a 44px hit area. The bar is one row from 520px: the picker trigger truncates (min-width 0) before anything wraps. When the draft reads as Vietnamese and English is selected, a dashed "Answer in Tiếng Việt?" chip offers the switch; it never switches silently, and it sits on the box's top edge (out of the bar's flow, after the language toggle in Tab order) so it never adds a row mid-typing |
| Citation chip + source excerpt | Button with aria-pressed | Selecting a chip highlights its passage and moves the 3D pin; copy-citation button gives a toast. Disclosures (the reader's "Read source passage", admin graph) use a chevron that turns when open |
| Answer card states | Kobalte Tabs (demo only) | Answer, loading (real progress text + Stop), no supported answer, unavailable. Unavailable never falls back to a guess |
| Command menu | Kobalte Dialog + Combobox pattern (Solid UI Command) | Code loads when the browser is idle or on first open, outside the initial bundle; Cmd/Ctrl+K; arrows, Enter, Esc; placeholder "Search or ask"; text that matches nothing becomes one selectable "Ask “…”" row; the key legend hides on coarse pointers |
| Toast | solid-sonner (Solid UI Sonner) | Bottom centre, 2.6s, polite live region; sonner loads when idle or with the first toast |
| Tooltip | Kobalte Tooltip | 300ms delay, never the only label |
| Accordion (FAQ) | Kobalte Accordion | Live filter that ignores Vietnamese diacritics |
| School picker (in the prompt bar) | Kobalte Popover + Listbox | Opens below the bar (flips only when space runs out) so it never covers the headline; trigger truncates at 180px with the full name as its title; options at most 56px; searchable; arrows, Enter, Esc; outside click closes; choosing an unavailable school swaps the answer card to a request prompt and moves the 3D scene; choice persists |
| Role tabs | Kobalte Tabs | Arrow keys move; each panel pairs features with a small real-UI preview |
| Request-your-university form | Kobalte TextField + Select | Inline errors with aria-invalid/aria-describedby; nothing is sent until a real endpoint exists, so the button is a secondary "Check details" with no send icon |
| Account page | Kobalte Tabs + TextField | Signed out: Sign in, Create account, Verify email, Reset password. Signed in: the account card plus Redeem invitation and Verify email (Reset password only with a reset link). Never a sign-in form for a signed-in visitor. The tab track wraps on phones |
| Badge, chip, kbd, skeleton, empty state | plain Solid | See components.html |
| Mobile sheet | corvu Drawer or Kobalte Dialog | Focus moves in and returns to the menu button; loads like the command menu |

Quality-of-life rules: `/` focuses the question, Cmd/Ctrl+K opens the command menu, the pilot notice can be dismissed and stays dismissed, the question draft survives reloads, sample questions in Vietnamese switch the answer language, every async action has a visible pending state, and every copy action confirms with a toast.

### 3D hero (Three.js, already a dependency)

- Load as a separate island via dynamic `import()` once the hero is visible and the browser is idle; the text and prompt input must paint first.
- Scene: a rounded plinth split into three school slots. Locked school (grey stack + padlock), reader's school (terracotta/sage/sand stack, label sprite, open page with evidence strips and the citation pin), next-school slot (translucent stack + "+" sprite). Listens for `noti:cite` and `noti:scope` events. Materials: MeshPhysicalMaterial, roughness about 0.78, light sheen, no metalness. Soft PCF shadows on a ShadowMaterial ground.
- Camera auto-fits the bounding sphere and uses `setViewOffset` to shift the scene toward the top right so the answer card does not cover the page.
- Pointer parallax and slow idle motion only. Pause when off-screen or the tab is hidden. With `prefers-reduced-motion`, render single frames on state change only.
- DPR capped at 2, `powerPreference: low-power`, a static fallback if WebGL fails. Target: the 3D chunk stays out of the initial bundle.

## Do's and Don'ts

- Do keep one filled terracotta control per view.
- Do give every state a design: loading, empty, no answer, unavailable, error.
- Do label example content "Sample handbook, not HCMIU policy" and never invent university rules, deadlines, offices, email formats, partners or affiliation.
- Do write copy for any university ("your school", "your university"); mention HCMIU only as the current pilot.
- Do keep 44px touch targets, visible focus, full keyboard use and AA contrast (verified for every token pair above). Sub-44px visuals (small buttons, citation chips, sample chips, segmented thumbs) carry a 44x44px hit area through the `hit-area` mixin (a transparent centred pseudo-element); adjacent segmented thumbs grow outward so neither covers the other. Footer links are 44px rows below 720px.
- Do keep the light theme for visitors who prefer dark: `color-scheme` and `theme-color` declare light so there is no dark pre-paint or dark browser chrome over a light page. A dark theme is a separate, owner-approved task (CONTEXT.md item 1).
- Don't add gradients, glass, glows, or more 3D on other pages; the hero is the one 3D moment.
- Don't use em or en dashes in copy (the document title included), arrow glyphs on every link, or eyebrow labels.
- Don't add icon tiles to lists, numbered three-card rows, bento grids, proof rows of icon claims or a dark CTA band: these read as a template.
- Don't use React or Tailwind; this is SolidJS + Sass.
