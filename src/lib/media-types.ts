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
