import { expect, it } from "vitest";
import { outroWindow, episodeSource, nextEpisodes } from "../src/playback";
import type { Episode } from "../src/types";
it("uses supplied outro timing or a bounded final-seconds window", () => {
  expect(outroWindow(1169, 1200)).toBe(false);
  expect(outroWindow(1170, 1200)).toBe(true);
  expect(outroWindow(8, 10)).toBe(false);
  expect(outroWindow(9, 10)).toBe(true);
  expect(outroWindow(600, 1200, 600)).toBe(true);
  expect(outroWindow(1170, 1200, 2000)).toBe(true);
  expect(outroWindow(0, Infinity)).toBe(false);
  expect(outroWindow(0, 0)).toBe(false);
});
it("preserves a compatible provider then falls back to a playable alternative", () => {
  const episode: Episode = {
    id: "s2e1",
    season: 2,
    number: 1,
    title: "",
    links: [
      { source: "external", url: "https://provider.test/" },
      {
        source: "second",
        url: "https://second.test/",
        playback: {
          url: "https://second.test/media.mp4",
          type: "file",
          cacheAllowed: false,
        },
      },
      {
        source: "preferred",
        url: "https://preferred.test/",
        playback: {
          url: "https://preferred.test/media.mp4",
          type: "file",
          cacheAllowed: false,
        },
      },
    ],
  };
  expect(episodeSource(episode, "preferred")).toBe("preferred");
  expect(episodeSource(episode, "external")).toBe("second");
  expect(episodeSource({ ...episode, links: [] }, "preferred")).toBe("");
});
it("advances across seasons and does not wrap after the finale", () => {
  const episodes = [
    { id: "s2e1", season: 2, number: 1 },
    { id: "s1e2", season: 1, number: 2 },
  ].map((e) => ({ ...e, title: "", links: [] }));
  expect(nextEpisodes(episodes, "s1e2")[0].id).toBe("s2e1");
  expect(nextEpisodes(episodes, "s2e1")).toEqual([]);
});
