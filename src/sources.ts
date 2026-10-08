import type { Title, Summary, Episode, Playback } from "./types";
import { search, getTitle } from "./catalog";
export const sourceDefinitions = [
  {
    id: "fsonline-app",
    name: "FSonline.app",
    url: "https://www3.fsonline.app/",
    search: "?s=",
  },
  {
    id: "fsonline-one",
    name: "FSonline.one",
    url: "https://fsonline.one/",
    search: "?s=",
  },
  { id: "sitefilme", name: "Sitefilme", url: "https://sitefilme.com/" },
  {
    id: "9anime-or",
    name: "9anime.or.at",
    url: "https://9anime.or.at/",
    search: "?s=",
  },
  {
    id: "gogoanime",
    name: "Gogoanime",
    url: "https://gogoanime.by/",
    search: "?s=",
  },
  { id: "9anime-cfd", name: "9anime.cfd", url: "https://9anime.cfd/" },
];
export interface SourceAdapter {
  id: string;
  search(query: string, index: Summary[]): Summary[];
  metadata(title: Summary): Promise<Title>;
  episodes(title: Title): Episode[];
  playback(title: Title, episode?: Episode): Playback[];
}
export const adapters: SourceAdapter[] = sourceDefinitions.map((source) => ({
  id: source.id,
  search: (query, index) =>
    search(
      index.filter((t) => t.links.some((l) => l.source === source.id)),
      query,
    ),
  metadata: getTitle,
  episodes: (title) =>
    title.episodes.filter((e) => e.links.some((l) => l.source === source.id)),
  playback: (title, episode) =>
    (episode?.links ?? title.links)
      .filter((l) => l.source === source.id)
      .map(
        (l) =>
          l.playback ?? { url: l.url, type: "external", cacheAllowed: false },
      ),
}));
export function safeUrl(url: string) {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
