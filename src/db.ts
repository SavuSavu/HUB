import Dexie, { type Table } from "dexie";
import type { Profile, History } from "./types";
export interface Saved {
  key: string;
  profile: string;
  titleId: string;
  list: "favorite" | "watchlist";
}
export class HubDB extends Dexie {
  settings!: Table<{ key: string; value: string }, string>;
  profiles!: Table<Profile, string>;
  saved!: Table<Saved, string>;
  history!: Table<History, string>;
  constructor(name = "hub-local") {
    super(name);
    this.version(1).stores({
      profiles: "id",
      saved: "key,profile,[profile+list]",
      history: "key,profile,titleId,[profile+titleId]",
    });
    this.version(2).stores({ settings: "key" });
  }
}
export const db = new HubDB();
export const defaultProfile = (name = "My profile"): Profile => ({
  id: crypto.randomUUID(),
  name,
  autoplay: true,
  cacheMB: 256,
  concurrency: 1,
  prefetch: false,
});
export async function initialize() {
  await db.transaction("rw", db.profiles, async () => {
    if (!(await db.profiles.count())) await db.profiles.add(defaultProfile());
  });
}
export async function exportData() {
  return {
    version: 1,
    profiles: await db.profiles.toArray(),
    saved: await db.saved.toArray(),
    history: await db.history.toArray(),
  };
}
export async function importData(data: unknown) {
  const d = data as Awaited<ReturnType<typeof exportData>>;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.profiles) ||
    !Array.isArray(d.saved) ||
    !Array.isArray(d.history)
  )
    throw Error("Invalid HUB backup");
  if (
    d.profiles.length > 100 ||
    d.saved.length > 100000 ||
    d.history.length > 100000
  )
    throw Error("Backup too large");
  const ids = new Set<string>();
  for (const p of d.profiles) {
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      typeof p.autoplay !== "boolean" ||
      typeof p.prefetch !== "boolean" ||
      !Number.isFinite(p.cacheMB) ||
      p.cacheMB < 0 ||
      p.cacheMB > 2048 ||
      !Number.isInteger(p.concurrency) ||
      p.concurrency < 1 ||
      p.concurrency > 3
    )
      throw Error("Invalid profile");
    ids.add(p.id);
  }
  for (const s of d.saved)
    if (
      !ids.has(s.profile) ||
      typeof s.titleId !== "string" ||
      !["favorite", "watchlist"].includes(s.list) ||
      s.key !== `${s.profile}:${s.list}:${s.titleId}`
    )
      throw Error("Invalid saved title");
  for (const h of d.history)
    if (
      !ids.has(h.profile) ||
      typeof h.titleId !== "string" ||
      typeof h.episodeId !== "string" ||
      h.key !== `${h.profile}:${h.titleId}:${h.episodeId}` ||
      ![h.seconds, h.duration, h.updated].every(Number.isFinite) ||
      h.seconds < 0 ||
      h.duration < 0 ||
      typeof h.watched !== "boolean"
    )
      throw Error("Invalid history");
  await db.transaction("rw", db.profiles, db.saved, db.history, async () => {
    await db.profiles.bulkPut(d.profiles);
    await db.saved.bulkPut(d.saved);
    await db.history.bulkPut(d.history);
  });
}
