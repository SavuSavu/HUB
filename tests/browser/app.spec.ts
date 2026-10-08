import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.getByLabel("Access password").fill("browser-test-access");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Search titles")).toBeVisible();
});
async function unlockAfterReload(page: import("@playwright/test").Page) {
  await page.getByLabel("Access password").fill("browser-test-access");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByLabel("Search titles")).toBeVisible();
}
test("search opens real catalog shard and provider link; favorite persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await expect(page.locator(".card").first()).toBeVisible();
  const title = (
    await page.locator(".title-button").first().innerText()
  ).trim();
  await page.getByLabel("Search titles").fill(title);
  await page.locator(".title-button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const external = page.getByRole("link", { name: "Open source player" });
  await expect(external.first()).toHaveAttribute("href", /^https:\/\//);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Favorite", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Favorited", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Close details").click();
  await page.reload();
  await unlockAfterReload(page);
  await page.getByLabel("Search titles").fill("");
  await page
    .locator("aside")
    .getByRole("button", { name: "Favorites", exact: true })
    .click();
  await expect(page.locator(".title-button").first()).toHaveText(title);
  expect(errors).toEqual([]);
});
test("anime search, episode selector, watched history and profile isolation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Anime", exact: true }).click();
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator(".title-button").first().click();
  await expect(page.locator(".episodes button").first()).toBeVisible();
  await page.getByRole("button", { name: "Toggle episode watched" }).click();
  await expect(
    page.locator(".episodes button").filter({ hasText: "✓" }).first(),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Watchlist", exact: true })
    .click();
  await page.getByLabel("Close details").click();
  await page.locator("aside").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Add local profile" }).click();
  await page
    .locator("aside")
    .getByRole("button", { name: "Watchlist", exact: true })
    .click();
  await expect(page.locator(".card")).toHaveCount(0);
});
test("mobile layout and assets continue to work offline after visiting", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator(".title-button").first().click();
  await page.getByLabel("Close details").click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await unlockAfterReload(page);
  await expect(page.locator(".card").first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await unlockAfterReload(page);
  await expect(page.locator(".card").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
});
