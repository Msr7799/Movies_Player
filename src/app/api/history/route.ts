import type { PlaybackHistoryEntry } from "@/lib/media-types";
import { ensureDatabaseIndexes } from "@/lib/mongodb";
import { sanitizeHistoryPayload } from "@/lib/server-validation";
import { historyWasDeleted } from "@/lib/history-deletions";

export const runtime = "nodejs";

const writeBuckets = new Map<string, number[]>();

function rateLimited(request: Request) {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const recent = (writeBuckets.get(key) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 30) return true;
  writeBuckets.set(key, [...recent, now]);
  return false;
}

type HistoryDocument = PlaybackHistoryEntry & {
  visitorId: string;
  movieId: string;
  updatedAt: Date;
};

export async function GET() {
  try {
    const database = await ensureDatabaseIndexes();
    const documents = await database.collection<HistoryDocument>("playback_history")
      .find({}, { projection: { _id: 0, visitorId: 0, movieId: 0, updatedAt: 0 } })
      .sort({ watchedAt: -1 })
      .limit(120)
      .toArray();
    const unique = new Map<string, PlaybackHistoryEntry>();
    for (const document of documents) {
      if (!unique.has(document.movie.id)) unique.set(document.movie.id, document);
      if (unique.size === 30) break;
    }
    return Response.json({ history: [...unique.values()] });
  } catch {
    return Response.json({ error: "تعذر تحميل سجل المشاهدة العام." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (rateLimited(request)) return Response.json({ error: "طلبات كثيرة." }, { status: 429 });
  let payload: ReturnType<typeof sanitizeHistoryPayload>;
  try {
    payload = sanitizeHistoryPayload(await request.json());
  } catch (cause) {
    console.warn("[history] invalid playback payload", cause instanceof Error ? cause.message : "invalid JSON");
    return Response.json({ error: "بيانات سجل المشاهدة غير صالحة." }, { status: 400 });
  }
  try {
    const { visitorId, movie, snapshot } = payload;
    const database = await ensureDatabaseIndexes();
    if (await historyWasDeleted(database, movie.id, snapshot.watchedAt)) {
      return Response.json({ ok: true, ignored: true });
    }
    await database.collection<HistoryDocument>("playback_history").updateOne(
      { visitorId, movieId: movie.id },
      {
        $set: {
          visitorId,
          movieId: movie.id,
          movie,
          ...snapshot,
          watchedAt: Date.now(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (cause) {
    console.error("[history] failed to save playback", cause);
    return Response.json({ error: "تعذر حفظ سجل المشاهدة الآن." }, { status: 503 });
  }
}
