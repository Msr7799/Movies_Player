export type MediaSource = {
  quality: string;
  url: string;
  size: number;
  kind?: "video" | "embed";
};
export type SubtitleTrack = { label: string; language: string; url: string };
export type Movie = {
  id: string;
  title: string;
  poster?: string;
  sources: MediaSource[];
  subtitles: SubtitleTrack[];
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
  kind?: "video" | "embed";
};

export type DiscoveryResponse = {
  understoodTitle: string;
  year?: string;
  summary: string;
  results: DiscoveryResult[];
};
