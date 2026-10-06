import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import type { MediaSource, Movie, SubtitleTrack } from "@/lib/media-types";

export const dynamic = "force-dynamic";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg"]);
const SUBTITLE_EXTENSIONS = new Set([".vtt", ".srt"]);
const POSTER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const QUALITY_PATTERN = /(?:[-_. ](2160|1440|1080|720|480|360)p)$/i;
const publicRoot = path.join(process.cwd(), "public", "assets");
const videosRoot = path.join(publicRoot, "videos");
const subtitlesRoot = path.join(publicRoot, "subtitles");
const postersRoot = path.join(publicRoot, "posters");

async function filesIn(directory: string) {
  try {
    return (await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  } catch { return []; }
}

function publicUrl(folder: string, filename: string) {
  return `/assets/${folder}/${filename.split(path.sep).map(encodeURIComponent).join("/")}`;
}

function cleanTitle(name: string) {
  return name.replace(QUALITY_PATTERN, "").replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function subtitleMeta(filename: string): SubtitleTrack {
  const base = path.parse(filename).name;
  const languagePart = base.split(/[._-]/).at(-1)?.toLowerCase() ?? "ar";
  const languages: Record<string, string> = {
    ar: "العربية", en: "English", fr: "Français", es: "Español", tr: "Türkçe",
  };
  return {
    label: languages[languagePart] ?? languagePart.toUpperCase(),
    language: languagePart,
    url: publicUrl("subtitles", filename),
  };
}

export async function GET() {
  await Promise.all([
    fs.mkdir(videosRoot, { recursive: true }),
    fs.mkdir(subtitlesRoot, { recursive: true }),
    fs.mkdir(postersRoot, { recursive: true }),
  ]);
  const [videoFiles, subtitleFiles, posterFiles] = await Promise.all([
    filesIn(videosRoot), filesIn(subtitlesRoot), filesIn(postersRoot),
  ]);
  const groups = new Map<string, MediaSource[]>();
  for (const filename of videoFiles) {
    const parsed = path.parse(filename);
    if (!VIDEO_EXTENSIONS.has(parsed.ext.toLowerCase())) continue;
    const match = parsed.name.match(QUALITY_PATTERN);
    const key = parsed.name.replace(QUALITY_PATTERN, "").toLowerCase();
    const stat = await fs.stat(path.join(videosRoot, filename));
    const source: MediaSource = {
      quality: match ? `${match[1]}p` : "أصلي",
      url: publicUrl("videos", filename),
      size: stat.size,
    };
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  const movies: Movie[] = [...groups.entries()].map(([key, sources]) => {
    const matchingSubtitles = subtitleFiles
      .filter((file) => SUBTITLE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .filter((file) => path.parse(file).name.toLowerCase().startsWith(key))
      .map(subtitleMeta);
    const poster = posterFiles.find((file) => {
      const parsed = path.parse(file);
      return POSTER_EXTENSIONS.has(parsed.ext.toLowerCase()) && parsed.name.toLowerCase() === key;
    });
    return {
      id: key,
      title: cleanTitle(key),
      poster: poster ? publicUrl("posters", poster) : undefined,
      sources: sources.sort((a, b) => parseInt(b.quality) - parseInt(a.quality)),
      subtitles: matchingSubtitles,
    };
  });
  return NextResponse.json({ movies });
}
