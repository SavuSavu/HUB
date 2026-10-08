import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { HubDB, db, defaultProfile, exportData, importData } from "../src/db";
import { deduplicate } from "../src/catalog";
import { parseCatalog, parseDetails } from "../scripts/parser";
import { adapters, safeUrl } from "../src/sources";
import { nextEpisodes, progressState } from "../src/playback";
import type { Title, Episode } from "../src/types";
const title: Title = {
  id: "a",
  title: "Amélie",
  year: 2001,
  kind: "movie",
  description: "",
  genres: [],
  links: [{ source: "fsonline-app", url: "https://www3.fsonline.app/a" }],
  episodes: [],
};
describe("deduplication", () => {
  it("merges normalized title and source links without mutating input", () => {
    const other = {
      ...title,
      id: "b",
      title: "Amelie",
      links: [{ source: "sitefilme", url: "https://sitefilme.com/a" }],
    };
    const merged = deduplicate([title, other]);
    expect(merged).toHaveLength(1);
    expect(merged[0].links).toHaveLength(2);
    expect(title.links).toHaveLength(1);
  });
  it("keeps remakes and different formats separate", () =>
    expect(
      deduplicate([
        title,
        { ...title, year: 2020 },
        { ...title, kind: "series" },
      ]),
    ).toHaveLength(3));
});
describe("source adapters", () => {
  it("extracts metadata from the observed FSonline card structure", () => {
    const result = parseCatalog(
      '<article class="item"><a href="/filme/amelie/"><img data-src="https://image.tmdb.org/a.jpg"></a><h3>Amélie (2001)</h3></article>',
      "fsonline-app",
      "https://www3.fsonline.app/",
    );
    expect(result[0]).toMatchObject({
      title: "Amélie",
      year: 2001,
      kind: "movie",
    });
  });
  it("extracts Romanian episodes and rejects foreign links", () => {
    const result = parseCatalog(
      '<article class="item"><a href="/episoade/a/"></a><h3>Test Sezonul 1 Episodul 6</h3></article><article class="item"><a href="https://evil.test/"></a><h3>Ad</h3></article>',
      "fsonline-app",
      "https://www3.fsonline.app/",
    );
    expect(result).toHaveLength(1);
    expect(result[0].episodes[0].number).toBe(6);
  });
  it("finds season links and defaults playback to external without cache permission", () => {
    const t = parseDetails(
      '<a href="/episod/test/s01-e07/">Next</a>',
      structuredClone(title),
      "fsonline-app",
      title.links[0].url,
    );
    expect(t.episodes[0].number).toBe(7);
    expect(adapters[0].playback(title)[0]).toMatchObject({
      type: "external",
      cacheAllowed: false,
    });
    expect(safeUrl("javascript:alert(1)")).toBe(false);
  });
});
describe("IndexedDB", () => {
  afterEach(async () => {
    await db.profiles.clear();
    await db.saved.clear();
    await db.history.clear();
  });
  it("persists isolated profiles, lists and episode progress", async () => {
    const local = new HubDB("test-persistence");
    const p = defaultProfile();
    await local.profiles.put(p);
    await local.saved.put({
      key: `${p.id}:favorite:a`,
      profile: p.id,
      titleId: "a",
      list: "favorite",
    });
    local.close();
    const reopened = new HubDB("test-persistence");
    expect(await reopened.profiles.get(p.id)).toEqual(p);
    expect(await reopened.saved.where("profile").equals(p.id).count()).toBe(1);
    await reopened.delete();
  });
  it("roundtrips backup and rejects invalid data before writes", async () => {
    const p = defaultProfile();
    await db.profiles.put(p);
    const backup = await exportData();
    await db.profiles.clear();
    await importData(backup);
    expect(await db.profiles.count()).toBe(1);
    await expect(
      importData({
        ...backup,
        saved: [{ key: "invalid", profile: "missing" }],
      }),
    ).rejects.toThrow();
    expect(await db.saved.count()).toBe(0);
  });
});
describe("playback state", () => {
  const eps = [8, 6, 7].map(
    (number) =>
      ({
        id: `s1e${number}`,
        number,
        season: 1,
        title: "",
        links: [],
      }) as Episode,
  );
  it("queues the next two in episode order", () =>
    expect(nextEpisodes(eps, "s1e6").map((e) => e.number)).toEqual([7, 8]));
  it("does not restart after the final episode", () =>
    expect(nextEpisodes(eps, "s1e8")).toEqual([]));
  it("marks completion only with a known duration", () => {
    expect(progressState(95, 100).watched).toBe(true);
    expect(progressState(10, 0).watched).toBe(false);
  });
});
