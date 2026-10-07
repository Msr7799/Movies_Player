import type { MovieCategory } from "@/lib/movie-categories";

export type MediaSource = {
  quality: string;
  url: string;
  size: number;
  kind?: "video" | "embed" | "hls";
};

export type SubtitleTrack = { label: string; language: string; url: string };

export type Movie = {
  id: string;
  title: string;
  titleOrigin?: "user" | "smart" | "filename" | "catalog";
  poster?: string;
  categories?: MovieCategory[];
  sources: MediaSource[];
  subtitles: SubtitleTrack[];
};

export type MediaDetails = {
  type: "HLS" | "Direct" | "Embed";
  sourceUrl: string;
  currentQuality?: string;
  resolution?: string;
  bitrate?: number;
  codecs?: string;
  duration?: number;
  availableQualities?: Array<{
    label: string;
    width?: number;
    height?: number;
    bitrate?: number;
    codecs?: string;
  }>;
  error?: string;
};

export type PlaybackHistorySnapshot = {
  progress: number;
  duration: number;
  watchedAt: number;
  details: MediaDetails;
};

export type PlaybackHistoryEntry = PlaybackHistorySnapshot & {
  movie: Movie;
};

export type DiscoveryResult = {
  id: string;
  title: string;
  provider: string;
  url: string;
  description: string;
  reason: string;
  contentType: "full_movie" | "availability_page" | "short_clip";
  playable: boolean;
  playUrl?: string;
  kind?: "video" | "embed" | "hls";
};

export type SearchProvider = "tavily" | "serper";

export type DiscoveryResponse = {
  understoodTitle: string;
  year?: string;
  summary: string;
  searchProvider: SearchProvider;
  results: DiscoveryResult[];
};
