import { readFile, writeFile, mkdir } from "node:fs/promises";
import * as cheerio from "cheerio";
import { sourceDefinitions } from "../src/sources";
await mkdir("research", { recursive: true });
const reports = [];
for (const source of sourceDefinitions) {
  const report: any = {
    id: source.id,
    url: source.url,
    checkedAt: new Date().toISOString(),
    samples: [],
    directPlaybackVerified: false,
    authorizedCachingVerified: false,
  };
  try {
    const r = await fetch(source.url, {
      headers: { Origin: "https://savusavu.github.io" },
      signal: AbortSignal.timeout(20000),
    });
    report.status = r.status;
    report.finalUrl = r.url;
    report.cors = r.headers.get("access-control-allow-origin");
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const $ = cheerio.load(await r.text());
    report.search = $("form")
      .map((_, f) => {
        const form = $(f);
        return {
          action: form.attr("action"),
          parameters: form
            .find("input")
            .map((_, i) => $(i).attr("name"))
            .get(),
        };
      })
      .get()
      .filter(
        (f) => f.parameters.includes("s") || f.parameters.includes("keyword"),
      );
    const index = JSON.parse(
      await readFile("public/catalog/index.json", "utf8"),
    );
    const sample = index.find((t: any) =>
      t.links.some((l: any) => l.source === source.id),
    );
    if (sample) {
      const url = sample.links.find((l: any) => l.source === source.id).url;
      const response = await fetch(url, {
        headers: { Origin: "https://savusavu.github.io" },
        signal: AbortSignal.timeout(15000),
      });
      const dom = cheerio.load(await response.text());
      report.samples.push({
        title: sample.title,
        url,
        status: response.status,
        cors: response.headers.get("access-control-allow-origin"),
        iframeCount: dom("iframe").length,
        videoCount: dom("video").length,
        directMedia: dom("video[src],video source[src]")
          .map((_, el) => dom(el).attr("src"))
          .get(),
        episodeLinks: dom("a[href]").filter((_, el) =>
          /episode-\d+|sezonul-\d+-episodul-\d+|s\d+[-/]e\d+/i.test(
            dom(el).attr("href") ?? "",
          ),
        ).length,
      });
    }
  } catch (error) {
    report.error = String(error);
  }
  reports.push(report);
  console.log(
    source.id,
    report.status,
    report.samples[0]?.status ?? "no sample",
    report.error ?? "",
  );
}
await writeFile("research/source-check.json", JSON.stringify(reports, null, 2));
