# Clay a11y / UX adversarial review (campaign noti-clay-20261028b)

Reviewer worktree: `/tmp/fleet-wt/noti-clay-20261028b-1239-2751514`, HEAD `69b5bf0`, base `FLEET_BASE_SHA=af5a30f3`.
Scope: WCAG 2.2 AA, keyboard paths, reduced motion, 390px overflow and long Vietnamese strings, copy truthfulness, reference parity, dash ban.
I ran everything below myself. I did not rely on implementer handoffs.

## Verdict

No critical or high findings. The integrated build passes and the Playwright suite passes (122/122 expected). I confirmed one medium focus-management bug and one medium layout/parity defect. The remaining findings are low.

## Findings

| # | Severity | File:line | Concrete failure scenario | Evidence |
|---|---|---|---|---|
| 1 | medium | `apps/web/src/App.tsx:455` (with `apps/web/src/ui/CommandMenu.tsx:85-90`) | WCAG 2.4.3 Focus Order. A keyboard user focuses the question box, presses Ctrl+K, types `tiếng` and presses Enter. The language switches, the dialog closes, and focus lands on `<body>`. When `CommandMenu` has a pending action it skips `opener?.focus()` and runs the action. `toggleLanguage` only calls `setLanguage` and never moves focus. The next Tab starts from the top of the document. Other commands are fine: Help moves focus to the H1, FAQ to `#faq-title`, Change university to the picker search. | Probe `cmd2.spec.ts` (textarea focused before Ctrl+K): `language active= cl-31-language` → `language -> url http://localhost:3319/#/ dialogs 0 focus BODY`. |
| 2 | medium | `apps/web/src/ui/PromptInput.module.scss:131` (shown by `apps/web/src/landing/Landing.module.scss:54-63` hero column) | Reference-parity and UX defect. At widths where the hint is visible (≥ xs) and the bottom bar wraps, the rule `.hint ~ .send { margin-left: 0 }` drops the round send button onto its own row, left-aligned under the school picker. In the reference (`reference/clay.css:155-156`, `.prompt-bar` has no wrap) the button stays at the right end of the bar. This happens at 1024px with a short school name, and at 1440px with the long fixture name. | Probe `bar.spec.ts` with name `HCMIU`: `1024 send top=626 left=45 \| picker top=580 \| sameRow=false`. At 1280/1440/1920 `sameRow=true`. Screenshot `tests/web/artifacts/desktop-viewport.png` (1440, long name `Demo university · synthet…`) shows the send button alone at bottom-left. The rule is in `ui/**`, so the UI-kit owner has to change it. |
| 3 | low | `apps/web/src/site/SiteShell.tsx:32-35, 100-105`; auth tabs and footer links | DESIGN.md:222 says to keep 44px touch targets. At 390px: `Open menu` is 36×36, `Dismiss notice` 36×36, `Sign in` 71×36, auth mode tabs are 34px tall, footer links 36px tall, and the `Ask your own question` / `Browse available documents` text links are 26px tall. WCAG 2.2 AA 2.5.8 (24px minimum) passes everywhere: the smallest targets are the citation chips at exactly 24×24. Only the project's 44px rule is not met. `size="sm"` buttons (36px) follow DESIGN.md:192 and the reference (`.btn-sm --h: 36px`; pilot close `--h: 32px`), so the design documents contradict themselves. | Probe `a11y.spec.ts` SMALLTARGETS at 390 `#/`: `36x36 <button> Dismiss notice`, `36x36 <button> Open menu`, `41x30 / 36x30` language toggles (ui base), `40x40 <button> Ask` (ui base, has a 44px `::after` hit area). |
| 4 | low | `apps/web/src/landing/Hero.tsx:78-80`; `apps/web/src/App.tsx:426` | WCAG 3.1.2 Language of Parts. With Tiếng Việt selected, the Vietnamese placeholder `Hỏi về hạn chót, biểu mẫu hoặc quy định` is inherited as `lang="en"`, so screen readers speak it with English phonetics. The follow-up composer placeholder has the same problem. Inline mentions of `Tiếng Việt` in English sentences (landing roles list, `/students` help paragraph) also lack `lang="vi"`. That is borderline, because a single language name is a common exception. | Probe `lang2.spec.ts`: `placeholder=Hỏi về hạn chót, biểu mẫu hoặc quy định lang=en own=null`. Probe `lang.spec.ts`: `<span class=""> English or Tiếng Việt, any time…`, `<p class=""> Choose English or Tiếng Việt in the question box…`. |
| 5 | low | `apps/web/src/landing/landing.ts:222` | Truthfulness wording, plausible and not a hard violation. `coverage: 'synthetic_demo'` maps to an **Available** badge, while `approved_sources` maps to **Pilot**. In the school picker, a synthetic demo collection therefore looks more "available" than one with real approved sources. The subtitle `Demo collection, synthetic examples only` does disclose it. | Code read. The picker renders `school.status === 'pilot' ? 'Pilot' : 'Available'` (`ui/SchoolPicker.tsx:126-127`). |
| 6 | low | `apps/web/src/landing/Sections.tsx:349-350` | A production landing visibly ships a design placeholder badge, `Photo needed: real handbook, 1200 × 900`, in the "What it reads" card. This matches the reference mockup (`reference/index.html:397`), so it is a parity carry-over, not a regression. It is still unfinished content in front of users. | Screenshot `tests/web/artifacts/marketing/home-desktop.png` ("What it reads" section). |

### Checked and found clean (verified, no finding)

- **Contrast.** I computed every token pair the diff uses (`contrast.mjs`). All text pairs are ≥ 4.5:1: muted/page 5.79, faint/sunken 4.47 (used only for non-text or large text; the DOM audit found no failing text), clay/clay-soft 4.95, `#3c5a4b`/sage-soft 6.27, `#8a3517`/clay-soft 6.64, footer `#b8c0c4`/ink 8.41, color-mix sage→ink 6.97 and danger→ink 7.48. A DOM text-contrast audit over 12 routes × {1440, 390} reported **zero** text below 4.5:1 (3:1 for large). It skips elements over gradient or image backgrounds. `sage` on page (4.13) and on sage-soft (3.72) are used only for icons (`Landing.module.scss:142,477`), which need 3:1 and pass.
- **Focus visibility.** The global `:focus-visible` gives a 2px `--clay` outline, 5.5:1 on page. Dark bands override it to `#f0b8a0` (8.9:1 on ink). Every `outline: none` in the diff applies to programmatic-focus headings (`tabIndex=-1`) or to textareas that switch to a clay border. The source reader keeps a `:focus-visible` ring. A sticky-header obscuring probe found no focused element hidden under the nav (`scroll-padding-top: 88px`).
- **Keyboard paths.** Ctrl+K opens the menu with focus in the combobox. Arrows move `aria-activedescendant`. Escape closes the menu and restores focus. Enter runs commands. `/` focuses the question. SchoolPicker: Enter opens it with focus in search, ArrowDown and Enter choose, and focus returns to the trigger. Tabs: ArrowRight moves and selects. FAQ Accordion: Enter expands, and the filter ignores diacritics (`tieng viet` → "Can I ask in Vietnamese?"). Mobile Sheet: Enter opens it with focus on Close, Tab stays trapped for 40 presses, and Escape returns focus to `Open menu`.
- **IME.** Enter with `isComposing: true`, and the Safari-order `compositionend` followed by Enter (keyCode 229), sent no POST and did not navigate. Shift+Enter inserted `\n`.
- **Reduced motion.** With `prefers-reduced-motion: reduce`, `document.getAnimations()` had no running animations, `data-motion="off"`, and `scroll-behavior: auto`. The suite's reduced-frame stability tests pass.
- **390px overflow.** With a 150-character Vietnamese institution name, `scrollWidth == 390` on all 12 audited routes and no element extends past the viewport.
- **Truthfulness.** The sample answer carries the badge `Sample handbook, not HCMIU policy`. The reference's `Verified` account badge was changed to `Invited`. There is no `verified` answer label: statuses are `Answer with sources` / `Answer with limitations` / `Not enough evidence`. The join form says `Nothing is sent from this form yet` and shows a not-sent status and toast. Feedback shows success only after `post()` resolves. FAQ, footer and marketing pages disclaim affiliation and partnership. I found no invented deadlines, offices or partner universities in the diff.
- **Dash ban.** There is no em or en dash in any changed `.ts/.tsx/.scss` file. `apps/web/index.html:14,19` contains `—`, but that file is unchanged from base and the runtime overwrites `document.title` with `·`. The `og:title` meta still has the em dash, which is base debt outside this diff.
- **Known suite annotation.** `experience.spec.ts:75` is marked `test.fail` for the hero3d sprite-geometry dispose leak. It shows as ✘ in the list output but counts as expected. This is outside a11y scope and noted for completeness.

## Commands run

| Command | Result |
|---|---|
| `git diff $FLEET_BASE_SHA --stat` | 51 files, +6607/−4335 (apps/web/src app/landing/site, tests/web) |
| `pnpm --filter @noti/web build` (first attempt) | exit 1: `Cannot find module …/typescript/bin/tsc` (worktree node_modules not installed) |
| `pnpm install --frozen-lockfile --offline` | `Done in 1.2s` (node_modules only; `git status` clean) |
| `pnpm --filter @noti/web build` | exit 0, `✓ built in 8.08s` (warning only: `scene-*.js` 552.93 kB chunk > 500 kB) |
| `cd apps/web && pnpm exec playwright test` | exit 1: `http://localhost:3304 is already used` (sibling worktree `…-1238` vite preview, pid 3241023) |
| `pnpm exec playwright test -c /tmp/clay-a11y-1239/pw.config.ts` (repo config copied outside the repo, port changed 3304→3317, absolute testDir/outputDir) | exit 0, `122 passed (5.2m)`; results.json stats `expected 122, unexpected 0, flaky 0, skipped 0` |
| `pnpm exec playwright test -c /tmp/clay-a11y-1239/probe.config.ts kbd` | 7 passed; outputs quoted above (command menu, `/`, IME, picker, FAQ, sheet, tabs, reduced motion) |
| `… probe.config.ts cmd2` (textarea focused first) | language command → `focus BODY` (finding 1) |
| `… probe.config.ts a11y` (first run) | 6 failed: probe bug parsing `color(srgb …)` from `color-mix`; fixed in probe |
| `… probe.config.ts a11y` (rerun) | exit 0, 24 passed; LOWCONTRAST empty and OVERFLOW empty for all routes at 1440 and 390; SMALLTARGETS listed in finding 3 |
| `… probe.config.ts obscure` | 2 passed; only hits were the pilot banner above the nav (probe false positive), no obscured focus |
| `… probe.config.ts lang` / `lang2` | findings 4 outputs |
| `… probe.config.ts bar` | finding 2 outputs (1024 wraps; 1280/1440/1920/390 same row with a short name) |
| `node /tmp/clay-a11y-1239/contrast.mjs` | token pair ratios quoted above |
| Screenshot inspection | `desktop-viewport.png`, `mobile-viewport.png`, `marketing/home-desktop.png`, `marketing/mobile-navigation-open.png`, `clay-answer-supported-390.png` |

Probe specs and configs live in `/tmp/clay-a11y-1239/` outside the repo. The only repo file I wrote is this report.
