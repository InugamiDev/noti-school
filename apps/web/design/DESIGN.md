# noti.school design system: Clay

The token source of truth is [clay/DESIGN.md](clay/DESIGN.md); owner decisions are in [clay/CONTEXT.md](clay/CONTEXT.md). The working static mockup is `clay/reference/`. This file describes how the system is built in `apps/web`.

## Look

Clean, minimal, tactile light theme. Warm off-white page, white surfaces, slate ink, one clay accent (`--clay`) for primary actions and citations, sage for supported states. Light theme only for now (`color-scheme: light`). Pill buttons, chips and badges are by design. No gradients, glass or glow on surfaces; depth comes from the slate-tinted elevations `--e1`, `--e2`, `--e3`.

## Tokens

Defined once in `src/styles/_tokens.scss` and emitted on `:root`:

- Colour: `--page --surface --sunken --ink --muted --faint --line --line-strong --clay --clay-hover --clay-soft --on-clay --sage --sage-soft --mark --danger --danger-soft`
- Type: `--font-display` (Bricolage Grotesque), `--font-body` (Hanken Grotesk), `--font-mono` (JetBrains Mono)
- Radius: `--r-sm --r-md --r-lg --r-full` (also SCSS `$r-*` and `$radii`)
- Elevation and focus: `--e1 --e2 --e3 --ring`
- Motion and layout: `--ease --t-fast --t-med --max`
- SCSS only: `$breakpoints` (520, 720, 860, 960, 1000px as `xs sm md lg xl`)

Components read tokens through `var(--token)`. Do not hard-code colours that have a token.

## Sass architecture

- `src/styles/global.scss` forwards `_tokens`, `_mixins`, `_base`, `fonts`; it is imported once from `src/main.tsx`.
- `_mixins.scss`: `focus-ring`, `visually-hidden`, `reduced-motion`, `respond-to($bp)` (min-width), `clay-elevation(1|2|3)`.
- `_base.scss`: reset, body, headings, `::selection`, `.skip` link, `.sr-only`, reduced-motion floor.
- Each component owns a `Component.module.scss` next to its `.tsx`, with `@use` of the mixins by relative path. Typings for `*.module.scss` come from `src/vite-env.d.ts`.
- The legacy `src/style.css` still loads after the global styles until later tasks remove it.

## Behaviour primitives

Interactive widgets (dialog, popover, select, toggle group, tabs, tooltip, accordion, command menu) use headless `@kobalte/core` primitives styled with the module SCSS. Toasts use `solid-sonner`. Icons come from `lucide-solid` and supplement visible labels. The hero scene is the only Three.js use, lazily imported.

## Fonts

Self-hosted through npm packages imported in `src/styles/fonts.scss`; no runtime CDN or Google Fonts link. Bricolage Grotesque is the variable package (wght axis, covers 500 and 700); Hanken Grotesk 400/500/600/700; JetBrains Mono 400/500. The Latin, Latin Extended and Vietnamese subsets ship, so Vietnamese diacritics render in the intended face.

## Accessibility

WCAG 2.2 AA contrast, visible focus (`focus-ring`), 44px targets for primary controls, full keyboard operation, `prefers-reduced-motion` respected through the `reduced-motion` mixin and the base floor. Status is never colour alone.

## Do's and don'ts

Do keep example content labelled "Sample handbook, not HCMIU policy" and write copy for every university ("your school"). Do not invent regulations, deadlines, offices, partners or affiliation. No em or en dashes in user-facing copy.
