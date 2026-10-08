import { test, expect, type Page } from "@playwright/test";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import type { Title } from "../../src/types";
// Isolate routed test media from the real offline worker; offline behavior has separate tests.
test.use({ serviceWorkers: "block" });
const episodes = [
  { id: "s1e1", season: 1, number: 1, title: "First episode" },
  { id: "s1e2", season: 1, number: 2, title: "Second episode" },
  { id: "s2e1", season: 2, number: 1, title: "Season two" },
].map((e) => ({
  ...e,
  links: [
    {
      source: "fsonline-app",
      url: "https://provider.invalid/episode/" + e.id,
      playback: {
        url: `http://localhost:4173/HUB/test-media/${e.id}.webm`,
        type: "file" as const,
        cacheAllowed: false,
      },
    },
  ],
}));
const title: Title = {
  id: "player-test",
  title: "Playback test fixture",
  kind: "anime",
  description: "Synthetic browser-test catalog only.",
  genres: [],
  links: episodes[0].links,
  episodes,
};
async function openPlayer(page: Page, externalNext = false) {
  const item = structuredClone(title);
  if (externalNext) delete item.episodes[1].links[0].playback;
  const { description, episodes, ...summary } = item;
  await page.route("**/catalog/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = JSON.stringify(
      path.includes("index.json")
        ? [{ ...summary, shard: "player-test.json" }]
        : path.includes("player-test.json")
          ? [item]
          : [],
    );
    await route.fulfill({
      status: 200,
      contentType: path.endsWith(".gz")
        ? "application/gzip"
        : "application/json",
      body: path.endsWith(".gz") ? gzipSync(body) : body,
    });
  });
  await page.route("**/test-media/**", async (route) => {
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
  });
  await page.goto("./");
  await page.getByLabel("Access password").fill("browser-test-access");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.locator(".title-button").first().click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.pause());
}
async function endEpisode(page: Page) {
  await page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.currentTime = v.duration;
    v.dispatchEvent(new Event("ended"));
    v.dispatchEvent(new Event("ended"));
  });
}
test("outro shortcut marks watched, loads the next media and preserves the provider", async ({
  page,
}) => {
  await openPlayer(page);
  await expect(
    page.getByRole("button", { name: "Skip outro", exact: true }),
  ).toHaveCount(0);
  await page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.currentTime = 11;
    v.dispatchEvent(new Event("timeupdate"));
  });
  await expect(
    page.getByRole("button", { name: "Skip outro", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip outro", exact: true }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /s1e2\.webm$/);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    )
    .toBe(false);
  await expect(page.locator(".episodes .selected")).toContainText(
    "Second episode",
  );
  await expect(
    page.locator(".episodes button").filter({ hasText: "First episode" }),
  ).toContainText("✓");
  await expect(
    page.getByRole("button", { name: "Skip outro", exact: true }),
  ).toHaveCount(0);
});
test("autoplay advances exactly once, crosses seasons and stops at the finale", async ({
  page,
}) => {
  await openPlayer(page);
  await endEpisode(page);
  await expect(page.locator("video")).toHaveAttribute("src", /s1e2\.webm$/);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await endEpisode(page);
  await expect(page.locator("video")).toHaveAttribute("src", /s2e1\.webm$/);
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue("2");
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await endEpisode(page);
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play next episode", exact: true }),
  ).toHaveCount(0);
});
test("disabled autoplay waits for Play next episode", async ({ page }) => {
  await openPlayer(page);
  await page.getByLabel("Close details").click();
  await page.locator("aside").getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Autoplay next compatible episode").click();
  await expect(
    page.getByLabel("Autoplay next compatible episode"),
  ).not.toBeChecked();
  await page
    .locator("aside")
    .getByRole("button", { name: "Discover", exact: true })
    .click();
  await page.locator(".title-button").first().click();
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await endEpisode(page);
  await expect(page.locator("video")).toHaveAttribute("src", /s1e1\.webm$/);
  await expect(
    page.getByRole("button", { name: "Play next episode", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play next episode", exact: true })
    .click();
  await expect(page.locator("video")).toHaveAttribute("src", /s1e2\.webm$/);
});
test("unplayable next episode switches to the honest external fallback", async ({
  page,
}) => {
  await openPlayer(page, true);
  await page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.currentTime = 11;
    v.dispatchEvent(new Event("timeupdate"));
  });
  await expect(
    page.getByText("Next episode opens in the source player"),
  ).toBeVisible();
  await endEpisode(page);
  await expect(page.locator("video")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open source player" }),
  ).toHaveAttribute("href", "https://provider.invalid/episode/s1e2");
});
