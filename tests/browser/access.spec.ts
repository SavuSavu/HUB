import { test, expect } from "@playwright/test";
test("login blocks dashboard imports, catalog requests, storage and service workers until successful", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  await page.goto("./");
  await expect(page.getByLabel("Access password")).toBeVisible();
  await expect(page.getByLabel("Search titles")).toHaveCount(0);
  expect(requested.some((url) => /\/catalog\/|\/sw\.js|\/App-/.test(url))).toBe(
    false,
  );
  expect(
    await page.evaluate(async () => ({
      databases: await indexedDB.databases(),
      workers: await navigator.serviceWorker.getRegistrations(),
    })),
  ).toEqual({ databases: [], workers: [] });
  await page.getByLabel("Access password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Incorrect access password.",
  );
  expect(requested.some((url) => /\/catalog\/|\/sw\.js|\/App-/.test(url))).toBe(
    false,
  );
  await page.waitForTimeout(1100);
  await page.getByLabel("Access password").fill("browser-test-access");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator(".card").first()).toBeVisible();
  await page.getByRole("button", { name: "Lock HUB", exact: true }).click();
  await expect(page.getByLabel("Access password")).toHaveValue("");
  await expect(page.getByLabel("Search titles")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Access password")).toBeVisible();
});
