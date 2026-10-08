import { useEffect, useRef, useState } from "react";
import { SkipForward, Play, Maximize } from "lucide-react";
import Hls from "hls.js";
import { db } from "./db";
import {
  nextEpisodes,
  progressState,
  prefetchPermitted,
  outroWindow,
  episodeSource,
} from "./playback";
import type { Title, Episode, Profile, Playback } from "./types";
export default function Player({
  title,
  episode,
  media,
  profile,
  onNext,
  inputKind = "source",
}: {
  title: Title;
  episode?: Episode;
  media: Playback;
  profile: Profile;
  onNext: (e: Episode) => void;
  inputKind?: "source" | "file" | "url";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const advance = useRef<() => void>(() => {});
  const nextCallback = useRef(onNext);
  nextCallback.current = onNext;
  const [error, setError] = useState("");
  const [tail, setTail] = useState({
    visible: false,
    remaining: 0,
    ended: false,
  });
  const next = episode
    ? nextEpisodes(title.episodes, episode.id, 1)[0]
    : undefined;
  const nextProvider = next
    ? episodeSource(
        next,
        (episode?.links ?? title.links).find(
          (l) => l.playback?.url === media.url,
        )?.source ?? "",
      )
    : "";
  const nextPlayable = next?.links.some(
    (l) =>
      l.source === nextProvider && l.playback && l.playback.type !== "external",
  );
  const providerPage =
    (episode?.links ?? title.links).find((l) => l.playback?.url === media.url)
      ?.url ??
    episode?.links[0]?.url ??
    title.links[0]?.url;
  useEffect(() => {
    const video = ref.current!;
    let disposed = false;
    let transitioned = false;
    let completed = false;
    let hls: Hls | undefined;
    let last = 0;
    setError("");
    setTail({ visible: false, remaining: 0, ended: false });
    const episodeId = episode?.id ?? "movie";
    const key = `${profile.id}:${title.id}:${episodeId}`;
    const save = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      void db.history.put({
        key,
        profile: profile.id,
        titleId: title.id,
        episodeId,
        ...progressState(video.currentTime, video.duration),
        watched:
          completed || progressState(video.currentTime, video.duration).watched,
        updated: Date.now(),
      });
    };
    const resume = async () => {
      const record = await db.history.get(key);
      if (!disposed && record && !record.watched)
        video.currentTime = Math.min(
          record.seconds,
          Math.max(0, video.duration - 1),
        );
    };
    const updateTail = () =>
      setTail({
        visible:
          !!episode &&
          outroWindow(video.currentTime, video.duration, episode.outroStart),
        remaining: Number.isFinite(video.duration)
          ? Math.max(0, Math.ceil(video.duration - video.currentTime))
          : 0,
        ended: video.ended,
      });
    const time = () => {
      updateTail();
      if (Date.now() - last > 5000) {
        last = Date.now();
        save();
      }
    };
    const moveNext = () => {
      if (disposed || transitioned) return;
      completed = true;
      save();
      if (next) {
        transitioned = true;
        video.pause();
        nextCallback.current(next);
      } else {
        video.currentTime = video.duration;
        video.pause();
        setTail({ visible: true, remaining: 0, ended: true });
      }
    };
    advance.current = moveNext;
    const ended = () => {
      completed = true;
      save();
      updateTail();
      if (profile.autoplay && next) moveNext();
    };
    const fail = () => {
      setError(
        inputKind === "file"
          ? "This video format or codec is not supported by your browser. Try a compatible MP4 or WebM file."
          : inputKind === "url"
            ? "This video link could not be played. The host may restrict access, or the link may have expired."
            : "This provider could not be played in your browser. Open its source page instead.",
      );
      setTail({ visible: false, remaining: 0, ended: false });
    };
    video.addEventListener("loadedmetadata", resume);
    video.addEventListener("timeupdate", time);
    video.addEventListener("pause", save);
    video.addEventListener("ended", ended);
    video.addEventListener("error", fail);
    if (media.type === "hls" && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(media.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) fail();
      });
    } else video.src = media.url;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const prefetch = () => {
      if (prefetchPermitted(profile, connection) && video.readyState >= 3) {
        const urls = nextEpisodes(title.episodes, episodeId).flatMap((e) => {
          const source = episodeSource(e, nextProvider);
          const l = e.links.find((l) => l.source === source);
          return l?.playback?.cacheAllowed && l.playback.type === "file"
            ? [l.playback.url]
            : [];
        });
        navigator.serviceWorker?.controller?.postMessage({
          type: "PREFETCH",
          urls,
          maxBytes: profile.cacheMB * 1024 * 1024,
          concurrency: profile.concurrency,
        });
      }
    };
    const pausePrefetch = () =>
      navigator.serviceWorker?.controller?.postMessage({
        type: "CANCEL_PREFETCH",
      });
    video.addEventListener("canplay", prefetch);
    video.addEventListener("waiting", pausePrefetch);
    video.addEventListener("seeking", pausePrefetch);
    return () => {
      save();
      disposed = true;
      advance.current = () => {};
      video.removeEventListener("canplay", prefetch);
      video.removeEventListener("waiting", pausePrefetch);
      video.removeEventListener("seeking", pausePrefetch);
      video.removeEventListener("loadedmetadata", resume);
      video.removeEventListener("timeupdate", time);
      video.removeEventListener("pause", save);
      video.removeEventListener("ended", ended);
      video.removeEventListener("error", fail);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
      pausePrefetch();
    };
  }, [
    title,
    episode,
    media.url,
    media.type,
    profile.id,
    profile.autoplay,
    profile.prefetch,
    profile.cacheMB,
    profile.concurrency,
    nextProvider,
    inputKind,
  ]);
  return (
    <div className="player">
      <div className="video-stage" ref={stage}>
        <video
          ref={ref}
          controls
          autoPlay
          playsInline
          crossOrigin={media.type === "hls" ? "anonymous" : undefined}
        />
        {tail.visible && !error && (
          <div className="episode-ending" aria-label="Episode ending">
            <div>
              <p className="eyebrow">{next ? "UP NEXT" : "EPISODE COMPLETE"}</p>
              {next ? (
                <>
                  <strong>
                    S{String(next.season).padStart(2, "0")} E
                    {String(next.number).padStart(2, "0")} · {next.title}
                  </strong>
                  <p>
                    {nextPlayable
                      ? profile.autoplay && tail.remaining > 0
                        ? `Playing next in ${tail.remaining}s`
                        : "Ready when you are"
                      : "Next episode opens in the source player"}
                  </p>
                </>
              ) : (
                <strong>You’re all caught up.</strong>
              )}
            </div>
            <div className="ending-actions">
              {!tail.ended && (
                <button
                  className="button"
                  title={
                    episode?.outroStart !== undefined
                      ? "Skip the verified outro"
                      : "Skip the final seconds of this episode"
                  }
                  onClick={() => advance.current()}
                >
                  <SkipForward size={16} />
                  Skip outro
                </button>
              )}
              {next && (
                <button className="primary" onClick={() => advance.current()}>
                  <Play size={16} />
                  {nextPlayable ? "Play next episode" : "Next episode"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="player-tools">
        <a href={providerPage} target="_blank" rel="noreferrer">
          Open source player ↗
        </a>
        <button
          className="button"
          onClick={() => {
            stage.current
              ?.requestFullscreen()
              .catch(() =>
                setError("Fullscreen is unavailable in this browser."),
              );
          }}
        >
          <Maximize size={15} />
          Fullscreen
        </button>
      </div>
    </div>
  );
}
