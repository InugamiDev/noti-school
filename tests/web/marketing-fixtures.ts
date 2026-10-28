import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import base, {
  type Locator,
  type Page,
  type TestInfo,
} from "../../apps/web/node_modules/@playwright/test/index.js";

const { expect } = base;

// intent: isolate website acceptance from live services; status: updated for the Clay site; next: combined candidate run.
export const institutionId = "11111111-1111-4111-8111-111111111111";
export const institutionName = "Example institution · synthetic QA fixture";
export const marketingRoutes = [
  "home",
  "product",
  "students",
  "universities",
  "pricing",
  "about",
  "help",
  "contact",
  "security",
  "privacy",
  "terms",
  "changelog",
] as const;
export type MarketingRoute = (typeof marketingRoutes)[number];
export const hrefFor = (name: MarketingRoute) => (name === "home" ? "#/" : `#/${name}`);
// Landing anchors (`#how`) are routes too: they open the landing and scroll to the section.
export const landingSections = ["scope", "how", "roles", "reads", "join", "faq"] as const;
export const artifactRoot = fileURLToPath(
  new URL("./artifacts/marketing/", import.meta.url),
);

// Independent expected text, read from the synthetic design example; never import the component as its own oracle.
export const exampleEvidence = [
  {
    question: "Where is the practice handbook?",
    answer:
      "In this example, open the Sample Library and choose “Practice handbook”. The document index identifies the current example version.",
    title: "Sample Library guide",
    locator: "Section 1 · Finding a document",
    version: "Example version A",
    passage:
      "The Sample Library lists the Practice handbook in its document index. Select “Practice handbook” to open it. The index marks the current example version beside the title.",
  },
  {
    question: "Which version of the sample form should I use?",
    answer:
      "Use version B of the Practice request form in this fictional collection. Version A is archived and is kept only for reference.",
    title: "Practice request form, version note",
    locator: "Section 2 · Version history",
    version: "Example version B",
    passage:
      "Practice request form, version B, replaces version A in this sample collection. Version A is archived for reference and should not be used for a new practice request.",
  },
] as const;

type NetworkRecord = { method: string; path: string };
export type MarketingAudit = {
  api: NetworkRecord[];
  external: string[];
  unexpectedApi: NetworkRecord[];
  errors: string[];
};

export const test = base.extend<{ marketingAudit: MarketingAudit }>({
  marketingAudit: [
    async ({ page, context, baseURL }, use, testInfo) => {
      if (!baseURL) throw new Error("Marketing acceptance needs an explicitly configured baseURL.");
      const origin = new URL(baseURL).origin;
      const audit: MarketingAudit = { api: [], external: [], unexpectedApi: [], errors: [] };
      const deliberateFailures = new Set<string>();
      page.on("pageerror", (error) => audit.errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // Exempt only Chromium's resource message for an exact URL deliberately fulfilled as 503.
        if (
          deliberateFailures.has(message.location().url) &&
          /^Failed to load resource: the server responded with a status of 503\b/.test(
            message.text(),
          )
        )
          return;
        audit.errors.push(`console: ${message.text()} @ ${message.location().url}`);
      });
      page.on("requestfailed", (request) => {
        audit.errors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText})`);
      });
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) {
          audit.external.push(url.href);
          await route.abort("blockedbyclient");
          return;
        }
        if (!url.pathname.startsWith("/api/")) {
          await route.continue();
          return;
        }
        const record = { method: request.method(), path: url.pathname };
        audit.api.push(record);
        const disabled = { state: "disabled", reason: "not_configured" };
        if (record.method === "GET" && url.pathname === "/api/v1/capabilities") {
          await route.fulfill({
            json: {
              mode: "disabled",
              answers: disabled,
              indexing: disabled,
              discovery: disabled,
              google: disabled,
              email: disabled,
              identity: disabled,
            },
          });
        } else if (record.method === "GET" && url.pathname === "/api/v1/institutions") {
          await route.fulfill({
            json: {
              items: [
                {
                  id: institutionId,
                  slug: "synthetic-qa",
                  name: institutionName,
                  coverage: "synthetic_demo",
                },
              ],
              next_cursor: null,
            },
          });
        } else {
          const expected =
            record.method === "GET" &&
            (url.pathname === "/api/v1/me" ||
              url.pathname === `/api/v1/institutions/${institutionId}/sources`);
          if (!expected) audit.unexpectedApi.push(record);
          deliberateFailures.add(url.href);
          await route.fulfill({
            status: 503,
            json: {
              error: {
                code: "core_unavailable",
                message: "Deliberate synthetic QA unavailable fixture",
                request_id: institutionId,
                retryable: false,
              },
            },
          });
        }
      });
      await use(audit);
      await testInfo.attach("marketing-network-and-errors", {
        body: JSON.stringify(audit, null, 2),
        contentType: "application/json",
      });
      expect(
        audit.external,
        "No external requests, including providers, fonts or telemetry",
      ).toEqual([]);
      expect(
        audit.unexpectedApi,
        "Only the explicit disabled-service fixtures may be requested",
      ).toEqual([]);
      expect(audit.errors, "Unexpected JavaScript, resource or console errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function visit(page: Page, route: MarketingRoute) {
  await page.goto(`/${hrefFor(route)}`);
  // Settle local bootstrap assets/fixtures before a test navigates away or starts its no-request audit.
  await page.waitForLoadState("networkidle");
  const surface = page.locator(`[data-site-page="${route}"]`);
  await expect(surface).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return surface;
}

export async function assertGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const outside: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(
      "h1,h2,h3,p,a,button,input,textarea,select,summary,blockquote",
    )) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        style.visibility === "hidden" ||
        style.display === "none" ||
        // aria-hidden covers framework-internal form proxies (e.g. Kobalte's visually hidden native select).
        element.closest("[hidden],[inert],[aria-hidden='true']")
      )
        continue;
      if (rect.left < -1 || rect.right > innerWidth + 1) {
        outside.push(
          `${element.tagName}: ${element.textContent?.trim().slice(0, 70)} [${rect.left}, ${rect.right}]`,
        );
      }
      if (
        /^(H[1-3]|P|BLOCKQUOTE|SUMMARY)$/.test(element.tagName) &&
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        outside.push(
          `${element.tagName}: text clipped inside ${element.clientWidth}px (${element.scrollWidth}px content)`,
        );
      }
    }
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      outside,
    };
  });
  expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.body, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(
    geometry.outside,
    "Visible text and controls must fit, even if overflow is clipped",
  ).toEqual([]);
}

export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await mkdir(artifactRoot, { recursive: true });
  const path = `${artifactRoot}/${name}.png`;
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

export async function tabTo(page: Page, target: Locator, backwards = false) {
  for (let index = 0; index < 60; index++) {
    await page.keyboard.press(backwards ? "Shift+Tab" : "Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, "Control must be reachable through the actual tab order").toBeFocused();
}

export async function assertStillVisible(surface: Locator) {
  const sample = () =>
    surface.evaluate((root) => {
      const elements = [root, ...root.querySelectorAll("h1,h2,p,button,summary,blockquote")];
      return elements
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            text: element.textContent?.slice(0, 70),
            x: rect.x,
            y: rect.y,
            opacity: style.opacity,
            transform: style.transform,
            visibility: style.visibility,
          };
        });
    });
  const first = await sample();
  expect(first.length).toBeGreaterThan(0);
  for (const value of first) {
    expect(Number(value.opacity), value.text).toBeGreaterThan(0.95);
    expect(value.visibility, value.text).toBe("visible");
  }
  // Sample rendered DOM across real frames; a pause data attribute alone is not evidence.
  await surface.page().waitForTimeout(120);
  expect(await sample()).toEqual(first);
  const moving = await surface.evaluate(
    (root) =>
      root.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running")
        .length,
  );
  expect(
    moving,
    "New marketing surfaces must have no running animation while motion is disabled",
  ).toBe(0);
}
