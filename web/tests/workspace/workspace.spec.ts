import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("consultancy onboarding, shared persistence, viewer access, revision recovery and conflicting reviewers", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?workspace=1");
  await expect(
    page.getByRole("heading", { name: "Create your first workspace" }),
  ).toBeVisible();
  const loginAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(loginAccessibility.violations).toEqual([]);
  await page
    .getByLabel("Consultancy / workspace name")
    .fill("Desert survey validation team");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
  await page
    .getByLabel("Create a password (12+ characters)")
    .fill("Real-browser-test-password!4");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Team workspace", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  const mapAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(mapAccessibility.violations).toEqual([]);
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Actual shared desert screening");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  await page.getByText("Enter bounding coordinates").click();
  await page
    .getByRole("button", { name: "Apply rectangular boundary" })
    .click();
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  await page.getByRole("button", { name: "Field", exact: true }).click();
  await page
    .getByLabel("Species / evidence name")
    .fill("SYNTHETIC PRIVATE SURVEY SIGN");
  await page.getByLabel("Longitude", { exact: true }).fill("-114.60");
  await page.getByLabel("Latitude", { exact: true }).fill("37.22");
  await page.getByLabel("Observation date").fill("2026-09-30");
  await page.getByLabel("Observer", { exact: true }).fill("Test biologist");
  await page.getByRole("button", { name: "Add observation" }).click();
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  await page.reload();
  await expect(page.getByLabel("Project", { exact: true })).toContainText(
    "Actual shared desert screening",
  );
  // Cloud projects never leak into the local demo's storage.
  expect(
    await page.evaluate(() => localStorage.getItem("wildscape-screening-v1")),
  ).toBeNull();
  await page
    .getByRole("button", { name: "Team workspace", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email", { exact: true }).fill("viewer@example.test");
  await dialog.getByLabel("Role", { exact: true }).selectOption("viewer");
  await dialog.getByRole("button", { name: "Create invitation link" }).click();
  const invitation = await dialog
    .getByLabel(/Private invitation link/)
    .inputValue();
  await dialog.getByRole("button", { name: "Show saved revisions" }).click();
  await expect(dialog.locator("#revision-list")).toContainText("Version 2");
  const teamAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(teamAccessibility.violations).toEqual([]);
  await page.screenshot({ path: "test-results/workspace-team.png" });
  await dialog.getByRole("button", { name: "Close workspace" }).click();
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await viewer.goto(invitation);
  await viewer
    .getByLabel("Create a password (12+ characters)")
    .fill("Viewer-browser-test-password!9");
  await viewer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(viewer.getByLabel("Project", { exact: true })).toContainText(
    "Actual shared desert screening",
  );
  await viewer.getByRole("button", { name: "Site", exact: true }).click();
  await expect(
    viewer.getByRole("button", { name: "Save project", exact: true }),
  ).toBeDisabled();
  await expect(
    viewer.getByRole("button", { name: "New project", exact: true }),
  ).toBeDisabled();
  // Same editor in two tabs: older tab cannot overwrite a newer server save.
  const other = await page.context().newPage();
  await other.goto("/?workspace=1");
  await other.getByRole("button", { name: "Site", exact: true }).click();
  await page.getByRole("button", { name: "Site", exact: true }).click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Latest owner revision");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  await other
    .getByLabel("Project name", { exact: true })
    .fill("Stale edit must not overwrite");
  await other
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(other.locator("#save-state")).toContainText(
    "Another teammate saved a newer revision",
  );
  await viewer.reload();
  await expect(viewer.getByLabel("Project", { exact: true })).toContainText(
    "Latest owner revision",
  );
  await other
    .getByRole("button", { name: "Team workspace", exact: true })
    .click();
  await expect(other.getByRole("dialog")).toContainText(
    "Unsaved edits need recovery",
  );
  await expect(
    other.getByRole("button", { name: "Download current edits (private)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Team workspace", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Archive current project", exact: true })
    .click();
  await expect(page.getByLabel("Project", { exact: true })).not.toContainText(
    "Latest owner revision",
  );
  await expect(page.locator("#save-state")).toContainText("Saved to workspace");
  await page
    .getByRole("button", { name: "Team workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Show archived projects" }).click();
  await expect(page.locator("#archived-list")).toContainText(
    "Latest owner revision",
  );
  await page
    .getByRole("button", { name: "Restore project", exact: true })
    .click();
  await expect(page.getByLabel("Project", { exact: true })).toContainText(
    "Latest owner revision",
  );
  await page.goto("/?planner=mojave");
  await page
    .getByRole("button", { name: "Inspect point", exact: true })
    .click();
  await expect(page.locator('[data-source="evt"]')).toBeVisible({
    timeout: 40000,
  });
  await page
    .getByLabel("Site name", { exact: true })
    .fill("Mojave candidate A");
  await page
    .getByLabel("Rationale / next action")
    .fill("Field team to verify substrate and access.");
  await page
    .getByRole("button", { name: "Save to consultancy workspace" })
    .click();
  await expect(page.locator("#saved-sites")).toContainText(
    "Mojave candidate A",
  );
  await page
    .getByLabel("Rationale / next action")
    .fill("Keep this unsaved field planning rationale.");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Inspect map center" }).click();
  await expect(page.getByLabel("Rationale / next action")).toHaveValue(
    "Keep this unsaved field planning rationale.",
  );
  await page.route("**/sites/*/", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary test outage" }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Save to consultancy workspace" })
    .click();
  await expect(page.locator("#planner-status")).toContainText(
    "Assessment not confirmed saved",
  );
  await expect(page.getByLabel("Rationale / next action")).toHaveValue(
    "Keep this unsaved field planning rationale.",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export point profile (private GeoJSON)" })
    .click();
  const draftDownload = await downloadPromise;
  const exported = JSON.parse(
    await readFile((await draftDownload.path())!, "utf8"),
  );
  expect(exported.properties.assessment.saveState).toBe("Unsaved draft");
  expect(exported.properties.assessment.rationale).toBe(
    "Keep this unsaved field planning rationale.",
  );
  expect(exported.properties.evidenceToken).toBeUndefined();
  await page.unroute("**/sites/*/");
  await page
    .getByLabel("Rationale / next action")
    .fill("Field team to verify substrate and access.");
  let releaseSave!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route("**/sites/*/", async (route) => {
    if (route.request().method() === "POST") await saveGate;
    await route.continue();
  });
  await page.getByLabel("Team assessment").selectOption("Survey planned");
  await page
    .getByRole("button", { name: "Save to consultancy workspace" })
    .click();
  await expect(page.getByLabel("Rationale / next action")).toBeDisabled();
  await page.getByRole("button", { name: "Inspect map center" }).click();
  await expect(page.locator("#planner-status")).toContainText(
    "Wait before changing locations",
  );
  releaseSave();
  await expect(page.locator("#saved-sites")).toContainText("Survey planned");
  await page.unroute("**/sites/*/");
  await page.reload();
  await page
    .locator("#saved-sites button")
    .filter({ hasText: "Mojave candidate A" })
    .click();
  await expect(page.getByLabel("Rationale / next action")).toHaveValue(
    "Field team to verify substrate and access.",
  );
  await expect(page.getByLabel("Team assessment")).toHaveValue(
    "Survey planned",
  );
  await page.getByRole("button", { name: "Review site history" }).click();
  await expect(page.locator("#site-history-list")).toContainText("Version 2");
  await expect(page.locator("#site-history-list")).toContainText("Version 1");
  await expect(page.locator("#site-history-list")).toContainText(
    "owner@example.test",
  );
  const plannerAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(plannerAccessibility.violations).toEqual([]);
  await viewer.goto("/?planner=mojave");
  await viewer
    .locator("#saved-sites button")
    .filter({ hasText: "Mojave candidate A" })
    .click();
  await expect(
    viewer.getByRole("button", { name: "Save to consultancy workspace" }),
  ).toBeDisabled();
  await page.goto("/?workspace=1");
  await page.route("**/api/session/", (route) => route.abort());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace could not load" }),
  ).toBeVisible();
  await expect(page.locator("#app")).toContainText(
    "server projects have not been replaced with local data",
  );
  await viewerContext.close();
  await other.close();
  expect(errors).toEqual([]);
});
