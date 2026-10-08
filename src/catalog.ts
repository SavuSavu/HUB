import Fuse from "fuse.js";
import type { Title, Summary } from "./types";
export const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function deduplicate(titles: Title[]): Title[] {
  const map = new Map<string, Title>();
  const years = new Map<string, Set<number>>();
  for (const t of titles) {
    if (t.year) {
      const k = `${normalize(t.title)}|${t.kind}`;
      if (!years.has(k)) years.set(k, new Set());
      years.get(k)!.add(t.year);
    }
  }
  for (const t of titles) {
    const known = years.get(`${normalize(t.title)}|${t.kind}`);
    const resolvedYear =
      t.year ?? (known?.size === 1 ? [...known][0] : undefined);
    const key = `${normalize(t.title)}|${resolvedYear ?? "unknown"}|${t.kind}`;
    const old = map.get(key);
    if (!old) {
      map.set(key, {
        ...structuredClone(t),
        id: normalize(key).replaceAll(" ", "-"),
        year: resolvedYear,
      });
      continue;
    }
    for (const link of t.links) {
      const existing = old.links.find((l) => l.source === link.source);
      if (!existing) old.links.push(link);
      else if (
        /\/(serial|series|tvshows)\//.test(link.url) &&
        !/\/(serial|series|tvshows)\//.test(existing.url)
      )
        Object.assign(existing, link);
    }
    for (const ep of t.episodes) {
      const existing = old.episodes.find(
        (e) => e.season === ep.season && e.number === ep.number,
      );
      if (existing) {
        for (const l of ep.links)
          if (!existing.links.some((x) => x.url === l.url))
            existing.links.push(l);
      } else old.episodes.push(ep);
    }
    old.poster ||= t.poster;
    if (t.description.length > old.description.length)
      old.description = t.description;
    old.genres = [...new Set([...old.genres, ...t.genres])];
  }
  return [...map.values()];
}
const shardCache = new Map<string, Title[]>();
export async function getTitle(summary: Summary) {
  let shard = shardCache.get(summary.shard);
  if (!shard) {
    shard = await loadJSON<Title[]>(`catalog/${summary.shard}`);
    if (shardCache.size >= 4)
      shardCache.delete(shardCache.keys().next().value!);
    shardCache.set(summary.shard, shard);
  }
  const title = shard.find((t) => t.id === summary.id);
  if (!title) throw Error("Title missing");
  return title;
}
export function search(index: Summary[], query: string) {
  return query.trim()
    ? new Fuse(index, { keys: ["title", "genres"], threshold: 0.32 })
        .search(query)
        .map((r) => r.item)
    : index;
}

export async function loadJSON<T>(path: string): Promise<T> {
  if ("DecompressionStream" in globalThis) {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}${path}.gz`);
      if (r.ok && r.body)
        return JSON.parse(
          await new Response(
            r.body.pipeThrough(new DecompressionStream("gzip")),
          ).text(),
        ) as T;
    } catch {}
  }
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok) throw Error(`Resource unavailable: ${path}`);
  return response.json() as Promise<T>;
}
