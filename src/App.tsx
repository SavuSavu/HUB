import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  Heart,
  Bookmark,
  Play,
  Compass,
  Film,
  Tv,
  Settings,
  Layers,
  ArrowUpRight,
  X,
  Download,
  Upload,
} from "lucide-react";
import { db, initialize, defaultProfile, exportData, importData } from "./db";
import { search, getTitle, loadJSON } from "./catalog";
import { sourceDefinitions, safeUrl } from "./sources";
import { episodeSource } from "./playback";
import type { Title, Summary, Episode, Profile } from "./types";
const Player = React.lazy(() => import("./Player"));
export default function App({ onLock }: { onLock: () => void }) {
  const [index, setIndex] = useState<Summary[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Discover");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("recent");
  const [source, setSource] = useState("all");
  const [genre, setGenre] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Title>();
  const [episode, setEpisode] = useState<Episode>();
  const [season, setSeason] = useState(1);
  const [activeSource, setActiveSource] = useState("");
  const [profileId, setProfileId] = useState("");
  const [notice, setNotice] = useState("");
  const [reports, setReports] = useState<any[]>([]);
  const profiles = useLiveQuery(() => db.profiles.toArray(), []) ?? [];
  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const saved =
    useLiveQuery(
      () =>
        profile ? db.saved.where("profile").equals(profile.id).toArray() : [],
      [profile?.id],
    ) ?? [];
  const history =
    useLiveQuery(
      () =>
        profile
          ? db.history
              .where("profile")
              .equals(profile.id)
              .reverse()
              .sortBy("updated")
          : [],
      [profile?.id],
    ) ?? [];
  useEffect(() => {
    initialize()
      .then(() => db.settings.get("activeProfile"))
      .then((s) => {
        if (s) setProfileId(s.value);
      })
      .catch((e) => setError(String(e)));
    Promise.all([
      loadJSON<Summary[]>("catalog/index.json"),
      fetch(`${import.meta.env.BASE_URL}catalog/sources.json`).then((r) =>
        r.json(),
      ),
    ])
      .then(([i, r]) => {
        setIndex(i);
        setReports(r);
      })
      .catch((e) => setError(String(e)));
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          scope: import.meta.env.BASE_URL,
        })
        .catch(() => {});
  }, []);
  useEffect(() => {
    setPage(1);
  }, [query, kind, source, genre, sort, tab]);
  const filtered = useMemo(() => {
    let items = search(index, query).filter(
      (t) =>
        (kind === "all" || t.kind === kind) &&
        (source === "all" || t.links.some((l) => l.source === source)) &&
        (genre === "all" || t.genres.includes(genre)),
    );
    if (tab === "Favorites" || tab === "Watchlist")
      items = items.filter((t) =>
        saved.some(
          (s) =>
            s.titleId === t.id &&
            s.list === (tab === "Favorites" ? "favorite" : "watchlist"),
        ),
      );
    if (tab === "Continue watching")
      items = items.filter((t) =>
        history.some((h) => h.titleId === t.id && !h.watched && h.seconds > 0),
      );
    if (sort === "az") items.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "recent") items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    return items;
  }, [index, query, kind, source, genre, sort, tab, saved, history]);
  const open = async (t: Summary) => {
    try {
      const full = await getTitle(t);
      setSelected(full);
      const resume = history.find((h) => h.titleId === t.id && !h.watched);
      const e =
        full.episodes.find((e) => e.id === resume?.episodeId) ??
        full.episodes[0];
      setEpisode(e);
      setSeason(e?.season ?? 1);
      setActiveSource((e?.links ?? full.links)[0]?.source ?? "");
    } catch (e) {
      setNotice(String(e));
    }
  };
  const toggle = async (titleId: string, list: "favorite" | "watchlist") => {
    if (!profile) return;
    const key = `${profile.id}:${list}:${titleId}`;
    if (await db.saved.get(key)) await db.saved.delete(key);
    else await db.saved.put({ key, profile: profile.id, titleId, list });
  };
  const chooseEpisode = (e: Episode) => {
    setEpisode(e);
    setSeason(e.season);
    setActiveSource(episodeSource(e, activeSource));
  };
  const links = episode?.links ?? selected?.links ?? [];
  const playback = links.find((l) => l.source === activeSource)?.playback;
  const featured = index.find((t) => t.poster);
  const genres = [...new Set(index.flatMap((t) => t.genres))].sort();
  return (
    <div className="layout">
      <aside>
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-icon">
            <Layers size={23} />
          </span>
          HUB<span className="brand-dot">.</span>
        </a>
        <p className="nav-label">YOUR UNIVERSE</p>
        {[
          [Compass, "Discover"],
          [Play, "Continue watching"],
          [Heart, "Favorites"],
          [Bookmark, "Watchlist"],
          [Settings, "Settings"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof Compass;
          return (
            <button
              key={String(label)}
              className={`nav ${tab === label ? "active" : ""}`}
              onClick={() => setTab(String(label))}
            >
              <I size={19} />
              {String(label)}
            </button>
          );
        })}
        <div className="sidebar-bottom">
          <div className="local-dot" /> Local, by design
          <p>Your library stays on this device.</p>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Your watch universe <span>/ {tab}</span>
          </div>
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search titles"
              placeholder="Search movies, series, anime…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌕</kbd>
          </label>
          <select
            aria-label="Local profile"
            value={profile?.id ?? ""}
            onChange={(e) => {
              setProfileId(e.target.value);
              db.settings.put({ key: "activeProfile", value: e.target.value });
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="button" onClick={onLock}>
            Lock HUB
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        {tab === "Settings" ? (
          <section className="settings">
            <p className="eyebrow">MAKE IT YOURS</p>
            <h1>Local settings</h1>
            <p>
              Profiles are local preferences, stored in this browser. Export a
              backup to move your library.
            </p>
            {profile && (
              <>
                <label>
                  Profile name
                  <input
                    value={profile.name}
                    onChange={(e) =>
                      db.profiles.update(profile.id, { name: e.target.value })
                    }
                  />
                </label>
                <button
                  className="button"
                  onClick={async () => {
                    const p = defaultProfile(`Profile ${profiles.length + 1}`);
                    await db.profiles.add(p);
                    setProfileId(p.id);
                    await db.settings.put({
                      key: "activeProfile",
                      value: p.id,
                    });
                  }}
                >
                  Add local profile
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={profile.autoplay}
                    onChange={(e) =>
                      db.profiles.update(profile.id, {
                        autoplay: e.target.checked,
                      })
                    }
                  />{" "}
                  Autoplay next compatible episode
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={profile.prefetch}
                    onChange={(e) =>
                      db.profiles.update(profile.id, {
                        prefetch: e.target.checked,
                      })
                    }
                  />{" "}
                  Prefetch next two episodes when provider allows caching
                </label>
                <label>
                  Maximum media cache (MB)
                  <input
                    type="number"
                    min="0"
                    max="2048"
                    value={profile.cacheMB}
                    onChange={(e) =>
                      db.profiles.update(profile.id, {
                        cacheMB: Math.max(
                          0,
                          Math.min(2048, Number(e.target.value)),
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Concurrent prefetch downloads
                  <select
                    value={profile.concurrency}
                    onChange={(e) =>
                      db.profiles.update(profile.id, {
                        concurrency: Number(e.target.value),
                      })
                    }
                  >
                    {[1, 2, 3].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <div className="actions">
              <button
                className="button"
                onClick={async () => {
                  const blob = new Blob(
                    [JSON.stringify(await exportData(), null, 2)],
                    { type: "application/json" },
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "hub-backup.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={16} />
                Export backup
              </button>
              <label className="button">
                <Upload size={16} />
                Import backup
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 20 * 1024 * 1024)
                          throw Error("Backup exceeds 20 MB");
                        await importData(JSON.parse(await file.text()));
                        setNotice("Backup imported.");
                      }
                    } catch (e) {
                      setNotice(String(e));
                    }
                  }}
                />
              </label>
              <button
                className="button"
                onClick={() => {
                  navigator.serviceWorker.controller?.postMessage({
                    type: "CLEAR_MEDIA",
                  });
                  setNotice("Media cache clear requested.");
                }}
              >
                Clear media cache
              </button>
            </div>
            <h2>Source availability</h2>
            {reports.map((r) => (
              <div className="source-report" key={r.id}>
                <strong>{r.name}</strong>
                <span>
                  {r.count} catalog records · {r.browserAccess}
                </span>
                <p>{r.error ?? r.notes?.join(" ")}</p>
              </div>
            ))}
          </section>
        ) : (
          <>
            {tab === "Discover" && !query && featured && (
              <section
                className="hero"
                style={{
                  backgroundImage: `linear-gradient(90deg,#11131c 10%,#11131cd9 48%,#11131c40),url("${featured.poster}")`,
                }}
              >
                <div>
                  <p className="eyebrow">
                    <span /> ONE LIBRARY. EVERY WORLD.
                  </p>
                  <h1>
                    Your next obsession
                    <br />
                    starts here<span>.</span>
                  </h1>
                  <p>
                    Movies, series, and anime. Find your favorites
                    <br className="desktop" /> and pick up right where you left
                    off.
                  </p>
                  <div className="actions">
                    <button className="primary" onClick={() => open(featured)}>
                      <Play size={17} fill="currentColor" />
                      Explore {featured.title}
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        document
                          .getElementById("catalog")
                          ?.scrollIntoView({ behavior: "smooth" })
                      }
                    >
                      Browse library <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="hero-meta">
                    <span>{index.length} titles indexed</span>
                    <span>6 source adapters</span>
                    <span>100% browser based</span>
                  </div>
                </div>
              </section>
            )}
            <section id="catalog">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    {query
                      ? "FIND YOUR NEXT WATCH"
                      : "CURATED FROM YOUR SOURCES"}
                  </p>
                  <h2>
                    {query
                      ? `Results for “${query}”`
                      : tab === "Discover"
                        ? "Explore the library"
                        : tab}
                  </h2>
                </div>
                <span className="muted">{filtered.length} titles</span>
              </div>
              <div className="filters">
                <div className="pills">
                  {[
                    ["all", "All titles", Layers],
                    ["movie", "Movies", Film],
                    ["series", "Series", Tv],
                    ["anime", "Anime", Compass],
                  ].map(([k, label, Icon]) => {
                    const I = Icon as typeof Film;
                    return (
                      <button
                        key={String(k)}
                        className={kind === k ? "selected" : ""}
                        onClick={() => setKind(String(k))}
                      >
                        <I size={15} />
                        {String(label)}
                      </button>
                    );
                  })}
                </div>
                <div className="filter-selects">
                  <select
                    aria-label="Source filter"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="all">All sources</option>
                    {sourceDefinitions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Genre filter"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  >
                    <option value="all">All genres</option>
                    {genres.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort titles"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">Newest first</option>
                    <option value="az">A–Z</option>
                  </select>
                </div>
              </div>
              <div className="grid">
                {filtered.slice(0, page * 36).map((t) => (
                  <article className="card" key={t.id}>
                    <button
                      className="poster"
                      onPointerEnter={() => {
                        getTitle(t).catch(() => {});
                      }}
                      onFocus={() => {
                        getTitle(t).catch(() => {});
                      }}
                      onClick={() => open(t)}
                    >
                      {t.poster ? (
                        <img
                          loading="lazy"
                          src={t.poster}
                          alt={t.title}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <Film size={40} />
                      )}
                      <span className="type-tag">{t.kind}</span>
                      <span className="poster-play">
                        <Play fill="currentColor" />
                      </span>
                    </button>
                    <button
                      className={`save ${saved.some((s) => s.titleId === t.id && s.list === "favorite") ? "is-saved" : ""}`}
                      aria-label={`Favorite ${t.title}`}
                      onClick={() => toggle(t.id, "favorite")}
                    >
                      <Heart size={16} />
                    </button>
                    <button className="title-button" onClick={() => open(t)}>
                      {t.title}
                    </button>
                    <p>
                      {t.year ?? "Year unknown"}
                      <span> · </span>
                      {t.links.length || 1} source
                      {t.links.length > 1 ? "s" : ""}
                    </p>
                    {history.some((h) => h.titleId === t.id && !h.watched) && (
                      <div className="progress">
                        <i
                          style={{
                            width: `${Math.min(100, (history.find((h) => h.titleId === t.id)!.seconds / (history.find((h) => h.titleId === t.id)!.duration || 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <Compass size={38} />
                  <h3>
                    {index.length
                      ? "Nothing here yet"
                      : "Catalog is unavailable"}
                  </h3>
                  <p>
                    {index.length
                      ? "Try another search or add titles to your library."
                      : "Run the catalog generator to index reachable sources."}
                  </p>
                </div>
              )}
              {filtered.length > page * 36 && (
                <button
                  className="button load"
                  onClick={() => setPage(page + 1)}
                >
                  Load more titles
                </button>
              )}
              <footer>
                <span className="brand small">HUB.</span>
                <span>Your library. Your device. Your next great watch.</span>
              </footer>
            </section>
          </>
        )}
      </main>
      {selected && (
        <div className="overlay" onClick={() => setSelected(undefined)}>
          <section
            className="detail"
            role="dialog"
            aria-modal="true"
            aria-label={selected.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close details"
              onClick={() => setSelected(undefined)}
            >
              <X />
            </button>
            <div className="detail-header">
              {selected.poster && <img src={selected.poster} alt="" />}
              <div>
                <p className="eyebrow">
                  {selected.kind} · {selected.year ?? "Year unknown"}
                </p>
                <h1>{selected.title}</h1>
                <p>
                  {selected.description ||
                    "No synopsis was provided by the indexed source."}
                </p>
                <p>{selected.genres.join(" · ")}</p>
                <div className="actions">
                  <button
                    className="button"
                    onClick={() => toggle(selected.id, "favorite")}
                  >
                    <Heart size={17} />
                    {saved.some(
                      (s) => s.titleId === selected.id && s.list === "favorite",
                    )
                      ? "Favorited"
                      : "Favorite"}
                  </button>
                  <button
                    className="button"
                    onClick={() => toggle(selected.id, "watchlist")}
                  >
                    <Bookmark size={17} />
                    {saved.some(
                      (s) =>
                        s.titleId === selected.id && s.list === "watchlist",
                    )
                      ? "In watchlist"
                      : "Watchlist"}
                  </button>
                </div>
              </div>
            </div>
            {selected.episodes.length > 0 && (
              <>
                <label>
                  Season{" "}
                  <select
                    value={season}
                    onChange={(e) => setSeason(Number(e.target.value))}
                  >
                    {[...new Set(selected.episodes.map((e) => e.season))]
                      .sort((a, b) => a - b)
                      .map((s) => (
                        <option key={s} value={s}>
                          Season {s}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="episodes">
                  {selected.episodes
                    .filter((e) => e.season === season)
                    .sort((a, b) => a.number - b.number)
                    .map((e) => (
                      <button
                        className={episode?.id === e.id ? "selected" : ""}
                        key={e.id}
                        onClick={() => chooseEpisode(e)}
                      >
                        E{e.number} · {e.title}
                        {history.some(
                          (h) =>
                            h.titleId === selected.id &&
                            h.episodeId === e.id &&
                            h.watched,
                        )
                          ? " ✓"
                          : ""}
                      </button>
                    ))}
                </div>
                <button
                  className="button"
                  onClick={() => {
                    if (profile && episode) {
                      const key = `${profile.id}:${selected.id}:${episode.id}`;
                      const old = history.find((h) => h.key === key);
                      db.history.put({
                        key,
                        profile: profile.id,
                        titleId: selected.id,
                        episodeId: episode.id,
                        seconds: old?.seconds ?? 0,
                        duration: old?.duration ?? 0,
                        watched: !old?.watched,
                        updated: Date.now(),
                      });
                    }
                  }}
                >
                  Toggle episode watched
                </button>
              </>
            )}
            <h3>Available sources</h3>
            <div className="actions">
              {links
                .filter((l) => safeUrl(l.url))
                .map((l) => (
                  <button
                    className={`button ${activeSource === l.source ? "selected" : ""}`}
                    key={l.url}
                    onClick={() => setActiveSource(l.source)}
                  >
                    {sourceDefinitions.find((s) => s.id === l.source)?.name ??
                      l.source}
                  </button>
                ))}
            </div>
            {playback && playback.type !== "external" && profile ? (
              <React.Suspense fallback={<p>Loading player…</p>}>
                <Player
                  title={selected}
                  episode={episode}
                  media={playback}
                  profile={profile}
                  onNext={chooseEpisode}
                />
              </React.Suspense>
            ) : (
              <div className="external">
                <p>
                  This source uses its own player. Open the provider page to
                  watch. HUB cannot track playback in an external tab.
                </p>
                {links
                  .filter((l) => l.source === activeSource && safeUrl(l.url))
                  .map((l) => (
                    <a
                      className="primary"
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source player <ArrowUpRight size={16} />
                    </a>
                  ))}
              </div>
            )}
            {!selected.episodes.length && selected.kind !== "movie" && (
              <p className="muted">
                Episode listings have not been verified for this title.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
