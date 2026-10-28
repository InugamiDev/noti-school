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
    fontSize: 2.75rem
    fontWeight: 700
    lineHeight: 1.08
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
  section: 112px
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
- **tertiary-soft (#f6e6dc)** inactive citation chips, icon tiles, "under review" badges.
- **neutral / surface / sunken** page, cards, recessed controls (segmented track, skeletons).
- **sage** positive or approved state only. **danger** errors and unavailable states only.
- **mark (#f6d9b8)** highlights supporting source text. Never decorative.
- Not allowed: beige or cream page backgrounds, gradients on surfaces, a second accent hue, pure-black shadows.

## Typography

Bricolage Grotesque for headings, Hanken Grotesk for interface and body, JetBrains Mono for document locators and keyboard hints. All three ship Vietnamese glyphs. Self-host with @fontsource packages in the app; the Google Fonts link is mockup-only. Headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`. Body line-height stays at 1.6 or more for diacritics.

## Layout

Max width 1200px, 16px gutter on phones and 32px from 720px. Sections are 112px apart. Hero is a split: copy and prompt input left, 3D stage right with the answer card overlapping its lower-left corner (stacks under the stage below 960px). Sections, each with a different arrangement: hero (prompt input with school picker, 3D stage with the answer card overlapping its base), "Every school gets its own sources" (rules list + example account card), how an answer gets made (3 cards), "Built for everyone at a university" (role tabs: students, advisors and staff, source teams, each with a feature list and a mini UI preview), won't-guess split, what it reads bento, "Bring noti.school to your university" (dark panel: 3 numbered steps + request form), filterable FAQ. One section heading per section, no eyebrow labels, no two-line slogans.

## Elevation & Depth

- e1: hairline lift for inputs, chips, secondary buttons.
- e2: cards and the prompt input.
- e3: floating layers (command menu, toasts, mobile sheet).
All shadows are slate-tinted and include an inset top highlight; that highlight is what makes surfaces read as clay.

## Shapes

10px for inputs and inner panels, 18px for cards and the prompt input, 28px for the 3D stage, full pill for buttons, chips, badges and segmented controls. No other radii.

## Components

Built in SolidJS. Styling in Sass (SCSS modules + global tokens), behaviour from headless Kobalte primitives, shadcn/ui anatomy copied from Solid UI where it exists, icons from lucide-solid.

| Component | Built from | Contract |
|---|---|---|
| Button (primary, secondary, ghost, icon, sm, loading) | Kobalte Button | 44px default, 36px small; loading replaces label with spinner and disables |
| Prompt input | Kobalte TextField (textarea) + ToggleGroup + Button | shadcn AI Elements Prompt Input layout; Enter asks, Shift+Enter new line, IME never submits; send disabled when empty; draft and language persist locally |
| Citation chip + source excerpt | Button with aria-pressed | Selecting a chip highlights its passage and moves the 3D pin; copy-citation button gives a toast |
| Answer card states | Kobalte Tabs (demo only) | Answer, loading (real progress text + Stop), no supported answer, unavailable. Unavailable never falls back to a guess |
| Command menu | Kobalte Dialog + Combobox pattern (Solid UI Command) | Cmd/Ctrl+K; arrows, Enter, Esc; unmatched text becomes a question |
| Toast | solid-sonner (Solid UI Sonner) | Bottom centre, 2.6s, polite live region |
| Tooltip | Kobalte Tooltip | 300ms delay, never the only label |
| Accordion (FAQ) | Kobalte Accordion | Live filter that ignores Vietnamese diacritics |
| School picker (in the prompt bar) | Kobalte Popover + Listbox | Searchable; arrows, Enter, Esc; outside click closes; choosing an unavailable school swaps the answer card to a request prompt and moves the 3D scene; choice persists |
| Role tabs | Kobalte Tabs | Arrow keys move; each panel pairs features with a small real-UI preview |
| Request-your-university form | Kobalte TextField + Select | Inline errors with aria-invalid/aria-describedby; nothing is sent until a real endpoint exists |
| Badge, chip, kbd, skeleton, empty state | plain Solid | See components.html |
| Mobile sheet | corvu Drawer or Kobalte Dialog | Focus moves in and returns to the menu button |

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
- Do keep 44px touch targets, visible focus, full keyboard use and AA contrast (verified for every token pair above).
- Don't add gradients, glass, glows, or more 3D on other pages; the hero is the one 3D moment.
- Don't use em or en dashes in copy, arrow glyphs on every link, or eyebrow labels.
- Don't use React or Tailwind; this is SolidJS + Sass.
