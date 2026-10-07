import { createHash } from "node:crypto";
import { isAdminRequest } from "@/lib/admin-auth";
import type { Movie } from "@/lib/media-types";
import { ensureDatabaseIndexes } from "@/lib/mongodb";
import { sanitizeMovie } from "@/lib/server-validation";

export const runtime = "nodejs";
type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

function records(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const input = value as Record<string, unknown>;
  if (Array.isArray(input.movies)) return input.movies;
  return Object.values(input);
}

function normalizedRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = value as Record<string, unknown>;
  const streams = Array.isArray(item.streams) ? item.streams : [];
  const qualities = Array.isArray(item.qualities) ? item.qualities : [];
  const suppliedSources = Array.isArray(item.sources) ? item.sources.filter((source) => {
    if (!source || typeof source !== "object") return false;
    const url = String((source as Record<string, unknown>).url ?? "");
    return !/\.(?:gif|png|jpe?g|webp)(?:$|[?#])/i.test(url) && !/(?:^|\/)ping(?:\.|\/)/i.test(url);
  }) : [];
  const directUrl = typeof item.url === "string" ? [{ url: item.url, quality: item.quality ?? "HLS", kind: item.kind ?? "hls" }] : [];
  const collectorSources = [...streams, ...qualities].flatMap((stream) => {
    const source = stream && typeof stream === "object" ? stream as Record<string, unknown> : {};
    const url = typeof source.url === "string" ? source.url : "";
    return /\.m3u8(?:$|[?#])/i.test(url) ? [{ url, quality: source.label ?? source.quality ?? "HLS", kind: "hls" }] : [];
  });
  const sourceMap = new Map<string, unknown>();
  for (const source of [...suppliedSources, ...collectorSources, ...directUrl]) {
    if (!source || typeof source !== "object") continue;
    const url = String((source as Record<string, unknown>).url ?? "");
    if (!url || sourceMap.has(url)) continue;
    sourceMap.set(url, source);
  }
  const sources = [...sourceMap.values()];
  const firstUrl = sources.find((source) => source && typeof source === "object" && typeof (source as Record<string, unknown>).url === "string");
  const mediaUrl = firstUrl && typeof firstUrl === "object" ? String((firstUrl as Record<string, unknown>).url ?? "") : "";
  const title = item.title ?? item.name;
  const suppliedId = typeof item.id === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(item.id) ? item.id : "";
  const id = suppliedId || `import-${createHash("sha256").update(`${String(item.id ?? title ?? "")}|${mediaUrl}`).digest("hex").slice(0, 20)}`;
  return {
    ...item,
    id,
    title,
    poster: item.poster ?? item.thumbnailURL ?? item.thumbnail ?? item.image,
    sources,
    subtitles: Array.isArray(item.subtitles) ? item.subtitles : [],
    titleOrigin: "catalog",
  };
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const body = await request.json() as { catalog?: unknown; rightsConfirmed?: unknown };
    if (body.rightsConfirmed !== true) return Response.json({ error: "يجب تأكيد امتلاك حقوق نشر المصادر." }, { status: 400 });
    const input = records(body.catalog).slice(0, 200);
    const movies: Movie[] = [];
    let ignored = 0;
    for (const record of input) {
      try { movies.push(sanitizeMovie(normalizedRecord(record))); }
      catch { ignored += 1; }
    }
    const database = await ensureDatabaseIndexes();
    const now = new Date();
    if (movies.length) await database.collection<MovieDocument>("movies").bulkWrite(movies.map((movie) => ({
      updateOne: {
        filter: { id: movie.id },
        update: { $set: { ...movie, updatedAt: now }, $setOnInsert: { createdAt: now } },
        upsert: true,
      },
    })));
    return Response.json({ imported: movies.length, ignored, ids: movies.map((movie) => movie.id) });
  } catch {
    return Response.json({ error: "ملف JSON غير صالح أو أكبر من المسموح." }, { status: 400 });
  }
}
