import "server-only";

import { randomUUID } from "node:crypto";
import type { MediaDetails, MediaSource, Movie, PlaybackHistorySnapshot } from "@/lib/media-types";
import { validMovieCategories } from "@/lib/movie-categories";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function httpUrl(value: unknown) {
  const raw = text(value, 4_000);
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function posterUrl(value: unknown) {
  const raw = text(value, 150_000);
  if (/^data:image\/(?:webp|jpeg|png);base64,/i.test(raw)) return raw;
  return httpUrl(raw);
}

function parameters(value: unknown): Movie["parameters"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries: Array<[string, string | number | boolean]> = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    const cleanKey = text(key, 60);
    if (!cleanKey || (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")) continue;
    entries.push([cleanKey, typeof item === "string" ? item.slice(0, 500) : item]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function sanitizeMovie(value: unknown, keepId = true): Movie {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sources: MediaSource[] = Array.isArray(input.sources) ? input.sources.slice(0, 10).flatMap((source): MediaSource[] => {
    if (!source || typeof source !== "object") return [];
    const item = source as Record<string, unknown>;
    const url = httpUrl(item.url);
    if (!url) return [];
    const kind: NonNullable<MediaSource["kind"]> = item.kind === "hls" || item.kind === "embed" || item.kind === "video" ? item.kind : "video";
    return [{ quality: text(item.quality, 80) || "أصلي", url, size: 0, kind }];
  }) : [];
  if (sources.length === 0) throw new Error("A valid HTTP media source is required");

  const subtitles = Array.isArray(input.subtitles) ? input.subtitles.slice(0, 20).flatMap((track) => {
    if (!track || typeof track !== "object") return [];
    const item = track as Record<string, unknown>;
    const url = httpUrl(item.url);
    if (!url) return [];
    return [{ label: text(item.label, 80) || "ترجمة", language: text(item.language, 20) || "und", url }];
  }) : [];

  const title = text(input.title, 180);
  if (!title) throw new Error("Movie title is required");
  const suppliedId = text(input.id, 120).replace(/[^a-zA-Z0-9_-]/g, "-");
  const poster = posterUrl(input.poster);
  return {
    id: keepId && suppliedId ? suppliedId : `movie-${randomUUID()}`,
    title,
    description: text(input.description, 2_000) || undefined,
    parameters: parameters(input.parameters),
    titleOrigin: input.titleOrigin === "user" || input.titleOrigin === "smart" || input.titleOrigin === "filename" || input.titleOrigin === "catalog"
      ? input.titleOrigin
      : "catalog",
    poster: poster || undefined,
    categories: validMovieCategories(input.categories),
    sortOrder: typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder) ? Math.max(0, Math.floor(input.sortOrder)) : undefined,
    sources,
    subtitles,
  };
}

export function sanitizeHistoryPayload(value: unknown): {
  visitorId: string;
  movie: Movie;
  snapshot: PlaybackHistorySnapshot;
} {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const visitorId = text(input.visitorId, 80).replace(/[^a-zA-Z0-9_-]/g, "");
  if (visitorId.length < 12) throw new Error("Invalid visitor ID");
  const movie = sanitizeMovie(input.movie);
  const rawSnapshot = input.snapshot && typeof input.snapshot === "object" ? input.snapshot as Record<string, unknown> : {};
  const rawDetails = rawSnapshot.details && typeof rawSnapshot.details === "object" ? rawSnapshot.details as Record<string, unknown> : {};
  const type = rawDetails.type === "HLS" || rawDetails.type === "Embed" ? rawDetails.type : "Direct";
  const sourceUrl = httpUrl(rawDetails.sourceUrl) || movie.sources[0].url;
  const details: MediaDetails = {
    type,
    sourceUrl,
    currentQuality: text(rawDetails.currentQuality, 100) || undefined,
    resolution: text(rawDetails.resolution, 40) || undefined,
    bitrate: typeof rawDetails.bitrate === "number" ? Math.max(0, rawDetails.bitrate) : undefined,
    codecs: text(rawDetails.codecs, 160) || undefined,
  };
  return {
    visitorId,
    movie,
    snapshot: {
      progress: typeof rawSnapshot.progress === "number" ? Math.max(0, rawSnapshot.progress) : 0,
      duration: typeof rawSnapshot.duration === "number" ? Math.max(0, rawSnapshot.duration) : 0,
      watchedAt: Date.now(),
      details,
    },
  };
}
