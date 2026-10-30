import type { Page } from "../../apps/web/node_modules/@playwright/test/index.js";
import {
  test,
  expect,
  marketingRoutes,
  hrefFor,
  institutionName,
  exampleEvidence,
  landingSections,
  visit,
  screenshot,
  assertGeometry,
  assertStillVisible,
  tabTo,
  type MarketingRoute,
} from "./marketing-fixtures";

// intent: enforce the website brief on the Clay site; status: updated for the Clay landing; next: combined candidate run.
test.describe.configure({ mode: "default" });
test.use({ reducedMotion: "reduce", serviceWorkers: "block" });

const responsibilities: Record<MarketingRoute, RegExp> = {
  home: /question|source/i,
  product: /answer[\s\S]*evidence|evidence[\s\S]*answer/i,
  students: /student|your university/i,
  universities: /review|approval|approve/i,
  pricing: /pilot/i,
  about: /independent/i,
  help: /question|help/i,
  contact: /GitHub/i,
  security: /access|permission/i,
  privacy: /process|provider/i,
  terms: /official|advice/i,
  changelog: /pilot/i,
};

const expectedHeadings: Record<MarketingRoute, string> = {
  home: "University answers you can check.",
  product: "Find the answer. Keep the evidence.",
  students: "University life has enough open tabs.",
  universities: "Reconnect with your students.",
  pricing: "Start with a conversation, not a checkout.",
  about: "Information is useful when people can reach it.",
  help: "Find your next step.",
  contact: "Let’s make the question clearer.",
  security: "Trust needs boundaries.",
  privacy: "Know what you are sharing.",
  terms: "A guide to using the pilot responsibly.",
  changelog: "A clearer view of the current pilot.",
};

async function checkPage(page: Page, route: MarketingRoute) {
  const surface = await visit(page, route);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(expectedHeadings[route]);
  const text = (await surface.innerText()).trim();
  expect((await heading.innerText()).trim().length).toBeGreaterThan(3);
  expect(text.length, `${route} must contain substantive page-specific content`).toBeGreaterThan(
    180,
  );
  expect(text).toMatch(responsibilities[route]);
  await expect(surface).not.toContainText(/coming soon|lorem ipsum|page not found/i);
  await expect(page).toHaveTitle(/noti\.school/i);
  await assertGeometry(page);
  return surface;
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  for (const route of marketingRoutes) {
    test(`${route}: content and screenshot at ${viewport.width}x${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await checkPage(page, route);
      await screenshot(page, testInfo, `${route}-${viewport.name}`);
      if (route === "home") {
        const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
        await expect(prompt).toBeVisible();
        await prompt.click();
        await expect(prompt).toBeFocused();
        const rect = await prompt.boundingBox();
        expect(rect).not.toBeNull();
        expect(
          rect!.y + rect!.height,
          "Composer must be usable in the first viewport",
        ).toBeLessThan(viewport.height);
        // The 3D stage paints a static illustration first; the answer card overlaps its base.
        await expect(page.getByRole("img", { name: /Clay illustration/ })).toBeVisible();
        await expect(page.getByRole("article", { name: "Example answer" })).toContainText(
          "Sample handbook, not HCMIU policy",
        );
      } else if (viewport.name === "desktop") {
        const header = page.getByRole("banner");
        const rect = await header.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.height, "Desktop navigation must fit below 80px").toBeLessThan(80);
        const centers = await header
          .locator('nav[aria-label="Main"] a, .site-nav-search, .site-nav-account, .site-logo')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const box = element.getBoundingClientRect();
              return box.top + box.height / 2;
            }),
          );
        expect(centers.length).toBeGreaterThan(5);
        expect(
          Math.max(...centers) - Math.min(...centers),
          "Desktop navigation stays on one line",
        ).toBeLessThan(8);
      }
    });
  }
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 320, height: 844 },
]) {
  test(`home: visible geometry at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await checkPage(page, "home");
    const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
    await prompt.fill("Tôi có thể tìm tài liệu và biểu mẫu ở đâu? ".repeat(5));
    await assertGeometry(page);
    await screenshot(page, testInfo, `home-${viewport.width}`);
  });
}

test("all twelve routes have distinct headings, body content and document titles", async ({
  page,
}) => {
  const headings = new Set<string>();
  const content = new Set<string>();
  const titles = new Set<string>();
  for (const route of marketingRoutes) {
    const surface = await visit(page, route);
    const heading = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    const body = (await surface.innerText()).replace(heading, "").trim();
    const title = await page.title();
    expect(headings.has(heading), `Repeated H1 on ${route}: ${heading}`).toBe(false);
    expect(content.has(body), `Repeated page body on ${route}`).toBe(false);
    expect(titles.has(title), `Repeated document title on ${route}: ${title}`).toBe(false);
    headings.add(heading);
    content.add(body);
    titles.add(title);
  }
  expect(headings.size).toBe(12);
});

test("all website links resolve to known routes or real in-page targets", async ({ page }) => {
  const known = new Set([
    ...marketingRoutes.map(hrefFor),
    "#/answer",
    "#/sources",
    "#/history",
    "#/auth",
    "#/admin",
    ...landingSections.map((section) => `#${section}`),
  ]);
  for (const route of marketingRoutes) {
    await visit(page, route);
    const links = await page.locator("a").evaluateAll((elements) =>
      elements.map((element) => ({
        href: element.getAttribute("href"),
        text: element.textContent?.trim(),
        target: element.getAttribute("target"),
        rel: element.getAttribute("rel"),
      })),
    );
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) {
      expect(link.href, `${route}: ${link.text} is a dead anchor`).toBeTruthy();
      const href = link.href!;
      expect(href, `${route}: ${link.text}`).not.toBe("#");
      expect(href).not.toMatch(/^javascript:/i);
      if (href.startsWith("#/") || known.has(href))
        expect(known.has(href), `${route}: dangling route ${href}`).toBe(true);
      else if (href.startsWith("#")) {
        expect(
          await page.evaluate((id) => document.getElementById(id) !== null, href.slice(1)),
          href,
        ).toBe(true);
      } else {
        // The contact profile, plus the CC BY 2.0 attribution the stock photo's licence requires.
        expect(
          [
            "https://github.com/InugamiDev",
            "https://commons.wikimedia.org/wiki/File:Cozy_study_space_with_an_open_book,_fresh_apple,_and_laptop_on_a_desk_in_bright_natural_light.jpg",
            "https://creativecommons.org/licenses/by/2.0/",
          ],
          "Only the contact profile and the photo credit are approved external website destinations",
        ).toContain(href);
      }
      if (link.target === "_blank") expect(link.rel ?? "", href).toMatch(/\bnoopener\b/);
    }
  }
});

test("primary audience CTAs navigate, focus content, and support back/forward", async ({
  page,
}) => {
  for (const [from, destination] of [
    ["students", "home"],
    ["universities", "contact"],
    ["pricing", "contact"],
    ["about", "product"],
    ["security", "contact"],
    ["privacy", "contact"],
    ["terms", "contact"],
    ["changelog", "product"],
  ] as const) {
    const surface = await visit(page, from);
    const cta = surface.locator(`a[href="${hrefFor(destination)}"]`).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page.locator(`[data-site-page="${destination}"]`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await page.goBack();
    await expect(page.locator(`[data-site-page="${from}"]`)).toBeVisible();
    await page.goForward();
    await expect(page.locator(`[data-site-page="${destination}"]`)).toBeVisible();
  }
});

test("workspace routes remain reachable and unknown routes offer recovery", async ({ page }) => {
  await visit(page, "home");
  for (const href of ["#/sources", "#/auth", "#/history", "#/admin"]) {
    await page.locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("main")).toContainText(
      /source|sign in|account|conversation|administrator/i,
    );
    await expect(page.getByRole("main")).not.toContainText(/page not found/i);
    await visit(page, "home");
  }
  await page.goto("/#/synthetic-missing-page");
  await expect(page.getByRole("main")).toContainText(/not found|does not exist|couldn.t find/i);
  const home = page.getByRole("main").locator('a[href="#/"]').first();
  await home.click();
  await expect(page.getByRole("textbox", { name: "Your question", exact: true })).toBeVisible();
});

test("mobile menu sheet opens by keyboard, traps focus, closes with Escape and on route selection", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "home");
  const open = page.getByRole("button", { name: "Open menu", exact: true });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('nav[aria-label="Main"]')).toBeHidden();
  await tabTo(page, open, true);
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  // The modal hides the page behind it from the accessibility tree, so read the trigger state directly.
  await expect(page.locator(".site-nav-menu")).toHaveAttribute("aria-expanded", "true");
  // Measure the panel at rest, after its (reduced) entry animation has finished.
  await sheet.evaluate((element) =>
    Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)),
  );
  await assertGeometry(page);
  await screenshot(page, testInfo, "mobile-navigation-open");
  const universities = sheet.getByRole("link", { name: "For universities", exact: true });
  await tabTo(page, universities);
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.keyboard.press("Enter");
  await sheet.getByRole("button", { name: "Close menu", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await sheet.getByRole("link", { name: "Who it’s for", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Built for everyone at a university" })).toBeFocused();
  await expect(page).toHaveURL(/#roles$/);
  await open.click();
  await tabTo(page, sheet.getByRole("link", { name: "For universities", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-site-page="universities"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await screenshot(page, testInfo, "mobile-navigation-closed");
});

test("landing anchors open the landing section from any page and from a reload", async ({ page }) => {
  await visit(page, "help");
  await page.getByRole("banner").getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page.locator('[data-site-page="home"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "How an answer gets made" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "How an answer gets made" })).toBeInViewport();
  await page.reload();
  await expect(page.getByRole("heading", { name: "How an answer gets made" })).toBeInViewport();
  await page.getByRole("complementary", { name: "Pilot notice" }).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Bring noti.school to your university" })).toBeFocused();
});

test("pilot notice is dismissible and stays dismissed", async ({ page }) => {
  await visit(page, "home");
  const notice = page.getByRole("complementary", { name: "Pilot notice" });
  await expect(notice).toContainText("Now piloting at HCMIU. Other universities can request access.");
  await notice.getByRole("button", { name: "Dismiss notice" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Pilot notice" })).toHaveCount(0);
});

test("command menu opens with Ctrl+K and the search button, runs commands and asks unmatched text", async ({
  page,
  marketingAudit,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, "product");
  const menu = page.getByRole("dialog", { name: "Command menu" });
  await page.keyboard.press("Control+k");
  await expect(menu).toBeVisible();
  const input = menu.getByRole("combobox", { name: "Search commands" });
  await expect(input).toBeFocused();
  await input.fill("help");
  await expect(menu.getByRole("option").first()).toHaveText("Help");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-site-page="help"]')).toBeVisible();
  const search = page.getByRole("button", { name: /^Search/ });
  await search.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.keyboard.press("Control+k");
  await menu.getByRole("combobox").fill("tieng viet");
  await expect(menu.getByRole("option")).toHaveText(["Switch answer language to Tiếng Việt"]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+k");
  await menu.getByRole("combobox").fill("Thủ tục bảo lưu ở đâu zz-synthetic");
  // Unmatched text is a selectable row, not an instruction.
  await expect(menu.getByRole("option")).toHaveText(["Ask “Thủ tục bảo lưu ở đâu zz-synthetic”"]);
  await page.keyboard.press("Enter");
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await expect(prompt).toHaveValue("Thủ tục bảo lưu ở đâu zz-synthetic");
  await expect(prompt).toBeFocused();
  await expect(
    page.getByRole("group", { name: "Answer language" }).getByRole("button", { name: "Tiếng Việt" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(marketingAudit.api.filter((request) => request.method !== "GET")).toEqual([]);
});

test("slash focuses the question when not typing; typing elsewhere keeps the slash", async ({ page }) => {
  await visit(page, "home");
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await page.locator("body").press("/");
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue("");
  const filter = page.getByRole("searchbox", { name: "Filter questions" });
  await filter.fill("a/b");
  await filter.press("/");
  await expect(filter).toHaveValue("a/b/");
  await expect(filter).toBeFocused();
});

test("school picker shows the listed pilot, previews an unlisted university and keeps the draft", async ({
  page,
  marketingAudit,
}) => {
  await visit(page, "home");
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await prompt.fill("Synthetic draft kept across scope changes");
  const picker = page.getByRole("button", { name: /^School: .* Change school$/ });
  await expect(picker).toContainText(institutionName);
  await picker.click();
  const options = page.getByRole("listbox", { name: "Universities" }).getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(options.first()).toContainText(institutionName);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(picker).toContainText("Your university");
  await expect(page.getByRole("article", { name: "Your university" })).toContainText("isn't set up yet");
  await expect(page.getByRole("article", { name: "Example answer" })).toHaveCount(0);
  await expect(page.getByText("Your university is not set up yet. You can request it below.")).toBeVisible();
  await page.reload();
  await expect(picker).toContainText("Your university");
  await picker.click();
  await page.getByRole("option", { name: new RegExp(institutionName) }).click();
  await expect(page.getByRole("article", { name: "Example answer" })).toBeVisible();
  await expect(prompt).toHaveValue("Synthetic draft kept across scope changes");
  expect(marketingAudit.api.filter((request) => request.method !== "GET")).toEqual([]);
});

test("hero citation chips move the highlighted passage and copy confirms with a toast", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await visit(page, "home");
  const card = page.getByRole("article", { name: "Example answer" });
  const first = card.getByRole("button", { name: "Citation 1" });
  const second = card.getByRole("button", { name: "Citation 2" });
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator('mark[data-passage="a"]')).toHaveAttribute("data-active", "");
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(card.locator('mark[data-passage="b"]')).toHaveAttribute("data-active", "");
  await expect(card.locator('mark[data-passage="a"]')).not.toHaveAttribute("data-active", "");
  await card.getByRole("button", { name: "Copy citation" }).click();
  await expect(page.getByText("Citation copied")).toBeVisible();
});

test("request form validates inline and never pretends to send", async ({ page, marketingAudit }, testInfo) => {
  await visit(page, "home");
  const form = page.getByRole("form", { name: "Request your university" });
  await form.scrollIntoViewIfNeeded();
  const before = marketingAudit.api.length;
  await form.getByRole("button", { name: "Check details" }).click();
  const university = form.getByRole("textbox", { name: "University" });
  await expect(university).toHaveAttribute("aria-invalid", "true");
  await expect(university).toBeFocused();
  await expect(form).toContainText("Enter your university's name.");
  await university.fill("Synthetic University");
  await form.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await form.getByRole("button", { name: "Check details" }).click();
  await expect(form.getByRole("textbox", { name: "Email" })).toBeFocused();
  await expect(form.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  await form.getByRole("textbox", { name: "Email" }).fill("someone@example.edu");
  await form.getByRole("button", { name: "Check details" }).click();
  await expect(form.getByRole("status")).toContainText("This request was not sent");
  await expect(form.getByRole("status").getByRole("link", { name: "contact page" })).toHaveAttribute("href", "#/contact");
  await expect(page.getByText("Not sent. There is no request service yet.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/request (?:was )?sent|we.ll be in touch|thanks for your request/i);
  expect(marketingAudit.api.slice(before), "The request form must not call any endpoint").toEqual([]);
  await assertGeometry(page);
  await screenshot(page, testInfo, "home-request-not-sent");
});

test("role tabs move with arrow keys and pair features with a preview", async ({ page }) => {
  await visit(page, "home");
  const tabs = page.getByRole("tablist", { name: "Roles" });
  const students = tabs.getByRole("tab", { name: "Students" });
  await students.focus();
  await page.keyboard.press("ArrowRight");
  const staff = tabs.getByRole("tab", { name: "Advisors and staff" });
  await expect(staff).toBeFocused();
  await expect(staff).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("Reported answers");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tabpanel")).toContainText("Nothing becomes evidence until your team publishes it.");
});

test("home preserves a bilingual prompt through marketing navigation and reload", async ({
  page,
  marketingAudit,
}) => {
  await visit(page, "home");
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await expect(page.getByRole("button", { name: /^School: .* Change school$/ })).toContainText(
    institutionName,
  );
  const draft = "Where are approved documents? Tôi cần kiểm tra phiên bản và nguồn.";
  await prompt.fill(draft);
  await page.getByRole("contentinfo").locator('a[href="#/students"]').click();
  await expect(page.locator('[data-site-page="students"]')).toBeVisible();
  await page.getByRole("main").locator('a[href="#/"]').first().click();
  await expect(prompt).toHaveValue(draft);
  await page.reload();
  await expect(prompt).toHaveValue(draft);
  expect(marketingAudit.api.filter((request) => request.method !== "GET")).toEqual([]);
});

test("home FAQ items open and close with keyboard without submitting a question", async ({
  page,
  marketingAudit,
}) => {
  const surface = await visit(page, "home");
  const faq = surface.locator("#faq");
  const triggers = faq.locator("button[aria-expanded]");
  expect(await triggers.count()).toBeGreaterThanOrEqual(5);
  expect(await triggers.count()).toBeLessThanOrEqual(8);
  await expect(triggers.first()).toHaveText("Which universities can use noti.school?");
  await expect(triggers.nth(1)).toHaveText("Can I see another university's documents?");
  for (const trigger of await triggers.all()) {
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const region = faq.locator(`[id="${await trigger.getAttribute("aria-controls")}"]`);
    expect((await region.innerText()).trim().length).toBeGreaterThan(30);
    await page.keyboard.press("Space");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  expect(marketingAudit.api.filter((request) => request.method !== "GET")).toEqual([]);
});

test("home FAQ filter ignores Vietnamese diacritics and offers to ask unmatched text", async ({ page }) => {
  const surface = await visit(page, "home");
  const faq = surface.locator("#faq");
  const filter = faq.getByRole("searchbox", { name: "Filter questions" });
  await filter.fill("TIENG VIET");
  await expect(faq.locator("button[aria-expanded]")).toHaveCount(1);
  await expect(faq.locator("button[aria-expanded]")).toHaveText("Can I ask in Vietnamese?");
  await expect(faq.locator("button[aria-expanded]")).toHaveAttribute("aria-expanded", "true");
  await filter.fill("học phí zz-synthetic");
  await expect(faq.locator("button[aria-expanded]")).toHaveCount(0);
  await expect(faq.getByRole("status")).toContainText("No questions match.");
  await faq.getByRole("button", { name: "Ask it instead" }).click();
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await expect(prompt).toHaveValue("học phí zz-synthetic");
  await expect(prompt).toBeFocused();
});

test("Help filters real FAQ answers by search and category, with empty-state recovery", async ({
  page,
}) => {
  const surface = await visit(page, "help");
  const search = surface.getByRole("searchbox", { name: "Search help", exact: true });
  const items = surface.locator(".site-help-list button[aria-expanded]");
  await expect(items).toHaveCount(12);
  await search.fill("VIETNAMESE");
  await expect(items).toHaveCount(1);
  await expect(items).toHaveText("Can I ask in Vietnamese?");
  await items.click();
  const region = surface.locator(`[id="${await items.getAttribute("aria-controls")}"]`);
  await expect(region).toContainText("Bilingual answer quality still needs evaluation");
  await expect(region.getByRole("link")).toHaveAttribute("href", "#/");
  await search.fill("tiếng việt");
  await expect(items).toHaveCount(1);
  await search.fill("");
  const categories = surface.getByRole("group", { name: "Help categories" });
  for (const [category, count] of [
    ["Answers", 3],
    ["Sources", 4],
    ["Accounts", 2],
    ["Pilot", 3],
  ] as const) {
    const button = categories.getByRole("button", { name: category, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(items).toHaveCount(count);
    await expect(surface.getByRole("status")).toContainText(`${count} answers found`);
  }
  await search.fill("zz-synthetic-no-matching-help-921");
  await expect(items).toHaveCount(0);
  await expect(surface.getByRole("heading", { name: "No matching help articles." })).toBeVisible();
  await expect(surface.getByRole("status")).toContainText("0 answers found");
  await surface.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(categories.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(items).toHaveCount(12);
  await assertGeometry(page);
});

test("approval workflow changes substantive preview through all four keyboard-selectable stages", async ({
  page,
}) => {
  await visit(page, "universities");
  const stages = page.getByRole("group", { name: "Document approval stages" });
  const preview = page.locator("#workflow-preview");
  const headings = new Set<string>();
  for (const [stage, evidence] of [
    ["Collect", /source|owns/i],
    ["Review", /extracted|passage/i],
    ["Publish", /approv|indexing/i],
    ["Improve", /feedback|reported/i],
  ] as const) {
    const choice = stages.getByRole("button", { name: stage, exact: true });
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect(choice).toBeFocused();
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect(preview).toContainText(evidence);
    const text = await preview.innerText();
    expect(text.length).toBeGreaterThan(100);
    expect(headings.has(text)).toBe(false);
    headings.add(text);
  }
  expect(headings.size).toBe(4);
});

for (const route of ["product"] as const) {
  test(`${route}: example choices change the answer and exact evidence without a network call`, async ({
    page,
    marketingAudit,
  }, testInfo) => {
    await visit(page, route);
    const demo = page.getByTestId("product-example");
    await expect(demo).toBeVisible();
    await expect(demo).toContainText("Illustrative example");
    await expect(demo).toContainText(/synthetic/i);
    const questions = demo.getByRole("group", { name: "Example questions" });
    expect(await questions.getByRole("button").count()).toBeGreaterThanOrEqual(2);
    const answer = demo.getByRole("region", { name: "Example answer", exact: true });
    const source = demo.getByRole("region", { name: "Example source", exact: true });
    const before = marketingAudit.api.length;
    for (const [index, evidence] of exampleEvidence.entries()) {
      const choice = questions.getByRole("button", { name: evidence.question, exact: true });
      await choice.focus();
      await page.keyboard.press(index === 0 ? "Enter" : "Space");
      await expect(choice).toHaveAttribute("aria-pressed", "true");
      await expect(questions.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(answer.getByText(evidence.answer, { exact: true })).toBeVisible();
      await expect(source.locator("blockquote")).toHaveCount(0);
      const citation = demo.getByRole("button", { name: "View example source", exact: true });
      await citation.click();
      await expect(citation).toHaveAttribute("aria-expanded", "true");
      await expect(source).toBeFocused();
      await expect(source.locator("blockquote")).toHaveText(evidence.passage);
      await expect(source).toContainText(evidence.title);
      await expect(source).toContainText(evidence.version);
      await expect(source).toContainText(evidence.locator);
      await expect(source).toContainText(/synthetic|illustration/i);
      await expect(source).toContainText(/not an HCMIU document/i);
      const other = exampleEvidence[index === 0 ? 1 : 0];
      await expect(answer).not.toContainText(other.answer);
      await expect(source).not.toContainText(other.passage);
      await screenshot(page, testInfo, `${route}-example-${index + 1}`);
    }
    expect(
      marketingAudit.api.slice(before),
      "Demo interactions must not call even the mocked API",
    ).toEqual([]);
    expect(
      marketingAudit.api.filter((request) => /answers|jev|openai|typesafe/i.test(request.path)),
    ).toEqual([]);
    expect(marketingAudit.external).toEqual([]);
  });
}

test("reduced motion keeps all new reveals and example transitions visible and still", async ({
  page,
}) => {
  await visit(page, "home");
  const bands = page.locator("main .site-band");
  expect(await bands.count()).toBeGreaterThan(3);
  for (const band of await bands.all()) {
    await band.scrollIntoViewIfNeeded();
    await assertStillVisible(band);
  }
  await visit(page, "product");
  const demo = page.getByTestId("product-example");
  await demo.getByRole("button", { name: exampleEvidence[1].question, exact: true }).click();
  await demo.getByRole("button", { name: "View example source", exact: true }).click();
  await assertStillVisible(demo);
});

test("one pause preference stops new marketing reveals and transitions across routes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await visit(page, "home");
  await page.getByRole("button", { name: "Pause site motion", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume site motion", exact: true })).toBeVisible();
  await page.getByRole("contentinfo").locator('a[href="#/product"]').click();
  await expect(page.locator('[data-site-page="product"]')).toBeVisible();
  const bands = page.locator("main .site-band");
  expect(await bands.count()).toBeGreaterThan(0);
  for (const band of await bands.all()) {
    await band.scrollIntoViewIfNeeded();
    await assertStillVisible(band);
  }
  const demo = page.getByTestId("product-example");
  await demo.getByRole("button", { name: exampleEvidence[1].question, exact: true }).click();
  await demo.getByRole("button", { name: "View example source", exact: true }).click();
  await assertStillVisible(demo);
  await page.getByRole("contentinfo").locator('a[href="#/"]').first().click();
  await expect(page.locator('[data-site-page="home"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume site motion", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
});

for (const preference of ["reduced", "paused"] as const) {
  test(`mobile menu transition is still when ${preference}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({
      reducedMotion: preference === "reduced" ? "reduce" : "no-preference",
    });
    await visit(page, "product");
    if (preference === "paused")
      await page.getByRole("button", { name: "Pause site motion", exact: true }).click();
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    await assertStillVisible(page.getByRole("dialog", { name: "Menu" }));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeFocused();
  });
}

test("changing reduced-motion preference cancels an actual in-flight section reveal", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await visit(page, "product");
  const bands = page.locator("main .site-band");
  expect(await bands.count()).toBeGreaterThan(0);
  // Observe the real WAAPI animation while an unrevealed section enters the viewport.
  const band = bands.last();
  await band.evaluate((element) => element.scrollIntoView({ behavior: "instant" }));
  await expect
    .poll(
      () =>
        band.evaluate((element) =>
          element.getAnimations().some((animation) => animation.playState === "running"),
        ),
      { intervals: [10, 20, 40], timeout: 1500 },
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(
      () =>
        band.evaluate(
          (element) =>
            element.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
      { timeout: 500 },
    )
    .toBe(0);
  await assertStillVisible(band);
});

test("supporting content remains readable when reveal observers are unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: undefined });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await visit(page, "product");
  const bands = page.locator("main .site-band");
  expect(await bands.count()).toBeGreaterThan(0);
  for (const band of await bands.all()) {
    await band.scrollIntoViewIfNeeded();
    await assertStillVisible(band);
  }
});

test("pricing is an honest pilot with no invented prices, checkout or unlimited promise", async ({
  page,
}) => {
  const surface = await visit(page, "pricing");
  const text = await surface.innerText();
  expect(text).toMatch(/pilot/i);
  expect(text).toMatch(
    /not (?:yet )?(?:set|published|final)|no (?:published|public|set)|not been (?:set|published)|pricing.*(?:undecided|unannounced)/i,
  );
  expect(text).not.toMatch(
    /(?:[$€£₫]\s*\d|\d[\d,.]*\s*(?:USD|VND|EUR|GBP|đồng)|\b(?:USD|VND)\s*\d)/i,
  );
  const affirmativeCopy = text
    .split(/[.!?\n]/)
    .filter((sentence) => !/\b(?:no|not|never|without)\b/i.test(sentence))
    .join("\n");
  expect(affirmativeCopy).not.toMatch(/\bunlimited\b|\bfree forever\b|\b\d+\s*%\s*off\b/i);
  await expect(surface.locator('a[href="#/contact"]').first()).toBeVisible();
  await expect(
    surface.getByRole("button", { name: /checkout|buy|subscribe|pay now/i }),
  ).toHaveCount(0);
  await expect(
    surface.locator('a[href*="checkout"],a[href*="stripe"],a[href*="billing"]'),
  ).toHaveCount(0);
});

test("all pages avoid testimonials, fabricated adoption and certification claims", async ({
  page,
}) => {
  for (const route of marketingRoutes) {
    await visit(page, route);
    const text = await page.locator("body").innerText();
    expect(text, route).not.toMatch(
      /testimonials?|what (?:our )?(?:customers|students) say|trusted by|loved by|our customers|customer stories|\b\d[\d,.+]*\s*(?:happy|active|satisfied)\s*(?:users|students|universities)/i,
    );
    expect(text, route).not.toMatch(
      /100\s*%\s*accurate|enterprise.ready|SOC\s*2\s*(?:certified|compliant)|GDPR\s*compliant|99\.9\s*%/i,
    );
    expect(text, route).not.toMatch(
      /\b\d[\d,.+]*\s*(?:customers|universities|institutions|active users)\b|(?:used by|serving|joined by)\s+(?:over\s+)?\d/i,
    );
    await expect(page.locator('[class*="testimonial"],[id*="testimonial"]')).toHaveCount(0);
  }
});

test("contact uses the confirmed public profile and no invented email or sent form", async ({
  page,
}) => {
  const surface = await visit(page, "contact");
  const profile = surface.getByRole("link", { name: /GitHub/i }).first();
  await expect(profile).toHaveAttribute("href", "https://github.com/InugamiDev");
  if ((await profile.getAttribute("target")) === "_blank") {
    await expect(profile).toHaveAttribute("rel", /\bnoopener\b/);
    await expect(profile).toHaveAttribute("rel", /\bnoreferrer\b/);
  }
  await expect(surface.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(surface).not.toContainText(/hello@noti\.school|message sent|we.ve received your/i);
  await expect(surface.getByRole("button", { name: /send message|submit enquiry/i })).toHaveCount(
    0,
  );
});

test("contact preparation and public link remain usable without the Clipboard API", async ({
  page,
  marketingAudit,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  const surface = await visit(page, "contact");
  const before = marketingAudit.api.length;
  const topic = surface.getByRole("button", { name: /What would you like to discuss\?/ });
  const guidance = surface.locator(".site-contact-guidance");
  await expect(guidance).toContainText("describe your role");
  for (const [option, text] of [
    ["Institutional documents", "who owns them"],
    ["Incorrect answer", "questionable claim"],
    ["Account or privacy concern", "private contact method"],
  ] as const) {
    await topic.click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await expect(guidance).toContainText(text);
  }
  await expect(surface).toContainText("Nothing is sent.");
  const profile = surface.getByRole("link", { name: "Open GitHub profile", exact: true });
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute("href", "https://github.com/InugamiDev");
  await profile.focus();
  await expect(profile).toBeFocused();
  // SITE currently offers topic guidance, not a copy utility. Keep the ordinary link usable on HTTP.
  await expect(surface.getByRole("button", { name: /copy/i })).toHaveCount(0);
  testInfo.annotations.push({
    type: "clipboard",
    description:
      "No copy utility in inspected SITE source; exercised unavailable Clipboard API with ordinary contact link and local topic guidance.",
  });
  expect(marketingAudit.api.slice(before)).toEqual([]);
});

for (const route of ["privacy", "terms", "security"] as const) {
  test(`${route}: visibly states pilot limits and pending public-release review`, async ({
    page,
  }) => {
    const surface = await visit(page, route);
    await expect(surface).toContainText(/pilot/i);
    await expect(surface).toContainText(
      /draft|not.*(?:reviewed|verified)|pending.*review|before.*public.*release|remain.*verif|awaiting resolution/i,
    );
    if (route === "terms")
      await expect(surface).toContainText(
        /(?:not|no).*official|not.*(?:replace|substitute)|not.*advice/i,
      );
    if (route === "privacy") await expect(surface).toContainText(/OpenAI|Jev|TypeSafe/);
  });
}
