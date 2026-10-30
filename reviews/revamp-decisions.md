# Clay revamp: decisions

Campaign noti-clay-revamp-20261030. Inputs: `revamp-critique-fable.md` (Fable, ids `Fx`) and `revamp-critique-opus.md` (Opus, ids `Ox`), both read in full and treated as advice. Binding inputs win over both: `apps/web/design/clay/CONTEXT.md`, `DESIGN.md`, `DESIGN-CONTRACT.md`, AGENTS.md, and the existing Playwright contracts in `tests/web`.

## Input conflict reported up

The ORDER lists "dark mode parity" as a priority. CONTEXT.md item 1 (binding owner decision) says "Light theme only for now", and both critics independently say not to build a dark theme (F15, O32). Resolution: parity is delivered as "a visitor with `prefers-color-scheme: dark` gets the same, correct light experience": no dark pre-paint, matching browser chrome, light native controls. No dark palette is added. If the owner wants a real dark theme, that is a new token set plus a contrast pass per component and should be its own task.

## Findings

| Source | Id | Decision | Justification |
|---|---|---|---|
| Fable | F1 | adapt | Keep the photo (owner asked for one; O8 agrees) but let it carry its own column as a captioned figure, credit under the image, `sizes` matched to the measured column. |
| Fable | F2 | accept | Uniform heading + lede + card grid in every section is the main "generated" tell (O5 measured the same). Steps lose their cards, section spacing drops to 96px desktop / 64px phone. |
| Fable | F3 | accept | Solved by merging the won't-guess example into How (O6); the vertical-centred split disappears. |
| Fable | F4 | accept | Word-art specimen removed; the language row becomes a real row in the reads list. |
| Fable | F5 | accept | Picker opens below (`bottom-start`, flips only when short) so it never covers the headline; options capped at 56px with ellipsis. A separate phone sheet is rejected: one placement change fixes the overlap, and a second picker would double the keyboard contract. |
| Fable | F6 | adapt | Kept one affordance per source ("Open in reader" on the Source card; the reader card appears only after a citation is opened). The real defect fixed: the reader no longer shows a "Sign in" button for a failed passage load (see F7). Merging the reader into the Source card is left for a later pass. |
| Fable | F7 | accept | The aside no longer has its own scroll container; it flows with the page and targets get `scroll-margin-top`. |
| Fable | F8 | adapt | Signed-in users see the account card plus only the modes that apply to them (Redeem invitation, Verify email; Reset password only with a token). Signed-out users see Sign in, Create account, Verify email, Reset password. Redeem needs a session (the code blocks it signed out), so hiding it signed out removes a dead tab. The tab track wraps instead of scrolling. The Google invitation field shows only when Google sign-in is available. |
| Fable | F9 | adapt | Dates use `Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })` and the row shows the short conversation id. Caching first claims is rejected: it would persist answer text outside the existing draft contract. |
| Fable | F10 | accept | Feedback categories and statuses get human labels; "Sources and versions". |
| Fable | F11 | reject | Reordering admin cards and hiding the source form is a layout change for an admin flow covered by repair specs; low impact per effort this round. |
| Fable | F12 | accept | A failed `/me` (5xx, network, unreadable) is now an `unavailable` session state, distinct from signed out (401/403). Header shows a neutral "Account"; answer, history and admin say the account could not be checked and offer no sign-in button. A Retry button was not added; the app already revalidates identity on focus and visibility change. |
| Fable | F13 | adapt | Stage height is already reserved by `aspect-ratio`; the proof row (the 46px shifter) is gone and the pilot notice row keeps a fixed 44px. The size-adjust retune was not attempted. |
| Fable | F14 | accept | 44px for header controls, pilot close and chips; citation chips keep 24px visual with a 44px hit area (O20 agrees). |
| Fable | F15 | accept | `color-scheme` meta light, `theme-color` #f4f5f2, no em dash in title and og:title. This is the dark-mode parity work. |
| Fable | F16 | accept | Stuck nav is opaque; DESIGN.md bans glass. |
| Fable | F17 | accept | Proof row deleted (O11 agrees). The two sample chips stay without the "Try" label, grouped as "Sample questions" for assistive tech. |
| Fable | F18 | adapt | Font weights trimmed (Hanken 500 and 700, JetBrains 500 dropped; labels map to 600). The scene gate is already IntersectionObserver plus idle; making it stricter fails `experience.spec.ts`, which requires the scene at 390px. |
| Fable | F19 | accept | Numbered steps become a list with a terracotta rule, no icon tiles, no cards. |
| Fable | F20 | accept | Unavailable card: title once, body says what is still possible. |
| Fable | F21 | accept | Reader lede and version lines state the one fact that matters. |
| Fable | F22 | adapt | Pill eyebrow removed from every marketing page header. The slogan h1s stay: twelve distinct h1s are pinned by `marketing.spec.ts` and rewriting them is copy work outside this pass. |
| Fable | F23 | adapt | Picker name truncates at 180px with the full name in the title attribute; reordering flex children is rejected because it breaks the DOM-order tab sequence pinned by `experience.spec.ts`. |
| Fable | F24 | accept | FAQ heading "Common questions". |
| Fable | F25 | adapt | Picked O13 over F25: the form stays (its validation is useful and spec-covered) but the button says "Check details", is secondary, and has no send icon. The dark band goes; it was the only dark surface and drew the strongest CTA to a form that sends nothing. |
| Fable | F26 | accept | Account card rows stack label over value under 520px. |
| Fable | F27 | accept | Example account card says "Your school"; HCMIU only in pilot notice and FAQ (O14 agrees). |
| Opus | O1 | adapt | Workspace routes get workspace nav (Ask, Sources, History, and Admin for admins) in the header from 960px and as one row under the bar below it; the footer drops its Workspace column there. The pilot notice hides on workspace routes by route (hiding it when Me resolves shifted the page and failed the CLS budget in `loading.spec.ts`). The rest of the footer stays. |
| Opus | O2 | adapt | The asked question is echoed above the answer card. Clearing the composer on success is accepted. The h1 stays "Your answer" (specs and the focus contract use it). |
| Opus | O3 | accept | Same change as F8. |
| Opus | O4 | accept | Same change as F8: fewer tabs per state, wrapping list, nothing clipped at 390. |
| Opus | O5 | accept | Section h2 at 36px (30px phone); arrangements differ per section. |
| Opus | O6 | accept | How and won't-guess merged: steps list left, no-answer example right. The standalone band is deleted. |
| Opus | O7 | accept | Order: Hero, How, Reads, Scope, Roles, Join, Common questions. |
| Opus | O8 | accept | Bento replaced by a list of four document kinds with mono sample locators beside the photo figure; credit in a figcaption. |
| Opus | O9 | adapt | Answer card overlap reduced (40/48px instead of 48/64px). The hint stays in the stage corner and sprite sizes are unchanged: both are scene changes outside this pass. |
| Opus | O10 | reject | `experience.spec.ts` asserts a moving canvas at 390px and the design contract's QA lists phone canvas evidence; dropping the scene on phones contradicts both. |
| Opus | O11 | accept | Same as F17. |
| Opus | O12 | accept | Next steps become a numbered list, no check marks. |
| Opus | O13 | accept | See F25. |
| Opus | O14 | accept | Footer: "Independent project. Not an official service of any university." Account card labelled as an example. |
| Opus | O15 | accept | Same as F15. |
| Opus | O16 | accept | Below 960px the order is answer, supporting sources, then follow-up (DOM order, so keyboard order matches). |
| Opus | O17 | adapt | Same as F6. |
| Opus | O18 | adapt | With no answer, the aside is hidden and the composer is titled "Ask a question"; the empty state heading stays (spec-pinned). |
| Opus | O19 | accept | Stop uses `CircleStop`. |
| Opus | O20 | accept | Same as F14. Header buttons and pilot close 44px; composer picker 40px; language track 40px with 34px thumbs; sample chips 40px; citation chips keep 24px with a 44px hit area. |
| Opus | O21 | accept | New `--field-border` token (#868f89, 3.33:1 on white) for text fields, selects and search; `--line` stays for dividers. WCAG 1.4.11. |
| Opus | O22 | accept | Stray radii (9, 12, 14px) mapped to `--r-sm`. A stylelint rule is rejected: no new dependencies. |
| Opus | O23 | accept | Sample and demo labels use the neutral badge; clay only means "under review"; unavailable notices are danger. |
| Opus | O24 | accept | Same as F12 for the header; per-panel retry is rejected for this pass (admin repair specs pin the current notices). |
| Opus | O25 | accept | Graph `<details>` gets a chevron; select placeholder "Pick a source to see its versions". Merging Budget and Feedback rejected (spec-pinned headings). |
| Opus | O26 | adapt | Source and history rows drop the terracotta icon tile for a plain muted glyph. The format stays as the existing mono meta line instead of a new badge. |
| Opus | O27 | accept | History header spacing matches Sources. |
| Opus | O28 | accept | Last word and its chip kept together with `nowrap`; the locator is shortened at every width ("Sample Handbook, 2025 · p. 31 · sec. 4.2"). |
| Opus | O29 | accept | When the draft looks Vietnamese and the toggle is English, the bar offers "Answer in Tiếng Việt?". Never auto-switches (both critics agree). |
| Opus | O30 | adapt | When nothing matches, the instruction is replaced by one selectable "Ask “…”" row. It is not added when commands match: `marketing.spec.ts` pins the exact option list for a matching query, and an extra row would steal Enter from a real match. Placeholder "Search or ask"; legend hidden on coarse pointers. |
| Opus | O31 | reject | Disabled controls are exempt from contrast; the reason already sits directly under the button. Low impact. |
| Opus | O32 | accept | No dark theme, `color-scheme: light` stays. See the conflict note above. |
| Opus | O33 | adapt | 64px section spacing below 720px. The pilot line keeps its copy (pinned by `marketing.spec.ts`). |

## Where the critics disagree

- **Join form (F25 vs O13).** O13 chosen. Task flow: the hero's "My university isn't listed" path ends at this form, and its inline validation is the only place a university contact sees what is needed. Truthfulness is solved by the label, not by deleting the form.
- **Phone 3D (F18 vs O10).** F18's direction chosen and narrowed: tests pin the phone canvas, so the scene stays; savings come from fonts.
- **Account page (F8 vs O3/O4).** Both want sign-in hidden when signed in; F8 keeps Verify/Reset as links, O4 moves them under the form. Code evidence decides: Redeem invitation requires a session, so it belongs to the signed-in view.

## Change set, in order

1. `index.html` meta (scheme, theme colour, titles).
2. Tokens: `--field-border`, section spacing token, radius cleanup; fonts trimmed.
3. Landing: proof row out, sample chips kept; How merged with the no-answer example (no cards); Reads as list plus photo figure; Scope as text plus one example account card; Roles keep the preview card only; Join on a light panel with "Check details"; "Common questions"; new order.
   Also found: the photo commit's credit links failed the external-link allowlist in `marketing.spec.ts` (the one baseline failure). The allowlist now names the two attribution URLs the CC BY 2.0 licence calls for.
4. Site shell: opaque sticky nav, 44px controls, workspace nav on app routes, pilot notice hidden when signed in, footer affiliation line.
5. Session `unavailable` state, wired to header and answer view.
6. Answer view: question echo, cleared composer, sources before follow-up on phones, aside without inner scroll, no duplicate reader affordance, CircleStop, unavailable copy.
7. Auth: per-state modes, wrapping tabs.
8. Sources, History, Admin: row badges, dates, labels, details chevron, copy.
9. UI kit: prompt input (language suggestion, 40px controls, truncation), school picker placement, command menu ask row, badge tones, field borders, chip sizes.
10. DESIGN.md updated to match.
