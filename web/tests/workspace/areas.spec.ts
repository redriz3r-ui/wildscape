import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("record concentrations rank broad areas, retain missing-source state and navigate to an area", async ({
  page,
}) => {
  let requestBody: Record<string, unknown> | undefined;
  await page.route("**/api/mojave/record-areas/", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schema: 1,
        region: "Mojave Basin and Range",
        focalSpecies: "Gopherus agassizii",
        center: [-116, 35],
        cellSizeKm: 25,
        sinceYear: 2020,
        status: "partial",
        retrievedAt: "2026-10-05T00:00:00Z",
        source: "https://www.gbif.org/species/2441814",
        method: "Synthetic count-only check",
        interpretation:
          "Counts are records, not individuals. No records does not mean absence.",
        areas: [
          {
            bounds: [-116.4, 34.8, -116.1, 35.1],
            center: [-116.25, 34.95],
            status: "ok",
            count: 9,
          },
          {
            bounds: [-116.1, 34.8, -115.8, 35.1],
            center: [-115.95, 34.95],
            status: "unavailable",
            count: null,
          },
        ],
      }),
    });
  });
  await page.goto("/?planner=mojave");
  await page.getByLabel("Record year").selectOption("2020");
  await page.getByRole("button", { name: "Find recorded areas" }).click();
  await expect(page.locator("#areas-status")).toContainText("1 unavailable");
  await expect(page.locator("#areas-status")).toContainText("2020 onward");
  await expect(page.locator(".record-area")).toHaveCount(2);
  await expect(page.locator(".record-area").first()).toContainText(
    "9 public records",
  );
  await expect(page.locator(".record-area").last()).toContainText(
    "Count unavailable",
  );
  expect(requestBody?.sinceYear).toBe(2020);
  const artifact = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export ranked areas (GeoJSON)" })
    .click();
  const geojson = JSON.parse(
    await readFile((await (await artifact).path())!, "utf8"),
  );
  expect(geojson.features).toHaveLength(2);
  expect(geojson.features[0].properties.count).toBe(9);
  expect(geojson.features[1].properties.count).toBeNull();
  expect(geojson.metadata.sinceYear).toBe(2020);
  await page.locator(".record-area").first().locator("button").first().click();
  await expect(page.locator("#areas-status")).toContainText(
    "not an animal location",
  );
  await expect(page.getByLabel("Longitude", { exact: true })).toHaveValue(
    "-116",
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
