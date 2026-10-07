import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export async function PATCH(request: Request, context: RouteContext<"/api/admin/history/[id]">) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({})) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 180) : "";
  if (title.length < 2) return Response.json({ error: "اسم الفيلم قصير أو غير صالح." }, { status: 400 });
  const database = await ensureDatabaseIndexes();
  const [history] = await Promise.all([
    database.collection("playback_history").updateMany({ movieId: id }, { $set: { "movie.title": title, "movie.titleOrigin": "user" } }),
    database.collection("movies").updateOne({ id }, { $set: { title, titleOrigin: "user", updatedAt: new Date() } }),
  ]);
  return history.matchedCount
    ? Response.json({ ok: true, title, updated: history.modifiedCount })
    : Response.json({ error: "الفيلم غير موجود في السجل." }, { status: 404 });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/history/[id]">) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const { id } = await context.params;
  const database = await ensureDatabaseIndexes();
  const result = await database.collection("playback_history").deleteMany({ movieId: id });
  return Response.json({ ok: true, deleted: result.deletedCount });
}
