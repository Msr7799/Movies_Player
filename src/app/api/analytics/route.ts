import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";

const allowedEvents = new Set(["visit", "search", "play"]);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event : "";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) : "";
    if (!allowedEvents.has(event) || visitorId.length < 12) return Response.json({ error: "Invalid event" }, { status: 400 });
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const database = await ensureDatabaseIndexes();
    if (event === "visit") {
      await database.collection("analytics_events").updateOne(
        { visitorId, event, day },
        { $setOnInsert: { visitorId, event, day, createdAt: now }, $set: { lastSeenAt: now } },
        { upsert: true },
      );
    } else {
      await database.collection("analytics_events").insertOne({
        visitorId,
        event,
        day,
        provider: typeof body.provider === "string" ? body.provider.slice(0, 20) : undefined,
        resultCount: typeof body.resultCount === "number" ? Math.max(0, Math.min(100, body.resultCount)) : undefined,
        movieId: typeof body.movieId === "string" ? body.movieId.slice(0, 120) : undefined,
        createdAt: now,
      });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }
}
