import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
test.use({ serviceWorkers: "block" });
async function openTitle(page: Page) {
  await page.goto("./");
  await page.getByLabel("Access password").fill("browser-test-access");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator(".card").first()).toBeVisible();
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page.locator(".card").first()).toBeVisible();
  await page.locator(".title-button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function loaded(page: Page) {
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page
    .locator("video")
    .evaluate((video: HTMLVideoElement) => video.pause());
}
test("downloaded video plays locally, saves progress, resumes and releases blob URLs", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await openTitle(page);
  await expect(page.getByRole("dialog").locator("video")).toHaveCount(0);
  const title = await page.getByRole("dialog").locator("h1").innerText();
  await page
    .getByLabel("Choose downloaded video")
    .setInputFiles("tests/fixtures/episode.webm");
  await loaded(page);
  await expect(page.locator("video")).toHaveAttribute("src", /^blob:/);
  const objectUrl = await page.locator("video").getAttribute("src");
  await page.locator("video").evaluate((video: HTMLVideoElement) => {
    video.currentTime = 5;
  });
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThanOrEqual(5);
  await page.getByLabel("Close details").click();
  await page.getByLabel("Search titles").fill(title);
  await page.locator(".title-button").first().click();
  await expect(page.getByRole("dialog").locator("video")).toHaveCount(0);
  await page
    .getByLabel("Choose downloaded video")
    .setInputFiles("tests/fixtures/episode.webm");
  await loaded(page);
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThanOrEqual(5);
  await page.getByRole("button", { name: "Clear video", exact: true }).click();
  await expect(page.getByRole("dialog").locator("video")).toHaveCount(0);
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url!);
        return false;
      } catch {
        return true;
      }
    }, objectUrl),
  ).toBe(true);
  expect(
    requests.some(
      (url) => url.includes("episode.webm") && !url.startsWith("blob:"),
    ),
  ).toBe(false);
});
test("direct cross-origin video file plays with the native media path and clearable state", async ({
  page,
}) => {
  await page.route(
    "https://media-fixture.invalid/movie.webm",
    async (route) => {
      const bytes = readFileSync("tests/fixtures/episode.webm");
      const range = route
        .request()
        .headers()
        ["range"]?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2]
        ? Math.min(Number(range[2]), bytes.length - 1)
        : bytes.length - 1;
      await route.fulfill({
        status: range ? 206 : 200,
        contentType: "video/webm",
        headers: {
          "Accept-Ranges": "bytes",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
            : {}),
        },
        body: bytes.subarray(start, end + 1),
      });
    },
  );
  await openTitle(page);
  await page
    .getByLabel("Direct video URL", { exact: true })
    .fill("https://media-fixture.invalid/movie.webm");
  await page
    .getByRole("button", { name: "Play video link", exact: true })
    .click();
  await loaded(page);
  expect(
    await page
      .locator("video")
      .evaluate((video: HTMLVideoElement) => video.crossOrigin),
  ).toBe(null);
  await expect(
    page.getByText("Video link: media-fixture.invalid"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear video", exact: true }).click();
  await expect(page.locator("video")).toHaveCount(0);
});
test("invalid input does not start a player and mobile file controls fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTitle(page);
  await page
    .getByLabel("Direct video URL", { exact: true })
    .fill("javascript:alert(1)");
  await page
    .getByRole("button", { name: "Play video link", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("HTTPS");
  await expect(page.locator("video")).toHaveCount(0);
  await page
    .getByLabel("Choose downloaded video")
    .setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("text"),
    });
  await expect(page.getByRole("alert")).toHaveText(
    "Choose a non-empty video file.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
