import { test, expect } from "@playwright/test";
test("globe, terrain, modes, species, occurrence, fly-to, spatial query and attribution", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?explore=1");
  await expect(
    page.getByRole("heading", { name: "A world to look closer." }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator('[data-world="mojave-fixture"]').click();
  await expect(page.locator("#guide")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#scene")).toHaveAttribute("data-loaded", "true");
  await expect(page.locator(".species-card")).toHaveCount(12);
  for (const mode of [
    "Aerial",
    "Vegetation",
    "Elevation",
    "Species",
    "World",
  ]) {
    const b = page.getByRole("button", { name: mode, exact: true });
    await b.click();
    await expect(b).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("Find a species").fill("blackbrush");
  await expect(page.locator(".species-card")).toHaveCount(1);
  await page.locator(".species-card").click();
  await expect(page.locator("#detail")).toContainText("Coleogyne ramosissima");
  await page.getByRole("button", { name: "Fit to observations" }).click();
  await page.locator("[data-record]").first().click();
  await expect(page.locator("#detail")).toContainText("Dataset");
  await page.getByRole("button", { name: "Fly to record" }).click();
  await expect(page.getByRole("button", { name: "Fly to record" })).toBeEnabled(
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Reset landscape view" }).click();
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "What’s been found here?" }).click();
  await expect(page.locator("#detail")).toContainText("What’s been");
  await expect(page.getByLabel("Location query radius")).toHaveValue("2");
  await page.getByLabel("Location query radius").selectOption("5");
  await expect(page.locator("#nearby-species button")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.locator("canvas").click({ position: { x: 760, y: 500 } });
  await expect(page.locator("#detail")).toContainText("What’s been");
  await page.getByRole("button", { name: "Data & sources" }).click();
  await expect(page.getByRole("dialog")).toContainText("Fixture demonstration");
  await page.getByRole("button", { name: "Close data sources" }).click();
  await page.screenshot({ path: "test-results/landscape-acceptance.png" });
  await page.getByRole("button", { name: "Return to Earth" }).click();
  await expect(page.locator("#globe-ui")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
test("narrow viewport and keyboard accessible controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?explore=1");
  await page.locator('[data-world="mojave-fixture"]').click();
  await expect(page.locator("#guide")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Collapse species explorer" }).click();
  await expect(
    page.getByRole("button", { name: "Field guide", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "What’s been found here?" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Location query radius")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-acceptance.png" });
});

test("real World 001 serves verified terrain and GBIF evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?explore=1");
  await page.locator('[data-world="mojave-001"]').click();
  await expect(page.locator("#scene")).toHaveAttribute("data-loaded", "true", {
    timeout: 30000,
  });
  await expect(page.locator("#fixture-label")).toBeHidden();
  await expect
    .poll(() => page.locator(".species-card").count())
    .toBeGreaterThan(100);
  await page.getByLabel("Find a species").fill("Encelia virginensis");
  await expect(page.locator(".species-card")).toHaveCount(1);
  await page.locator(".species-card").click();
  await expect(page.locator("#detail")).toContainText("Encelia virginensis");
  await page.locator("[data-record]").first().click();
  await expect(page.locator("#detail")).toContainText("gbif");
  await page.getByRole("button", { name: "Fly to record" }).click();
  await expect(page.getByRole("button", { name: "Fly to record" })).toBeEnabled(
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "What’s been found here?" }).click();
  await page.getByLabel("Location query radius").selectOption("5");
  await expect(page.locator("#nearby-species button")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Aerial", exact: true }).click();
  await page.screenshot({ path: "test-results/real-world-acceptance.png" });
  await page.getByRole("button", { name: "Data & sources" }).click();
  await expect(page.getByRole("dialog")).toContainText("USGS 3DEP");
  await expect(page.getByRole("dialog")).toContainText("LANDFIRE");
  expect(errors).toEqual([]);
});

test("sun controls compute and display DEM cast shadows", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?explore=1");
  await page.locator('[data-world="mojave-fixture"]').click();
  await expect(page.locator("#scene")).toHaveAttribute("data-loaded", "true");
  await page.locator("#sun-controls summary").click();
  await page.getByLabel("Sun lighting", { exact: true }).check();
  await expect(page.locator("#sun-stats")).toContainText("km²", {
    timeout: 15000,
  });
  await page.getByLabel("Sun height", { exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#sun-height")).toHaveText("5°");
  await expect(page.locator("#sun-stats")).toContainText("km²", {
    timeout: 15000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "test-results/sun-shadows.png" });
  await page.getByLabel("Terrain cast shadows", { exact: true }).uncheck();
  await expect(page.locator("#sun-stats")).toContainText("0.00 km² (0.0%)", {
    timeout: 15000,
  });
  await page.getByLabel("Sun lighting", { exact: true }).uncheck();
  await expect(page.locator("#sun-stats")).toHaveText("Sun lighting off.");
  expect(errors).toEqual([]);
});

test("close zoom loads detailed local imagery tiles and real terrain shadows", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    levels: number[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    const match = r.url().match(/imagery\/tiles\/(\d+)\//);
    if (match) {
      if (!r.ok()) errors.push("Tile HTTP " + r.status());
      else levels.push(Number(match[1]));
    }
  });
  await page.goto("/?explore=1");
  await page.locator('[data-world="mojave-001"]').click();
  await expect(page.locator("#scene")).toHaveAttribute("data-loaded", "true", {
    timeout: 30000,
  });
  await page.locator("#sun-controls summary").click();
  await expect(page.locator("#raster-detail")).toContainText("1.0 m/pixel");
  for (let i = 0; i < 9; i++)
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(() => Math.max(-1, ...levels), { timeout: 30000 }).toBe(5);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/detail-before-sun.png" });
  await page.getByLabel("Sun lighting", { exact: true }).check();
  await page.getByLabel("Sun height", { exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(page.locator("#sun-stats")).toContainText("km²", {
    timeout: 15000,
  });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/detailed-imagery-and-sun.png" });
  await page.getByRole("button", { name: "Elevation", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "World", exact: true }).click();
  await page
    .getByRole("button", { name: "Return to Earth", exact: true })
    .click();
  await page.locator('[data-world="mojave-fixture"]').click();
  await expect(page.locator("#scene")).toHaveAttribute("data-loaded", "true");
  expect(errors).toEqual([]);
});
