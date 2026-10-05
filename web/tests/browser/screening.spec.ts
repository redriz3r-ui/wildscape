import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
test("real regional pack: project, habitat, field privacy, decisions and portable exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project definition" }),
  ).toBeVisible();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Pilot workflow verification");
  await page
    .getByLabel("Client / project owner")
    .fill("Internal test — not a client");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.getByText("Enter bounding coordinates").click();
  await page
    .getByRole("button", { name: "Apply rectangular boundary" })
    .click();
  await expect(page.locator(".metrics")).not.toContainText("—");
  await page.getByRole("button", { name: "Habitat", exact: true }).click();
  await expect(page.locator("#panel .attribute-grid").first()).toContainText(
    "Sampled cells",
  );
  await page
    .getByLabel("Interpretation, field checks and limitations")
    .fill(
      "Workflow test using real raster context; no field habitat validation.",
    );
  await page.getByLabel("Habitat evidence and limitations reviewed").check();
  await page.getByRole("button", { name: "Save habitat review" }).click();
  await page.getByRole("button", { name: "Field", exact: true }).click();
  await page.getByLabel("Species / evidence name").fill("PRIVATE TEST SPECIES");
  await page.getByLabel("Longitude", { exact: true }).fill("-114.601234");
  await page.getByLabel("Latitude", { exact: true }).fill("37.221234");
  await page.getByLabel("Observation date").fill("2026-09-28");
  await page.getByLabel("Observer", { exact: true }).fill("Test observer");
  await page.getByRole("button", { name: "Add observation" }).click();
  await expect(page.locator("#panel")).toContainText("1 entries");
  await page.getByRole("button", { name: "Species", exact: true }).click();
  await page.locator("[data-species]").first().click();
  await page
    .getByLabel("Decision", { exact: true })
    .selectOption("Survey recommended");
  await page
    .getByLabel("Evidence-based rationale")
    .fill("Regional candidate requires field confirmation.");
  await page
    .getByLabel("Next action / survey need")
    .fill("Reviewer to select appropriate protocol and season.");
  await page.getByLabel("Reviewing biologist").fill("Test biologist");
  await page.getByRole("button", { name: "Save species decision" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Species", exact: true }).click();
  await expect(page.locator(".species-list")).toContainText(
    "Survey recommended",
  );
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  const get = async (name: string) => {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name, exact: true }).click();
    return readFile((await (await promise).path())!, "utf8");
  };
  const gis = await get("Shared project GIS (.geojson)");
  expect(gis).not.toContain("-114.601234");
  expect(JSON.parse(gis).features[0].geometry.type).toBe("Polygon");
  const report = await get("Printable report (.html)");
  expect(report).not.toContain("-114.601234");
  expect(report).toContain("DRAFT");
  expect(report).toContain("<svg");
  expect(report).not.toContain("<image");
  await writeFile("test-results/pilot-screening-report.html", report);
  const preview = await page.context().newPage();
  await preview.setContent(report);
  await preview.screenshot({
    path: "test-results/pilot-report.png",
    fullPage: true,
  });
  await preview.close();
  const backup = await get("Private project backup (.json)");
  expect(backup).toContain("-114.601234");
  await page.screenshot({ path: "test-results/screening-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/screening-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator("#coordinates")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().bottom <=
          document.querySelector("#panel")!.getBoundingClientRect().top,
      ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("all review gates and evidence changes reopen assessment", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project definition" }),
  ).toBeVisible();
  await page.getByLabel("Client / project owner").fill("Internal validation");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page.locator("#boundary-file").setInputFiles({
    name: "pilot.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [-114.625, 37.2],
            [-114.57, 37.2],
            [-114.57, 37.245],
            [-114.625, 37.245],
            [-114.625, 37.2],
          ],
        ],
      }),
    ),
  });
  await page.getByRole("button", { name: "Species", exact: true }).click();
  const count = await page.locator("[data-species]").count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    await page.locator("[data-species]").nth(i).click();
    await page
      .getByLabel("Decision", { exact: true })
      .selectOption("Retain for screening");
    await page
      .getByLabel("Evidence-based rationale")
      .fill("TEST ONLY: retained pending real project assessment.");
    await page.getByLabel("Reviewing biologist").fill("Test reviewer");
    await page.getByRole("button", { name: "Save species decision" }).click();
  }
  await page.getByRole("button", { name: "Habitat", exact: true }).click();
  await page
    .getByLabel("Interpretation, field checks and limitations")
    .fill("TEST ONLY: raster inspection workflow; no field validation.");
  await page.getByLabel("Habitat evidence and limitations reviewed").check();
  await page.getByRole("button", { name: "Save habitat review" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByLabel("Reviewing biologist").fill("Test reviewer");
  await page
    .getByLabel("Sources checked, dates, findings and outstanding gaps")
    .fill("TEST ONLY: validation of review gate, not actual agency checks.");
  await page.getByLabel("Relevant agency and regional sources checked").check();
  await page.getByRole("button", { name: "Save review details" }).click();
  await page
    .getByRole("button", { name: "Record completed consultant review" })
    .click();
  await expect(page.locator(".eyebrow")).toContainText("Reviewed");
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await page.getByLabel("Search distance (m · 0–10,000)").fill("500");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator(".eyebrow")).toContainText("Draft");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator("#panel")).toContainText(
    "species need a recorded review decision",
  );
  await expect(
    page.getByLabel("Relevant agency and regional sources checked"),
  ).not.toBeChecked();
});
test("draw boundary, add cited candidate, import survey effort, restore private backup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project definition" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Draw boundary", exact: true })
    .click();
  const map = page.locator(".plan-map"),
    b = (await map.boundingBox())!;
  for (const [x, y] of [
    [0.45, 0.45],
    [0.55, 0.45],
    [0.5, 0.55],
  ])
    await map.click({ position: { x: b.width * x, y: b.height * y } });
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.locator(".metrics")).not.toContainText("—");
  await page.getByRole("button", { name: "Species", exact: true }).click();
  await page.getByText("Add a candidate species", { exact: true }).click();
  await page
    .getByLabel("Scientific name", { exact: true })
    .fill("Testus syntheticus");
  await page
    .getByLabel("Reason to include")
    .fill("Synthetic test candidate — not a real taxon");
  await page
    .getByLabel("Reference URL")
    .fill("https://example.org/test-reference");
  await page.getByRole("button", { name: "Add cited candidate" }).click();
  await expect(page.locator(".species-list")).toContainText(
    "Testus syntheticus",
  );
  await page.getByRole("button", { name: "Field", exact: true }).click();
  const feature = {
    type: "Feature",
    id: "survey-test-1",
    geometry: {
      type: "LineString",
      coordinates: [
        [-114.6, 37.22],
        [-114.601, 37.221],
      ],
    },
    properties: {
      name: "Testus syntheticus",
      date: "2026-09-28",
      observer: "Test observer",
      method: "Synthetic transect",
      effort: "10 minutes",
      sensitive: false,
    },
  };
  await page.locator("#field-file").setInputFiles({
    name: "survey.geojson",
    mimeType: "application/geo+json",
    buffer: Buffer.from(
      JSON.stringify({ type: "FeatureCollection", features: [feature] }),
    ),
  });
  await expect(page.locator("#panel")).toContainText("Survey track");
  await expect(page.locator("#panel")).toContainText("10 minutes");
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Private project backup (.json)",
      exact: true,
    })
    .click();
  const data = await readFile((await (await pending).path())!);
  await page.locator("#backup").setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: data,
  });
  await page.getByRole("button", { name: "Field", exact: true }).click();
  await expect(page.locator("#panel")).toContainText("Survey track");
  await expect(page.locator("#project-select option")).toHaveCount(2);
  await page.getByRole("button", { name: "Remove field entry" }).click();
  await expect(page.locator("#panel")).toContainText("0 entries");
});

test("map exploration reveals habitat and species before starting a project", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Read the landscape" }),
  ).toBeVisible();
  await expect(page.locator(".earth-layer")).toHaveCount(3);
  await expect(page.locator(".earth-location dt")).toContainText([
    "Longitude",
    "Latitude",
    "Coordinate system",
    "Raster lookup",
  ]);
  await expect(
    page.locator(".earth-layer").first().locator("dt"),
  ).toContainText([
    "Mapped class",
    "Class code",
    "Source resolution",
    "Analysis cell",
    "Interpretation",
    "Source",
  ]);
  await page.screenshot({ path: "test-results/explore-desktop.png" });
  await page.getByLabel("Map layer").selectOption("evc");
  await expect(page.locator("#map-key")).toContainText("Vegetation cover");
  await expect(page.locator("#map-key")).toContainText("classes");
  await page.getByLabel("Map layer").selectOption("imagery");
  await expect(page.locator(".earth-layer").first()).not.toContainText(
    "No mapped value",
  );
  await expect(page.locator(".earth-species-list")).not.toBeEmpty();
  await page.getByRole("button", { name: /Whole region/ }).click();
  await expect(page.locator(".earth-thumb img").first()).toBeVisible();
  await page.getByRole("button", { name: /Birds 64/ }).click();
  await expect(page.locator(".earth-species")).toHaveCount(64);
  await page.getByRole("button", { name: /Plants 57/ }).click();
  await expect(page.locator(".earth-species")).toHaveCount(57);
  await page.getByLabel("Taxonomic order").selectOption("Fagales");
  await expect(page.locator(".earth-species")).toHaveCount(1);
  await page.getByLabel("Taxonomic order").selectOption("All");
  await page.getByRole("button", { name: /All species 124/ }).click();
  await expect(page.locator(".earth-species").count()).resolves.toBeGreaterThan(
    100,
  );
  await page.getByLabel("Find a regional species").fill("Quercus");
  await expect(page.locator(".earth-species-list")).toContainText("Quercus");
  await page.locator(".earth-species").first().click();
  await expect(page.locator(".earth-detail > .attribute-grid")).toContainText(
    "Scientific name",
  );
  await expect(page.locator(".earth-detail > .attribute-grid")).toContainText(
    "Earliest record",
  );
  await expect(page.locator(".earth-detail > .attribute-grid")).toContainText(
    "Habitat association",
  );
  await expect(page.locator(".earth-photo figcaption")).toContainText(
    "Original image",
  );
  await expect
    .poll(() =>
      page
        .locator(".earth-photo img")
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.locator(".earth-detail").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/species-photo-detail.png" });
  const before = await page.locator(".earth-location").innerText();
  await page.locator(".plan-map").click({ position: { x: 250, y: 220 } });
  await expect(page.locator(".earth-location")).not.toHaveText(before);
  await page.getByLabel("Search radius").selectOption("5000");
  await expect(page.locator(".earth-panel")).toContainText("5 km");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/explore-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start a project screening" }).click();
  await expect(
    page.getByRole("heading", { name: "Project definition" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
