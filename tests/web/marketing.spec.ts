import type { Page } from "../../apps/web/node_modules/@playwright/test/index.js";
import {
  test,
  expect,
  marketingRoutes,
  hrefFor,
  institutionName,
  exampleEvidence,
  visit,
  screenshot,
  assertGeometry,
  assertStillVisible,
  tabTo,
  type MarketingRoute,
} from "./marketing-fixtures";

// intent: enforce the frozen website brief; status: authored; next: run against integrated SITE source.
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
  home: "noti.school",
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
        const hero = page.locator(".hero");
        const heroRect = await hero.boundingBox();
        expect(heroRect).not.toBeNull();
        expect(
          heroRect!.y + heroRect!.height,
          "The next section must begin in the first viewport",
        ).toBeLessThan(viewport.height);
      } else if (viewport.name === "desktop") {
        const header = page.getByRole("banner");
        const rect = await header.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.height, "Desktop navigation must fit below 80px").toBeLessThan(80);
        const centers = await header
          .locator(".site-desktop > a, .site-desktop > div > button, .site-workspace > a")
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
      if (href.startsWith("#/"))
        expect(known.has(href), `${route}: dangling route ${href}`).toBe(true);
      else if (href.startsWith("#")) {
        expect(
          await page.evaluate((id) => document.getElementById(id) !== null, href.slice(1)),
          href,
        ).toBe(true);
      } else {
        expect(
          href,
          "Only the confirmed public contact profile is an approved external website destination",
        ).toBe("https://github.com/InugamiDev");
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

test("mobile navigation opens by keyboard, closes with Escape, outside and route selection", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, "home");
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  const controlled = await open.getAttribute("aria-controls");
  expect(controlled, "Menu toggle must identify its controlled region").toBeTruthy();
  await tabTo(page, open, true);
  await page.keyboard.press("Enter");
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(`[id="${controlled}"]`);
  await expect(menu).toBeVisible();
  await assertGeometry(page);
  await screenshot(page, testInfo, "mobile-navigation-open");
  const product = menu.getByRole("link", { name: "Product", exact: true });
  await tabTo(page, product);
  await page.keyboard.press("Escape");
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(open).toBeFocused();
  await expect(product).not.toBeVisible();
  await page.keyboard.press("Enter");
  await close.click();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await page.getByRole("contentinfo").getByRole("heading", { name: "Trust", exact: true }).click();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await open.click();
  await tabTo(page, product);
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-site-page="product"]')).toBeVisible();
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await screenshot(page, testInfo, "mobile-navigation-closed");
});

test("desktop Resources disclosure supports keyboard entry, Escape and route focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, "home");
  const resources = page.getByRole("button", { name: "Resources", exact: true });
  await tabTo(page, resources, true);
  await page.keyboard.press("Enter");
  await expect(resources).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator("#site-resources");
  const help = menu.getByRole("link", { name: "Help", exact: true });
  await page.keyboard.press("Tab");
  await expect(help).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(resources).toBeFocused();
  await expect(menu).toHaveCount(0);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-site-page="help"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("home preserves a bilingual prompt through marketing navigation and reload", async ({
  page,
  marketingAudit,
}) => {
  await visit(page, "home");
  const prompt = page.getByRole("textbox", { name: "Your question", exact: true });
  await expect(page.getByRole("combobox", { name: /institution/i })).toContainText(institutionName);
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

test("home FAQ disclosures open and close with keyboard without submitting a question", async ({
  page,
  marketingAudit,
}) => {
  const surface = await visit(page, "home");
  const disclosures = surface.locator("details").filter({ has: page.locator("summary") });
  expect(await disclosures.count()).toBeGreaterThanOrEqual(5);
  expect(await disclosures.count()).toBeLessThanOrEqual(6);
  for (const disclosure of await disclosures.all()) {
    const summary = disclosure.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(disclosure).toHaveAttribute("open", "");
    expect(
      (await disclosure.innerText()).replace(await summary.innerText(), "").trim().length,
    ).toBeGreaterThan(30);
    await page.keyboard.press("Space");
    await expect(disclosure).not.toHaveAttribute("open", "");
  }
  expect(marketingAudit.api.filter((request) => request.method !== "GET")).toEqual([]);
});

test("Help filters real FAQ answers by search and category, with empty-state recovery", async ({
  page,
}) => {
  const surface = await visit(page, "help");
  const search = surface.getByRole("searchbox", { name: "Search help", exact: true });
  const details = surface.locator("details");
  await expect(details).toHaveCount(10);
  await search.fill("VIETNAMESE");
  await expect(details).toHaveCount(1);
  await expect(details.locator("summary")).toHaveText("Can I ask in Vietnamese?");
  await details.locator("summary").click();
  await expect(details.locator("p")).toBeVisible();
  await expect(details.locator("p")).toContainText(
    "Bilingual answer quality still needs evaluation",
  );
  await expect(details.getByRole("link")).toHaveAttribute("href", "#/");
  await search.fill("");
  const categories = surface.getByRole("group", { name: "Help categories" });
  for (const [category, count] of [
    ["Answers", 3],
    ["Sources", 3],
    ["Accounts", 2],
    ["Pilot", 2],
  ] as const) {
    const button = categories.getByRole("button", { name: category, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(details).toHaveCount(count);
    await expect(surface.getByRole("status")).toContainText(`${count} answers found`);
  }
  await search.fill("zz-synthetic-no-matching-help-921");
  await expect(details).toHaveCount(0);
  await expect(surface.getByRole("heading", { name: "No matching help articles." })).toBeVisible();
  await expect(surface.getByRole("status")).toContainText("0 answers found");
  await surface.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(categories.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(details).toHaveCount(10);
  await assertGeometry(page);
});

test("approval workflow changes substantive preview through all four keyboard-selectable stages", async ({
  page,
}) => {
  await visit(page, "home");
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

for (const route of ["home", "product"] as const) {
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
    const draft = "Synthetic draft — giữ nguyên câu hỏi của tôi.";
    if (route === "home")
      await page.getByRole("textbox", { name: "Your question", exact: true }).fill(draft);
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
    if (route === "home")
      await expect(page.getByRole("textbox", { name: "Your question", exact: true })).toHaveValue(
        draft,
      );
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
  await page.getByRole("contentinfo").locator('a[href="#/"]').click();
  await expect(page.getByRole("button", { name: "Resume animation", exact: true })).toBeVisible();
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
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await assertStillVisible(
      page.getByRole("navigation", { name: "Site navigation", exact: true }),
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
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
  const topic = surface.getByRole("combobox", {
    name: "What would you like to discuss?",
    exact: true,
  });
  const guidance = surface.locator(".site-contact-guidance");
  await expect(guidance).toContainText("Describe your role");
  await topic.selectOption("Institutional documents");
  await expect(guidance).toContainText("who owns them");
  await topic.selectOption("Incorrect answer");
  await expect(guidance).toContainText("questionable claim");
  await topic.selectOption("Account or privacy concern");
  await expect(guidance).toContainText("private contact method");
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
