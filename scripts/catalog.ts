import { mkdir, writeFile, readFile } from "node:fs/promises";
import robotsParser from "robots-parser";
import { gzipSync } from "node:zlib";
import { parseCatalog, parseDetails } from "./parser";
import { deduplicate, normalize } from "../src/catalog";
import { sourceDefinitions } from "../src/sources";
import type { Title, Summary } from "../src/types";
const out = "public/catalog";
await mkdir(out, { recursive: true });
const all: Title[] = [];
const previous: Title[] = [];
try {
  const summaries = JSON.parse(
    await readFile(`${out}/index.json`, "utf8"),
  ) as Summary[];
  for (const shard of new Set(summaries.map((t) => t.shard)))
    previous.push(...JSON.parse(await readFile(`${out}/${shard}`, "utf8")));
} catch {}
const reports = [];
const offline = process.argv.includes("--snapshots");
const limit = Number(process.env.DETAIL_LIMIT ?? 8);
const sleep = () => new Promise((r) => setTimeout(r, 1000));
for (const source of sourceDefinitions) {
  let report: any = {
    ...source,
    checkedAt: new Date().toISOString(),
    browserAccess: "unverified",
    playback: "external-only",
    count: 0,
    notes: [],
  };
  try {
    let html: string;
    let rules: ReturnType<typeof robotsParser> | undefined;
    if (offline) {
      html = await readFile(`research/${source.id}.html`, "utf8");
      report.notes.push(
        "Parsed development snapshot; browser CORS not inferred.",
      );
    } else {
      const robots = await fetch(new URL("/robots.txt", source.url), {
        signal: AbortSignal.timeout(12000),
      });
      if (robots.ok) {
        const text = await robots.text();
        await writeFile(
          `research/${source.id}.robots.txt`,
          text.replaceAll("\r\n", "\n"),
        );
        rules = robotsParser(new URL("/robots.txt", source.url).href, text);
        if (rules.isAllowed(source.url, "HUB-catalog") === false) {
          report.notes.push("robots.txt disallows crawling; skipped");
          reports.push(report);
          continue;
        }
      }
      const response = await fetch(source.url, {
        headers: {
          "User-Agent":
            "HUB-catalog/1.0 (public metadata; no media extraction)",
          Origin: "https://savusavu.github.io",
        },
        signal: AbortSignal.timeout(20000),
      });
      report.status = response.status;
      report.finalUrl = response.url;
      report.cors = response.headers.get("access-control-allow-origin");
      report.browserAccess =
        report.cors === "*" || report.cors === "https://savusavu.github.io"
          ? "cors-header-present"
          : "static-only";
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      if (new URL(response.url).hostname !== new URL(source.url).hostname)
        throw Error("Cross-domain redirect; integration disabled");
      html = await response.text();
      await writeFile(`research/${source.id}.html`, html);
    }
    let titles = parseCatalog(
      html,
      source.id,
      source.url,
      /anime/.test(source.id),
    );
    if (!titles.length)
      report.notes.push(
        "No supported static catalog cards found; dynamic or blocked source is unavailable.",
      );
    for (const title of titles) {
      const old = previous.find(
        (t) =>
          normalize(t.title) === normalize(title.title) &&
          (!title.year || !t.year || title.year === t.year) &&
          t.links.some((l) => l.source === source.id),
      );
      if (old) {
        title.description = old.description;
        title.genres = [...new Set([...title.genres, ...old.genres])];
        for (const e of old.episodes) {
          const links = e.links.filter((l) => l.source === source.id);
          if (links.length && !title.episodes.some((x) => x.id === e.id))
            title.episodes.push({ ...e, links });
        }
      }
    }
    if (!offline) {
      for (const t of titles.filter((t) => t.links.length).slice(0, limit)) {
        if (rules?.isAllowed(t.links[0].url, "HUB-catalog") === false) {
          report.notes.push(`Robots disallows details: ${t.title}`);
          continue;
        }
        await sleep();
        try {
          const r = await fetch(t.links[0].url, {
            signal: AbortSignal.timeout(12000),
          });
          if (r.ok) parseDetails(await r.text(), t, source.id, t.links[0].url);
        } catch {
          report.notes.push(`Detail unavailable: ${t.title}`);
        }
      }
    }
    report.count = titles.length;
    report.notes.push(
      "No authorized CORS-compatible direct media verified. Provider pages open externally.",
    );
    all.push(...titles);
  } catch (error) {
    report.error = String(error);
  }
  reports.push(report);
  console.log(source.id, report.count, report.error ?? report.browserAccess);
}
const titles = deduplicate(all);
const summaries: Summary[] = [];
for (let i = 0; i < titles.length; i += 48) {
  const shard = `titles-${Math.floor(i / 48)}.json`;
  const chunk = titles.slice(i, i + 48);
  const json = JSON.stringify(chunk);
  await writeFile(`${out}/${shard}`, json);
  await writeFile(`${out}/${shard}.gz`, gzipSync(json));
  for (const { description, episodes, ...t } of chunk)
    summaries.push({ ...t, shard });
}
await writeFile(`${out}/index.json`, JSON.stringify(summaries));
await writeFile(`${out}/index.json.gz`, gzipSync(JSON.stringify(summaries)));
await writeFile(`${out}/sources.json`, JSON.stringify(reports, null, 2));
await writeFile(
  `${out}/manifest.json`,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    titles: titles.length,
    shardSize: 48,
    sources: reports.map((r) => ({ id: r.id, count: r.count })),
  }),
);
console.log("Unified titles:", titles.length);
