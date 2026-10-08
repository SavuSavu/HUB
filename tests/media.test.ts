import { expect, it } from "vitest";
import { directVideo, isVideoFile } from "../src/media";
it("normalizes direct HTTPS links and detects HLS without granting cache permission", () => {
  expect(
    directVideo(" https://media.example/episode.M3U8?token=example "),
  ).toEqual({
    url: "https://media.example/episode.M3U8?token=example",
    type: "hls",
    cacheAllowed: false,
  });
  expect(directVideo("https://media.example/video")).toMatchObject({
    type: "file",
    cacheAllowed: false,
  });
  expect(directVideo("https://media.example/video", "hls").type).toBe("hls");
});
it("rejects unsafe protocols, relative URLs and embedded credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:video/mp4;base64,x",
    "file:///movie.mp4",
    "blob:https://example/x",
    "http://example/movie.mp4",
    "/movie.mp4",
    "https://user:secret@example/movie.mp4",
  ])
    expect(() => directVideo(url)).toThrow();
});
it("accepts video files without relying on MIME alone and rejects empty or unrelated files", () => {
  expect(isVideoFile({ name: "episode.webm", type: "", size: 1024 })).toBe(
    true,
  );
  expect(isVideoFile({ name: "episode", type: "video/mp4", size: 1024 })).toBe(
    true,
  );
  expect(
    isVideoFile({ name: "episode.webm", type: "video/webm", size: 0 }),
  ).toBe(false);
  expect(
    isVideoFile({ name: "text.txt", type: "text/plain", size: 1024 }),
  ).toBe(false);
});
