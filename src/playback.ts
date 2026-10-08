import type { Episode, History } from "./types";
export function nextEpisodes(episodes: Episode[], id: string, count = 2) {
  const sorted = [...episodes].sort(
    (a, b) => a.season - b.season || a.number - b.number,
  );
  const i = sorted.findIndex((e) => e.id === id);
  return i < 0 ? [] : sorted.slice(i + 1, i + 1 + count);
}
export function progressState(
  seconds: number,
  duration: number,
): Pick<History, "seconds" | "duration" | "watched"> {
  return {
    seconds: Math.max(0, seconds),
    duration: Math.max(0, duration),
    watched: duration > 0 && seconds / duration >= 0.9,
  };
}
export function prefetchPermitted(
  profile: { prefetch: boolean },
  connection?: { saveData?: boolean; effectiveType?: string },
) {
  return (
    profile.prefetch &&
    !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "4g") &&
    navigator.onLine
  );
}

// Without provider timing, expose a conservative final-seconds shortcut, not detected credits.
export function outroWindow(
  seconds: number,
  duration: number,
  outroStart?: number,
) {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0)
    return false;
  const start =
    Number.isFinite(outroStart) && outroStart! >= 0 && outroStart! < duration
      ? outroStart!
      : duration - Math.min(30, duration * 0.1);
  return seconds >= start;
}
export function episodeSource(episode: Episode, preferred: string) {
  const playable = (link: Episode["links"][number]) =>
    !!link.playback && link.playback.type !== "external";
  return (
    (
      episode.links.find(
        (link) => link.source === preferred && playable(link),
      ) ??
      episode.links.find(playable) ??
      episode.links.find((link) => link.source === preferred) ??
      episode.links[0]
    )?.source ?? ""
  );
}
