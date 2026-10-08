export type Kind = "movie" | "series" | "anime";
export interface Playback {
  url: string;
  type: "hls" | "file" | "external";
  cacheAllowed: boolean;
}
export interface Episode {
  id: string;
  season: number;
  number: number;
  title: string;
  links: SourceLink[];
  outroStart?: number; // Verified outro boundary in seconds, when available.
}
export interface SourceLink {
  source: string;
  url: string;
  playback?: Playback;
}
export interface Title {
  id: string;
  title: string;
  year?: number;
  kind: Kind;
  poster?: string;
  description: string;
  genres: string[];
  links: SourceLink[];
  episodes: Episode[];
}
export interface Summary extends Omit<Title, "description" | "episodes"> {
  shard: string;
}
export interface Profile {
  id: string;
  name: string;
  autoplay: boolean;
  cacheMB: number;
  concurrency: number;
  prefetch: boolean;
}
export interface History {
  key: string;
  profile: string;
  titleId: string;
  episodeId: string;
  seconds: number;
  duration: number;
  watched: boolean;
  updated: number;
}
