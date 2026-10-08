import type { Playback } from "./types";
export function directVideo(
  raw: string,
  format: "auto" | "file" | "hls" = "auto",
): Playback {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw Error("Enter a complete HTTPS video URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw Error("Use an HTTPS video URL without embedded login credentials.");
  const type =
    format === "auto"
      ? /\.m3u8$/i.test(url.pathname)
        ? "hls"
        : "file"
      : format;
  return { url: url.href, type, cacheAllowed: false };
}
export function isVideoFile(file: Pick<File, "name" | "type" | "size">) {
  return (
    file.size > 0 &&
    (file.type.startsWith("video/") ||
      /\.(mp4|webm|m4v|mov|ogv|mkv|avi)$/i.test(file.name))
  );
}
