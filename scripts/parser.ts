import * as cheerio from "cheerio";
import type { Title, Episode } from "../src/types";
import { normalize } from "../src/catalog";
function titleFromRaw(raw: string) {
  return raw.replace(/\s+Episode\s+\d+.*$/i, "").trim();
}
export function parseCatalog(
  html: string,
  source: string,
  base: string,
  anime = false,
): Title[] {
  const $ = cheerio.load(html);
  const titles: Title[] = [];
  $(
    "article.item,article.sf-movie-card,article.fs-episode-card,article.fs-card,article.bs,.flw-item,.last_episodes li,.items li",
  ).each((_, el) => {
    const card = $(el);
    const anchor = card.find("a[href]").first();
    const raw =
      card.find("h3,h2,.film-name,.name").first().text().trim() ||
      anchor.attr("aria-label")?.replace(/^Vezi /, "") ||
      card.find("img").attr("alt") ||
      "";
    const href = anchor.attr("href");
    if (!href || !raw) return;
    const url = new URL(href, base);
    if (
      url.origin !== new URL(base).origin ||
      !["https:"].includes(url.protocol)
    )
      return;
    const ep = raw.match(/(.+?)\s+Sezonul\s+(\d+)\s+Episodul\s+(\d+)/i);
    const badge = card
      .find(".fs-episode-card__badge")
      .text()
      .match(/S(\d+)\s*·\s*E(\d+)/i);
    const animeEp =
      raw.match(/(.+?)\s+Episode\s+(\d+)/i) ||
      (/episode-(\d+)/i.test(url.pathname)
        ? [
            url.pathname,
            titleFromRaw(raw),
            url.pathname.match(/episode-(\d+)/i)![1],
          ]
        : null);
    const yearMatch =
      raw.match(/\((\d{4})\)/) ||
      card
        .find(".sf-card-year")
        .text()
        .match(/(\d{4})/);
    const title = (ep?.[1] || animeEp?.[1] || raw)
      .replace(/\s*\(\d{4}\).*$/, "")
      .trim();
    if (!title) return;
    const kind = anime
      ? "anime"
      : ep || badge || /serial|tvshows|series|episod/.test(url.pathname)
        ? "series"
        : "movie";
    const pathYear = url.pathname.match(/-(19\d{2}|20\d{2})-/);
    const year = yearMatch
      ? Number(yearMatch[1])
      : pathYear
        ? Number(pathYear[1])
        : undefined;
    const id = normalize(`${title}-${year ?? ""}-${kind}`).replaceAll(" ", "-");
    const img = card.find("img").first();
    const poster = img.attr("data-src") || img.attr("src");
    const episode: Episode | undefined =
      ep || badge || animeEp
        ? {
            id: `s${ep?.[2] || badge?.[1] || 1}e${ep?.[3] || badge?.[2] || animeEp?.[2]}`,
            season: Number(ep?.[2] || badge?.[1] || 1),
            number: Number(ep?.[3] || badge?.[2] || animeEp?.[2]),
            title: card.find("p").text().trim() || raw,
            links: [{ source, url: url.href }],
          }
        : undefined;
    titles.push({
      id,
      title,
      year,
      kind,
      poster: poster && new URL(poster, base).href,
      description: "",
      genres: card
        .find(".sf-card-genres")
        .text()
        .split("·")
        .map((x) => x.trim())
        .filter(Boolean),
      links: [{ source, url: url.href }],
      episodes: episode ? [episode] : [],
    });
  });
  return titles;
}
export function parseDetails(
  html: string,
  title: Title,
  source: string,
  url: string,
): Title {
  const $ = cheerio.load(html);
  title.description = $(
    ".wp-content p,.description p,.film-description,.fs-description,.sf-synopsis,.entry-content p,.desc p",
  )
    .first()
    .text()
    .trim()
    .slice(0, 3000);
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href")!;
    const text = a.text().trim();
    const animeNumber = href.match(/episode-(\d+)/i);
    const match =
      (title.kind === "anime" && animeNumber
        ? ["", "1", animeNumber[1]]
        : null) ||
      href.match(/s(\d+)[-_/ ]?e(\d+)/i) ||
      href.match(/sezonul-(\d+)-episodul-(\d+)/i);
    if (!match) return;
    const target = new URL(href, url);
    if (target.origin !== new URL(url).origin) return;
    const season = Number(match[1]),
      number = Number(match[2]);
    if (!title.episodes.some((e) => e.season === season && e.number === number))
      title.episodes.push({
        id: `s${season}e${number}`,
        season,
        number,
        title: text || `Episode ${number}`,
        links: [{ source, url: target.href }],
      });
  });
  return title;
}
