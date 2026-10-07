import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export async function GET() {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const database = await ensureDatabaseIndexes();
  const documents = await database.collection("playback_history")
    .find({}, { projection: { _id: 0, visitorId: 0, updatedAt: 0 } })
    .sort({ watchedAt: -1 })
    .limit(300)
    .toArray();
  const unique = new Map<string, unknown>();
  for (const document of documents) {
    const movieId = typeof document.movieId === "string" ? document.movieId : "";
    if (movieId && !unique.has(movieId)) unique.set(movieId, document);
  }
  return Response.json({ history: [...unique.values()] });
}

export async function DELETE(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { movieIds?: unknown };
  const movieIds = Array.isArray(body.movieIds)
    ? [...new Set(body.movieIds.filter((id): id is string => typeof id === "string" && id.length <= 120))].slice(0, 100)
    : [];
  if (!movieIds.length) return Response.json({ error: "حدد فيلمًا واحدًا على الأقل." }, { status: 400 });
  const database = await ensureDatabaseIndexes();
  const result = await database.collection("playback_history").deleteMany({ movieId: { $in: movieIds } });
  return Response.json({ ok: true, deleted: result.deletedCount });
}
