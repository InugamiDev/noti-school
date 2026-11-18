# Review: jev-web-ui (campaign noti-jev-web-20261118)

Reviewer: independent adversarial review, Claude Opus 5.5. Reviewed `git diff b27c571 (FLEET_BASE_SHA)` against HEAD `a1fefa2`, which is 25 files, +1710/-102: apps/web/src, apps/web/scripts/demo-server.mjs, apps/web/tests/demo.test.ts, tests/web/*. I changed no code.

**Verdict:** I found no critical or high defects. The core student-facing work does what the order asked, and I checked it in a real browser against the demo server at 1440x900 and 390x844, in English and Vietnamese. That covers the origin and domain labels, the fetched date, the High/Medium/Low word plus number, the four-part breakdown, the answer header sentence, the web notice, the single waiting line, `discover: true`, and the admin promote/refresh/block and domains actions. All gates pass, and the full Playwright suite passes (124 of 124, including 12 new tests in confidence.spec.ts). I did not run the suite at base.

There are three medium findings. Two of them are cases where something next to the change contradicts it (an API doc and the landing copy). The third is that the personal space opens the full school admin console.

## Findings

| # | Severity | Location | Failure scenario | Evidence |
|---|---|---|---|---|
| 1 | medium (needs a coordinator decision) | apps/web/src/App.tsx:242-248, :570 | Every question is sent with `discover: true` whenever discovery is not reported unavailable, and students have no control to turn it off. The frozen `docs/contracts/api.md:92-93` still says "`discover=true` requires separately available discovery and **explicit user opt-in**". The order (owner decision of 18 Nov) says to send it by default, so the UI follows the order and the doc is out of step. A backend worker who builds to api.md could reject or ignore default discovery, or a reviewer could flag the UI as breaking the contract. | The driver captured these ask bodies: `{"institution_id":"…0001","question":"Library opening hours and borrowing books","language":"en","discover":true}`, and the same for vi and 390px. The composer has no toggle (driver text dump of `main`). |
| 2 | medium | apps/web/src/site/Flash.tsx:198 (outside the ordered files, not flagged by the implementer) | Directly under the composer, the landing "How it works" card still says "**Only approved documents**. noti.school searches reviewed, published sources for your institution, nothing else." Every default question now also searches the web and may cite unreviewed pages. With My space selected, the same page shows both "Answers come from pages found on the web" and "Only approved documents … nothing else". So the product copy itself presents web evidence as approved, which breaks the "web evidence never looks approved" requirement. Step 03 and the "Every answer shows its sources" block are fine. | Driver text dump of `/#/` with My space selected contains both strings (`/tmp/rv-drive2.json` → `spaceComposer`). |
| 3 | medium (UI part confirmed; budget exposure plausible) | apps/web/src/App.tsx:1039-1043; apps/web/src/Admin.tsx:186, :495, :616-630 | The personal-space membership has role `admin`, both in the demo and in the new Playwright fixture (`confidence.spec.ts:71`). `allowed` is any admin membership of the current institution, so with My space selected, `/#/admin` opens the whole school console. That includes "Add official documents … answer reports from students", "**School domains**: Pages from these domains count as the school's own", Feedback, and the **Monthly AI budget "$1.39 of $50.00"**. The USD 50 figure is the combined application ceiling, so if the backend scopes `/budget` the way the demo does, every signed-in user who opens My space would see application-wide spend. That last part is plausible, not proven, because it depends on the parallel backend. Promote in My space creates a `pending_review` version that the owner can approve themselves. After that, a web page would show as "Approved document" inside My space, which reads as institution approval. | Driver at 390x844: My space → `/#/admin`, where the dump shows "Collection management … Monthly AI budget $1.39 of $50.00 … Web pages … School domains … Save domains" (`/tmp/rv-drive2.json` → `spaceAdmin`). No code distinguishes `kind === 'personal'` in Admin.tsx. |
| 4 | low | apps/web/scripts/demo-server.mjs:143, :248 | This is a regression in the demo. The picker still lists "Example Institute of Technology · Demo", but asking there now returns 403. The signed-in demo user sees "Your account does not have access to this collection." with a **Sign in** link. At base, the demo returned an abstained answer for that school. | Driver: choose the second school and ask "When is the exam timetable published?". `main` text: "Your account does not have access to this collection. Sign in · Browse sources". Base code: `if (ask.institution_id !== institution.id \|\| !hits.length) result = {…status:'abstained'…}`. |
| 5 | low | apps/web/scripts/demo-server.mjs:198 | Demo confidence for approved passages depends only on keyword score, not relevance. The Vietnamese question "Gửi xe máy có miễn phí không" (is motorbike parking free) returned an unrelated tuition-fee claim from "Scholarships and Financial Aid Guide", labelled **Trung bình 71%** with "On topic 70%". A presentation demo then teaches that an irrelevant passage is moderately on topic. All of this is synthetic and labelled `synthetic-demo (not a model score)`. | Screenshot `/tmp/rv-shots/1440-vi-low.png`; `lowCards` in `/tmp/rv-drive.json` (1440-vi, 390-vi). |
| 6 | low (plausible comprehension issue) | apps/web/src/ui/Confidence.tsx:41, :48 | On source cards, admin rows and claims, the word "Confidence" is screen-reader-only, so a sighted student sees a bare "Medium 66%" next to "Web page · news.example.org". It could be read as relevance, page quality or a grade. The answer header has an explanatory sentence, but the cards do not. The order asked for "a text label (High/Medium/Low) plus the number", which this meets literally. | Screenshot `/tmp/rv-shots/390-en-breakdown.png`. The visible card text is "Approved document · High 92%" with no visible "Confidence". The accessible name is correct: "Confidence: Medium 66%". |
| 7 | low | apps/web/src/WebPages.tsx:164 | The domains editor rejects internationalized domain names written in Unicode, such as `trường.edu.vn`, and the error only says "such as example.edu", so a Vietnamese admin is not told to use the punycode form. | `node -e` on the regex: `trường.edu.vn:false xn--trng-hra.edu.vn:true`. |
| 8 | low | apps/web/src/AnswerView.tsx:288 | In My space, the waiting line says "Searching approved documents and the web…", but a personal space has no approved documents unless the owner promoted some. That makes the "truthful waiting copy" goal slightly inaccurate there. | Code path: `discovering` is the only condition; `personal` is not considered. |
| 9 | low (test gap) | tests/web/confidence.spec.ts | No spec runs at 390x844, and the horizontal-overflow checks only run at the default 1280x720. Nothing guards the narrow layout that this review checked by hand. | `grep -n setViewportSize\|viewport tests/web/confidence.spec.ts` finds nothing. |

### Checked and found correct

These were driven against the demo server at 1440x900 and 390x844, in EN and VI:

- **Labels and thresholds:** Approved cards say "Approved document" with no date. Web cards say "Web page · <domain>" plus "Fetched 9 Nov 2026", or "Tải về ngày 9 thg 11, 2026" in Vietnamese. Levels are High ≥0.8, Medium ≥0.6, Low below. The percent is floored (0.7999 shows 79%, Medium), and the unit tests cover this.
- **Accessible names:** The toggles are named "Confidence: High 92%" and "Độ tin cậy: Trung bình 66%". The breakdown group is named "What the confidence is based on". The four parts are in plain words and the model is named.
- **Answer header and notice:** The header shows the label plus one sentence. The web notice names the school ("…reviewed by Example University staff."). In My space it says "Nobody has reviewed them."
- **Web citation reader:** It shows "Found on the web. This page is not an approved document.", links to "Open web page", and offers no "Open original" or download.
- **Layout:** No horizontal overflow at either width in either language, including with the breakdown open (`scrollWidth - innerWidth = 0`).
- **Keyboard:** Tab order from the answer reaches the confidence toggle after the source card. `:focus-visible` gives a 3px solid teal ring. Space and Enter toggle `aria-expanded`. In admin, Block moves focus to **Keep** (`:focus-visible` true).
- **Contrast:** Measured on composited backgrounds, the minimum is 4.71:1 (12px Low tag, vermilion on vermilion-soft). Claim Low is 4.91, High 5.66, Medium 6.04, "Approved document" 5.14, "Web page" 8.86, "Fetched" 5.89, notice 8.11, breakdown text 9.4 and values 14.27, admin Block 5.63. Everything is at least AA for its size.
- **Colour independence:** Every level has a word, a number and a bar count (1/2/3), so colour is never the only signal.
- **Waiting copy:** The waiting state is a single status line. When the capability is disabled, the request sends `discover:false` and the line reads "Finding an answer and its sources…".
- **Demo data:** All web pages, confidence values and the personal space carry synthetic labels (`(synthetic demo page)`, `Synthetic demo text…`, `synthetic-demo (not a model score)`) and use only example.edu or news.example.org. The demo server is loopback only.
- **Sign-out:** Signing out while My space is selected falls back to the first school.
- **No dashes:** None of the added code lines contain an em or en dash.
- **Existing specs:** The changes only add contract fields and a splash wait. Nothing was skipped, `.only`'d or weakened.

## Commands run

All commands were run from the worktree root unless noted. The DB, cargo and live-provider suites are out of scope for this web-only diff and were not run.

| Command | Result |
|---|---|
| `git diff $FLEET_BASE_SHA --stat` | 25 files changed, 1710 insertions(+), 102 deletions(-) |
| `pnpm install --frozen-lockfile --offline` | ok (esbuild build script ignored, as at base) |
| `apps/web: pnpm typecheck` | exit 0 |
| `apps/web: pnpm build` | exit 0 (only the existing >500 kB `scene` chunk warning) |
| `apps/web: pnpm test` (tests/web/unit.test.ts + apps/web/tests/*.test.ts) | 20 tests, 20 pass, 0 fail, 0 skipped |
| `pnpm typecheck` (root) | exit 0 |
| `pnpm contracts:check` | exit 0 |
| `pnpm test` (root foundation) | 17 tests, 17 pass, 0 fail |
| `apps/web: pnpm exec playwright test` (full suite, 1 worker, Chromium) | **124 passed, 0 failed, 0 flaky** in 6.9 min. Nothing failed, so there were no isolated reruns. |
| `node scripts/demo-server.mjs 4391` + `/tmp/rv-scripts/drive.mjs` (my Playwright driver: 1440x900 and 390x844 × en/vi; ask, breakdown via keyboard, Low answer, web reader, admin, contrast) | exit 0. Overflow 0 everywhere. Results in `/tmp/rv-drive.json`, screenshots in `/tmp/rv-shots/` |
| `/tmp/rv-scripts/drive2.mjs` (Tab path, Low contrast, second school, My space ask/admin, Block keyboard, sign-out fallback) | exit 0, no page errors. Findings 3 and 4 come from this run. |
| `/tmp/rv-scripts/shot3.mjs` (My space composer at both widths, after a demo restart) | privacy copy and "Demo collection" are visible |
| `node -e` IDN regex check | `trường.edu.vn:false xn--trng-hra.edu.vn:true` |

The Playwright suite (`tests/web/marketing-fixtures.ts:31`) writes screenshots to an untracked `.verification/` directory that is not gitignored. This also happens at base. I removed the copy my run created (timestamps matched my run) so the harness diff stays clean.
