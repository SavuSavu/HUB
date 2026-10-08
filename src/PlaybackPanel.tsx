import React, { useEffect, useId, useState } from "react";
import { ArrowUpRight, FolderOpen, Link, Play, X } from "lucide-react";
import type { Title, Episode, Profile, SourceLink, Playback } from "./types";
import { directVideo, isVideoFile } from "./media";
import { safeUrl } from "./sources";
const Player = React.lazy(() => import("./Player"));
type Input = { media: Playback; kind: "file" | "url"; label: string };
export default function PlaybackPanel({
  title,
  episode,
  profile,
  sourceLink,
  onNext,
}: {
  title: Title;
  episode?: Episode;
  profile: Profile;
  sourceLink?: SourceLink;
  onNext: (episode: Episode) => void;
}) {
  const [fileOrUrl, setInput] = useState<Input>();
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"auto" | "file" | "hls">("auto");
  const [error, setError] = useState("");
  const id = useId();
  useEffect(
    () => () => {
      if (fileOrUrl?.media.url.startsWith("blob:"))
        URL.revokeObjectURL(fileOrUrl.media.url);
    },
    [fileOrUrl?.media.url],
  );
  const media = fileOrUrl?.media ?? sourceLink?.playback;
  return (
    <section className="playback-panel" aria-label="Playback options">
      {media && media.type !== "external" ? (
        <>
          <div className="playback-caption">
            <span>{fileOrUrl?.label ?? "Source video"}</span>
            {fileOrUrl && (
              <button
                className="button"
                onClick={() => {
                  setInput(undefined);
                  setError("");
                }}
              >
                <X size={14} />
                Clear video
              </button>
            )}
          </div>
          <React.Suspense fallback={<p role="status">Loading player…</p>}>
            <Player
              title={title}
              episode={episode}
              media={media}
              profile={profile}
              onNext={onNext}
              inputKind={fileOrUrl?.kind ?? "source"}
            />
          </React.Suspense>
        </>
      ) : (
        <div className="external">
          <h3>Watch inside HUB</h3>
          <p>
            Select a downloaded video or enter a direct video link below. You
            can also use the provider’s player.
          </p>
          {sourceLink && safeUrl(sourceLink.url) && (
            <a
              className="button"
              href={sourceLink.url}
              target="_blank"
              rel="noreferrer"
            >
              Open source player <ArrowUpRight size={16} />
            </a>
          )}
        </div>
      )}
      <div className="video-inputs">
        <label className="button file-video" htmlFor={id}>
          <FolderOpen size={17} />
          Choose downloaded video
        </label>
        <input
          id={id}
          type="file"
          accept="video/*,.mp4,.webm,.m4v,.mov,.ogv,.mkv,.avi"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!isVideoFile(file)) {
              setError("Choose a non-empty video file.");
              return;
            }
            setError("");
            setInput({
              media: {
                url: URL.createObjectURL(file),
                type: "file",
                cacheAllowed: false,
              },
              kind: "file",
              label: `Local video: ${file.name}`,
            });
          }}
        />
        <form
          className="video-url-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const media = directVideo(url, format);
              setInput({
                media,
                kind: "url",
                label: `Video link: ${new URL(media.url).hostname}`,
              });
              setError("");
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
            }
          }}
        >
          <label htmlFor={`${id}-url`}>
            <Link size={15} />
            Direct video URL
          </label>
          <div className="video-url-fields">
            <input
              id={`${id}-url`}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://video-host.example/movie.mp4"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
            <select
              aria-label="Video link format"
              value={format}
              onChange={(event) =>
                setFormat(event.target.value as typeof format)
              }
            >
              <option value="auto">Auto</option>
              <option value="file">Video file</option>
              <option value="hls">HLS stream</option>
            </select>
            <button className="primary" type="submit">
              <Play size={15} />
              Play video link
            </button>
          </div>
        </form>
        {error && (
          <p className="access-error" role="alert">
            {error}
          </p>
        )}
        <p className="video-input-note">
          Local files stay on your device. Direct links must point to playable
          media; HLS hosts must allow this site. Episode progress is saved
          locally. Re-select the file or link after reopening HUB.
        </p>
      </div>
    </section>
  );
}
