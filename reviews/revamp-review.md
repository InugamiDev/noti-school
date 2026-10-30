# Clay revamp: independent adversarial review

Campaign noti-clay-revamp-20261030. Worktree HEAD `26f93eb` reviewed against base `1faa96b` (`clay/port`). Nothing in the handoff or in `revamp-decisions.md` was taken on trust: every accepted decision was checked in the built app (Vite preview on 127.0.0.1:4799, Chromium 1.63 via Playwright with SwiftShader WebGL), with `/api/**` routed to the synthetic fixtures from `tests/web/workspace-clay.spec.ts` widened to an admin role plus versions, chunks, budget, feedback and graph fixtures. Captures: 118 screenshots at 1440x900 and 390x844, light and dark, signed-in admin, signed-out, identity-outage and API-down states, plus picker, command menu, prompt, sheet, hover, focus, long-name and loading states, in `/tmp/revamp-review/shots` (outside the worktree). Measurements in `/tmp/revamp-review/measurements.json` and `follow.json`. No code was edited.

## 1. Verdict

The revamp does what the decisions document says in almost every row, and the result is visibly less templated than the base: no proof row, no bento, no word art, no icon tiles, no numbered three-card row, no dark CTA band, one card per section at most, 36px section headings, varied arrangements, a captioned 4:5 photo figure, workspace nav on app routes, question echo, cleared composer, honest identity-outage copy, and a selectable "Ask" row in the command menu. All 133 Playwright tests pass, typecheck and the 81 unit tests pass, and the landing now transfers 441 KB with 7 font files instead of the base's 498 KB with 12.

What is left is small: one copy claim that the product's own admin form contradicts (official URL sources exist, the landing says web pages are never used), one accepted fix (F23, long school names) that does not actually stop the composer bar from wrapping, one disclosure with no affordance in the citation reader, and a handful of touch targets that are still narrower than the 44px the design promises. Nothing found is a blocker.

## 2. Findings

Severity: critical | high | medium | low. "Evidence" names the capture or measurement. Items marked *plausible* were not fully proven.

| # | Severity | Where | Concrete failure | Evidence |
|---|---|---|---|---|
| R1 | medium | `apps/web/src/landing/Sections.tsx:116` ("What it reads" lede) | Copy says "Web pages and other schools' files are never used." The product has a `url` source kind ("Official URL" in the admin New source form, `Source.kind` enum `pdf | text | url` in `packages/contracts/src/index.ts:23`), so approved official web pages are a supported source. The base copy ("Nothing from the open web") was defensible; the rewrite overclaims a restriction the product does not have. AGENTS.md and CONTEXT.md forbid untruthful product claims. | `landing-desk-light.s1.png`; `admin-desk-light.s0.png` shows the Format select with PDF / Text / Official URL and the "Original URL (for URL sources)" field. |
| R2 | low | `#/` 1440, prompt bar; decision F23 ("adapt") | With a 83-character Vietnamese university name the trigger truncates at 180px and carries the full name in `title` (done), but the bar still wraps to two rows (100px instead of 50px): picker and language on row one, hint and send on row two. This is exactly the condition F23 described; the decision implies truncation fixes it. Bar width 517px, segmented 157px, end group 139px; the trigger's flex basis is not clamped by its `max-width`, so wrapping happens before the clamp applies. | `longname-desk.png`; `follow.json` `bar:Trường Đại h` barH 100 vs `bar:Synthetic Un` barH 50. |
| R3 | low | `#/answer` after "Open in reader", `apps/web/src/Sources.tsx:328` | The reader card's `<details>` summary "Read source passage" renders as a bold line with no chevron, no "Show" text and the default marker removed by `display: flex` (`Page.module.scss:280`). The admin graph `<details>` got a chevron (O25); this one did not, so it looks like an orphan heading, which is what F6 and O17 complained about. The reader still repeats title, locator, badge and the same passage directly under the Source card (documented as deferred in F6/O17, but the summary affordance is a new inconsistency). | `answer-citation-open-desk-light.png`. |
| R4 | low | 390, all routes with the composer | Language toggle thumbs have effective hit areas of 43x44 (EN) and 38x44 (VI): the `::after` inset is `-5px -1px`, so width stays under 44. Citation chips have a 32x44 hit area (`inset: -10px -4px`), not the 44x44 claimed in F14/O20 ("44px hit area"). "Copy citation" is a 36x36 icon button with no hit extension. DESIGN.md: "Sub-44px visuals ... carry a 44px hit area via `::after`". | `measurements.json` `routes.phone-light.landingTargets` / `answerTargets`. |
| R5 | low | 390, footer on every route | 16 footer links are 36px tall; "System reduced motion" is 36px. Not in the decisions, but Fable F14 listed footer links and the design rule is 44px on phones. | `landingTargets` phone: `Product … Terms` w167 h36. |
| R6 | low | `#/` composer, both viewports | When a Vietnamese-marked character is typed with English selected, the dashed "Answer in Tiếng Việt?" chip is inserted into the bar and the bar grows from 50px to 100px, pushing the send button and the sample chips down 50px mid-typing. The suggestion itself works and never auto-switches (verified). Note the detector only fires on Vietnamese-specific letters (ạ, ơ, đ …), not on plain acute or grave vowels ("Khi nào" alone does not trigger). | `prompt-vietnamese-desk.png`; `measurements.json` `interact.desk.vnSuggest.barHeight` 100 vs normal 50. |
| R7 | low | Workspace nav, `apps/web/src/site/SiteShell.tsx` `workspaceLinks` | "Ask" points to `#/` (the marketing landing with pilot notice and all sections), and on `#/answer` no workspace link carries `aria-current`, so the current section is never highlighted on the main workspace screen. The page already has a "New question" link to `#/`. | `follow.json` `navCurrent:1440` and `:390` (all `aria-current` null on `#/answer`); `answer-answered-phone-light` crop shows no highlighted link. |
| R8 | low | `#/` 390 pilot notice; decision F13 | The decision says the notice "keeps a fixed 44px". At 390 the text wraps to two lines and the row is 46.19px; the close button still appears in the 196ms layout-shift entry. CLS is 0.069 on phone (base critics measured 0.068 to 0.088) and 0.025 on desktop, so no regression, but the claim is inexact. | `measurements.json` `perf.phone.shifts[0]` nodes `MAIN, #text, BUTTON.site-pilot-close`; `follow.json` `pilot.h` 46.19. |
| R9 | low | Identity outage, `#/auth` | With `/me` returning 503 the header correctly shows the neutral "Account", but `#/auth` renders the signed-out tab set (Sign in, Create account, Verify email, Reset password) with no notice that identity could not be checked (the notice "Sign-in availability is not confirmed" appears only when capabilities also fail). Header and page disagree about what is known. *Plausible* UX issue; no spec pins either behaviour. | `auth-desk-medown.png`; `measurements.json` `states.desk-medown.auth`. |
| R10 | low | `apps/web/src/styles/fonts.scss`, decision F18 | Weights trimmed to Hanken 400/600 and Mono 400, but CSS still requests Hanken 500 on 10 elements (nav links, chips, tooltip, `site.scss:151,172,417`), Hanken 700 on 9 (`strong`, fonts.scss:22) and JetBrains Mono 500/600 on the citation chip digits and kbd hints. Hanken resolves cleanly (500 to 400, 700 to 600, no synthesis). JetBrains Mono 600 on the citation chip digits (`CitationChip`) has only a 400 face available, so Chromium synthesises bold for the "1"/"2" glyphs. Visually minor at 11.5px; DESIGN.md says "do not add a weight without a component that needs it", the inverse case (requesting a weight that is not shipped) is what happens here. | `measurements.json` `routes.desk-light.fontWeights`; `follow.json` `monoWeights` lists `_cite_` buttons at 600. |
| R11 | low | `reviews/revamp-decisions.md` F25 | States the join band "was the only dark surface". The pilot notice is a dark `#1e2529` band on every marketing route (still present and intentional). Doc accuracy only. | `landing-desk-light.s0.png`. |
| R12 | info | `tests/web/experience.spec.ts:75` | The list reporter prints ✘ for "instanced GPU resources are released on repeated unmounts". It is a `test.fail()`-annotated expected failure ("hero3d scene dispose leaves sprite GPU buffers"), pre-existing, untouched by this diff; `results.json` records it as `expected` with 0 retries. Not a regression, but anyone reading the console will see a red mark. | `/tmp/revamp-review/e2e.log:15`; `tests/web/artifacts/results.json`. |

Checked and found correct (no finding): no em or en dashes in rendered text on any route, title or og:title; `color-scheme` meta light and `theme-color #f4f5f2`; HCMIU appears only in the pilot notice and the "Sample handbook, not HCMIU policy" badge; no "verified" wording anywhere; sample/demo labels use the neutral badge, "Awaiting a current version" is clay, outage notices are danger; zero text pairs below 4.5:1 (3:1 large) on landing, answer, sources, history, admin and auth at both viewports (disabled controls excluded); `--field-border #868f89` on text fields, selects and search (measured `rgb(134,143,137)`); focus is a 2px solid terracotta outline on all 24 tab stops recorded in the hero; the school picker opens below the bar (popover top 674px vs h1 bottom 414px at 1440; 502 vs 229 at 390), options are 56px, Escape returns focus to the trigger; the command menu has 19 options, 45px rows, "Search or ask" placeholder, the Ask row for unmatched text (Enter fills and focuses the composer), diacritic-insensitive match for "rút", and the key legend is `display: none` under an emulated coarse pointer; the mobile sheet returns focus to "Open menu"; no horizontal overflow at 390 on any route including a 110-character Vietnamese question and the long school name; reduced motion gives a pixel-stable canvas; dark mode is pixel-identical to light on 10 of 12 compared full-page captures (the two differences are the lazy photo not yet decoded in one capture and a 1,250-pixel sub-threshold difference inside the admin title input, visually identical); the photo renders 432x540 (4:5) at 1440 and 358x239 (3:2) at 390 from the 800w AVIF, radius 18px, caption visible under the image at 13px with both links, credit text matches `CREDITS.md`, and the Commons file page confirms author Shixart1985 and CC BY 2.0 (its EXIF metadata also names Nenad Stojković; the Summary author is what the credit uses).

Bundle versus base (both built from clean trees):

| Asset | Base `1faa96b` | HEAD `26f93eb` |
|---|---|---|
| `index-*.css` | 97.42 kB (gzip 34.95) | 77.36 kB (gzip 24.44) |
| `index-*.js` | 485.07 kB (gzip 146.97) | 483.90 kB (gzip 146.79) |
| `scene-*.js` | 553.51 kB (gzip 138.90) | 553.51 kB (gzip 138.90) |
| woff2 files in dist | 23 | 13 |
| dist/assets total | 1,877,492 B | 1,631,916 B |
| Landing transfer, 1440, motion on | 498 KB (critics' measurement) | 440.6 KB, 15 requests, 7 font files 76.3 KB |

The scene chunk is still requested at about 210 ms on both viewports (stage is within the first viewport on both, so the IntersectionObserver gate fires immediately). Document height: 4,964px at 1440 (base 5,544), 8,129px at 390 (base 9,238).

## 3. Decision-by-decision verification

Every accepted or adapted row in `revamp-decisions.md`, with what was seen. "OK" means implemented and visible in the browser at the stated route and viewports.

| Id | Status | Seen |
|---|---|---|
| F1/O8 | OK | Photo is a standalone captioned figure beside a four-row kinds list; 4:5 from 960px, 3:2 below; credit under the image; `sizes` matches the column within 20px. |
| F2/O5 | OK | H2 36px (30px phone) on all seven sections; section padding 96/64px; cards per section 1,0,1,1,0,0 (hero 1). |
| F3/O6 | OK | Standalone "won't guess" band gone; the no-answer card sits beside the steps list in How. |
| F4 | OK | Word-art specimen gone; "Either language" is a row with a Vietnamese sample locator. |
| F5 | OK | `placement="bottom-start"`, opens below, never covers the h1, options 56px with ellipsis. |
| F6/O17 | adapt as documented | Reader still duplicates the Source card; failed chunk shows "This passage could not be loaded" with no Sign in. See R3 for the summary affordance. |
| F7 | OK | Aside is `position: static`, `overflow: visible`, `scroll-margin-top: 88px` on children. |
| F8/O3/O4 | OK | Signed in: account card plus "Invitations and email" with Redeem invitation and Verify email only; signed out: four tabs wrapping on two rows at 390, all in viewport; Google token field hidden while Google is disabled. |
| F9 | OK | "Started Sep 25, 2026 · 66666666". |
| F10 | OK | "Unsupported claim", "Open"; "Sources and versions". |
| F12/O24 | OK | 503 on `/me`: header "Account" (secondary), answer "Your account could not be checked right now.", history and admin say the same with no Sign in button. |
| F13 | partly | Stage reserved by `aspect-ratio`; proof row gone; pilot row is 46px at 390, not fixed 44 (R8). CLS 0.069 phone, 0.025 desktop. |
| F14/O20 | mostly | Header controls, pilot close, search and account 44px; picker 40, track 40 with 34px thumbs, send 40, sample chips 40. Thumb and citation hit widths under 44 (R4). |
| F15/O15 | OK | Meta light, theme-color `#f4f5f2`, no dash in title or og:title. |
| F16 | OK | Stuck nav `rgb(244,245,242)`, no backdrop filter, hairline when scrolled. |
| F17/O11 | OK | Proof row deleted; two chips in a "Sample questions" group with no "Try" label. |
| F18 | OK | Hanken 500/700 and Mono 500 files gone (R10 on remaining weight requests). |
| F19 | OK | Steps are a hairline-ruled list with mono numbers in clay-soft discs, no icons, no cards. |
| F20 | OK | Unavailable card title once, body "You can still open the source library. Your question is kept in the box below." (composer keeps the draft). |
| F21 | OK | Reader lede "One document and all of its editions."; version line "Indexed." only. |
| F22 | adapt as documented | Pill eyebrow removed on help, universities, contact; slogan h1s remain. |
| F23 | not achieved | Truncation and title done; bar still wraps at 1440 (R2). |
| F24 | OK | "Common questions". |
| F25/O13 | OK | Light sunken panel, secondary "Check details", no send icon, inline "not sent" result (spec-verified). |
| F26 | OK | Account rows stack label over value at 390 (grid 308px), two columns from 520px. |
| F27/O14 | OK | "Example account" badge, "Your school", "Your school's, approved only"; footer "Independent project. Not an official service of any university." |
| O1 | OK | Workspace routes show Ask, Sources, History, Admin (admin only); subnav row under the bar below 960px; pilot notice hidden on workspace routes; footer drops Workspace column. See R7 for "Ask". |
| O2 | OK | Right-aligned sunken question bubble with sr-only "You asked:"; composer cleared on success; kept on unavailable. |
| O7 | OK | Order hero, how, reads, scope, roles, join, FAQ. |
| O9 | OK | Card overlap 40/48px; stage labels and hint unchanged as documented. |
| O12 | OK | Numbered `<ol>` in the no-answer example, no check marks. |
| O16 | OK | DOM order answer, sources, follow-up; 390 shows sources before the composer. |
| O18 | OK | Idle answer page is one centred column titled "Ask a question"; no aside. |
| O19 | OK | `lucide-circle-stop` on Stop. Two spinners (card and send) remain during loading, as the decision scoped. |
| O21 | OK | Field border token applied to TextField, Select, SearchInput, admin inputs. |
| O22 | OK | Landing radii now 10, 18, 28, 999px, 50% (avatar) plus 2 to 4px on kbd/mark/skeleton exceptions. |
| O23 | OK | Badge tones as specified. |
| O25 | OK | Chevron rotates on the graph `<details>`; "Pick a source to see its versions" shown. |
| O26 | OK | Plain muted glyph in source and history rows. |
| O27 | OK | 28px spacer under the history lede. |
| O28 | OK | No orphaned chip at 390; locator "Sample Handbook, 2025 · p. 31 · sec. 4.2". |
| O29 | OK | Suggestion chip appears, switches on click, never silently (R6 on the layout jump). |
| O30 | OK | Ask row, placeholder, legend hidden on coarse pointer. |
| O32 | OK | Light only; identical rendering under `prefers-color-scheme: dark`. |
| O33 | OK | 64px below 720px; pilot copy unchanged. |

Rejections: F11 (admin card order), O10 (no scene on phones), O31 (disabled deletion button) and the stylelint rule in O22 are all justified by pinned specs, dependency policy or low impact; none is wrong. O10 is the only one worth revisiting later: the scene chunk (139 KB gzip) still downloads on phones at about 216 ms, and `experience.spec.ts` pins the phone canvas, so changing it is a spec change, not a bug.

## 4. Does it still read as AI-generated?

Less than the base, and the remaining tells are in copy, not layout. The landing now has four distinct arrangements (list plus example card, rows plus figure, text plus account card, tabs) and the only repeated element is the hairline-ruled list, which reads as one system rather than a template. The things that still read generated: the three marketing-page slogan h1s ("Find your next step.", "Reconnect with your students.", "Let's make the question clearer.") that DESIGN.md itself bans and F22 deferred; the hero's generic 3D hint label; and the FAQ's seven questions that all begin with "Can I" or "Which/What/Does/Is". The stock photo now looks like a chosen illustration rather than a filler thumbnail, and its caption disarms the "is this a partner" question.

**Single most valuable next change:** fix R1 and rewrite the three marketing h1s in the same pass (one copy task: the page name as the h1, the slogan demoted to the lede). It is the last place a visitor meets template copy, it is a DESIGN.md rule already written down, and the reads-section lede is the one sentence on the site that is currently untrue about the product.

## 5. Commands run

All from the worktree root unless noted. Exit codes as shown.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | exit 0, "Done in 1.2s", lockfile unchanged |
| `pnpm --filter @noti/web typecheck` | exit 0 |
| `pnpm --filter @noti/web test` | exit 0: 81 tests, 81 pass, 0 fail, 0 skipped (620 ms) |
| `pnpm --filter @noti/web build` | exit 0, built in 5.53s; `index-*.css` 77.36 kB (gzip 24.44), `index-*.js` 483.90 kB (gzip 146.79), `scene-*.js` 553.51 kB (gzip 138.90); chunk-size warning for both JS chunks (pre-existing) |
| `pnpm exec playwright test` (in `apps/web`, serial, 1 worker) | exit 0: 133 passed in 5.0 min; 1 `test.fail()` expected failure (`experience.spec.ts:75`), 0 retries, 0 flaky |
| `git archive 1faa96b` into `/tmp/revamp-review/base` + `pnpm install --offline` + `pnpm --filter @noti/web build` | exit 0; `index-*.css` 97.42 kB (gzip 34.95), `index-*.js` 485.07 kB (gzip 146.97), `scene-*.js` 553.51 kB |
| `pnpm exec vite preview --host 127.0.0.1 --port 4799 --strictPort` (in `apps/web`) | serving; port 4173 was held by an unrelated process, 3304 by the test run |
| `node /tmp/revamp-review/shoot.mjs` | exit 0; 118 PNGs, `measurements.json`; 56 logged console entries, all "Failed to load resource" 401/503 from the deliberate signed-out and outage fixtures, no page errors |
| `node /tmp/revamp-review/slice.mjs` | tall captures sliced to 1000px (desktop) / 1700px (phone); light-vs-dark pixel diffs (threshold 16/255) |
| `node /tmp/revamp-review/follow.mjs` | long-name bar geometry, suggestion-chip shift, mono weights, nav `aria-current`, coarse-pointer legend, pilot height |
| WebFetch of the Commons file page | author Shixart1985, licence "CC BY 2.0" (Creative Commons Attribution 2.0 Generic) |

Not verified: real-device GPU behaviour (SwiftShader only), iOS font rendering, throttled-network timing, screen-reader announcements, the Vietnamese UI locale (English UI captured; Vietnamese strings exercised through content), and any live provider behaviour (none called).
