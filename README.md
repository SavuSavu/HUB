# HUB

[Open HUB on GitHub Pages](https://savusavu.github.io/HUB/) · Access password required.

A static React + TypeScript media discovery app for GitHub Pages. All profiles, lists, settings, and episode history live in browser IndexedDB. There is no application server, account backend, proxy, or database service.

## Run

Requires Node 22+ **for development and building only**.

```sh
npm ci
npm run dev
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Development: `http://localhost:5173/HUB/`. Production output: `dist/`. Set `BASE_PATH=/` for root hosting, or `/repository-name/` for another GitHub Pages repository. Browser support: modern browsers with IndexedDB and Service Workers; gzip decompression has a plain JSON fallback.

## What works today

- Real extracted catalog records from FSonline.app, FSonline.one, Sitefilme, 9anime.or.at, and Gogoanime. The checked-in catalog is a bounded snapshot, **not the providers' complete libraries**.
- Unified fuzzy search, category/source/genre filters, sorting, poster grids, title details, and verified static episode links where available.
- Conservative duplicate detection by normalized title, category, and year. Missing years merge only when there is one known matching year. Different remakes stay separate. Without authoritative cross-source IDs, unusual alternate titles may remain separate.
- Local profiles, favorites, watchlists, watched episode flags, backup export/import with validation, and progress for compatible in-app playback.
- Responsive desktop/mobile UI and Service Worker caching of visited application assets and metadata for offline use. Source posters and external players require connectivity.

## Playback findings — checked October 8, 2026

| Source            | Observed catalog/search                                               | Episodes/player                                                 | Integration enabled                |
| ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| www3.fsonline.app | WordPress cards; `?s=`                                                | Romanian season/episode links; script-driven provider selection | Static metadata and external links |
| fsonline.one      | Film/series and episode cards; `/search?keyword=`                     | `/episod/.../s01-e06/`; provider embeds                         | Static metadata and external links |
| sitefilme.com     | Poster/year/genre cards; `?s=`                                        | Script-driven video/source selection; access can vary by client | Static metadata and external links |
| 9anime.or.at      | Anime cards; `?s=`                                                    | Episode pages with dynamic embed; sub/dub indicators            | Static metadata and external links |
| gogoanime.by      | Anime `article.bs` cards; `?s=`                                       | Numbered episode links; script-driven players                   | Static metadata and external links |
| 9anime.cfd        | Dynamic HTML shell; `/search.html?q=`; intermittent Cloudflare denial | No static catalog cards verified; robots excludes `/api/`       | Unavailable; zero catalog records  |

No checked source supplied a verified, permitted, browser-accessible direct video URL. Browser fetches from the local app origin failed for all six sources; independent requests with the intended Pages Origin found no CORS permission. An HTTP 200 alone does **not** verify playable media. See `research/source-check.json` and `research/browser-cors-check.json` for observations. These checks sample sources; they cannot guarantee every provider link or changing external service.

Clicking a result loads its static detail shard and offers an external provider player. External playback cannot be observed by HUB, resumed automatically, or downloaded by HUB. Mark externally watched episodes manually. Source pages may behave differently in a normal browser, and providers can remove titles or change domains. HUB does not claim smooth internal streaming or background downloading from these providers.

The lazy-loaded HLS.js/native player supports future **explicitly verified** direct HLS/files through `SourceLink.playback`. It saves progress, resumes unfinished videos, and advances in season/episode order. `cacheAllowed` defaults to false; only set it after independently verifying provider permission, CORS, and media availability. No DRM/access-control bypass, iframe extraction, or proxy exists.

For authorized direct video files, the worker can prefetch the next two episodes after the current video is playable, cancels prefetch during buffering/seeking, honors data saver and slow networks, limits concurrency to 1–3, and evicts oldest entries to stay within a configured byte budget. Cached files support byte range requests. Missing Content-Length, opaque responses, oversized files, and non-video responses are skipped. Caching entire HLS manifests/segments is **not implemented**; HLS playback uses its ordinary player buffer. Quota failures are caught; browser storage quota and eviction remain browser-controlled. Playback and prefetch infrastructure tests use synthetic responses, not purported live provider streams.

## Catalog generation

Browser code never scrapes blocked cross-origin sites. Development-only scripts request public metadata, obey robots rules, never execute downloaded scripts, never fetch disallowed API paths, never extract video content, and open provider pages externally.

```sh
npm run catalog
DETAIL_LIMIT=30 npm run catalog
npm run check:sources
```

The generator checks each source home page and a configurable number of title detail pages (default 8), pacing detail requests at one second. Existing detail metadata is retained between refreshes. Source-specific card formats and episode patterns live in `scripts/parser.ts`; consistent browser adapter interfaces live in `src/sources.ts`. `--snapshots` optionally parses local research HTML if available; those snapshots are ignored by Git. Failed/dynamic sources are reported, never replaced with invented records. A failing source may drop from the refreshed index; review `public/catalog/sources.json` before publishing.

Outputs are a compact search index, manifest, capability reports, and detail shards of at most 48 titles, with `.json.gz` equivalents. The app loads compressed metadata when supported and limits its detail cache to four shards. Poster elements are lazy-loaded and grids paginate in batches of 36. Media is never written to catalog files or GitHub Pages.

## Deploy

Push the project to the repository's `main` branch and set **Settings → Pages → Source → GitHub Actions**. `.github/workflows/pages.yml` runs unit tests, builds static files, uploads `dist`, and deploys Pages. Run it manually for deployment after a catalog refresh. `.github/workflows/catalog.yml` is an optional manually triggered development job that updates static catalog JSON; it is not a running backend. Bot commits do not automatically trigger another workflow. Neither workflow stores video.

No deployment or remote push is required for local development. `npm run test:e2e` checks a real production preview, including search/details, persisted favorites, anime episode history, profile isolation, mobile overflow, and offline app assets. Unit tests cover adapters, deduplication, IndexedDB/backup validation, playback ordering, and cache budget enforcement.

## Login / casual access deterrent

HUB now opens on a password screen. The dashboard module, catalog requests, IndexedDB initialization, and Service Worker registration start only after a correct password. Unlocking stays in memory: refreshing, closing the tab, or choosing **Lock HUB** requires the password again. Passwords are checked with PBKDF2-SHA-256 (210,000 iterations); the application embeds only the salt and verifier. Failed attempts receive a short local cooldown.

This is a **client-side deterrent**, not secure authentication. Public GitHub Pages files, source code, catalog JSON, and cached data remain accessible. A determined person or AI agent can bypass browser code; an existing Service Worker or previously unlocked browser may already have cached public resources. Local profiles remain local preferences. This gate introduces no backend and cannot enforce server-side authorization.

For this workspace an initial random password has been generated in `.hub-access.txt`; its verifier is in `.env.local`. Both files are ignored by Git. To rotate the password, run `npm run access:configure`, then rebuild. To use a chosen password without including it in shell history or command arguments:

```sh
read -r -s -p 'New HUB password: ' hub_password
printf '%s' "$hub_password" | npm run access:configure -- --stdin
unset hub_password
```

For GitHub Pages, add repository Actions secrets **HUB_ACCESS_HASH** and **HUB_ACCESS_SALT**, using the corresponding values from `.env.local`. The deployment and catalog workflows pass them to Vite. Builds without valid access configuration fail closed. These build values are public verifiers once bundled, despite being delivered through Actions secrets. The plaintext password is never sent to GitHub. Password changes require rebuilding and deploying; they cannot revoke already downloaded copies. Browser tests use a separate test-only password/verifier.

## Episode-ending controls

Compatible in-app series/anime playback now shows an **Up next** overlay, countdown, **Skip outro**, and **Play next episode**. With local autoplay enabled, playback loads the next episode on `ended`, preserves a compatible provider when possible, advances across seasons, and stops at the final episode. Duplicate end events do not skip episodes. Disabling autoplay leaves the next-episode action available without advancing automatically. Skipping marks the current episode watched before switching. The player's **Fullscreen** button includes the overlay in fullscreen.

An optional verified `Episode.outroStart` timestamp enables exact outro timing. Without that metadata, the shortcut appears in the last 30 seconds (or last 10% of shorter videos); it does not detect credits or assume a provider supplies timing. If the next episode has no compatible direct stream, HUB switches to its clearly labeled external-player fallback. HUB cannot display the overlay or observe episode endings inside an external provider tab.

Player browser tests use a self-generated short VP9 fixture and a synthetic test-only catalog. They exercise actual browser media loading/seeking, next-video playback, watched flags, duplicate end events, season changes, disabled autoplay, and external fallback. These tests do not certify the live providers' media playback.
