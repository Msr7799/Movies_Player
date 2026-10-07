import type { Movie } from "@/lib/media-types";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";
import { sanitizeMovie } from "@/lib/server-validation";

export const runtime = "nodejs";

type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

export async function PATCH(request: Request, context: RouteContext<"/api/admin/movies/[id]">) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const { id } = await context.params;
    const database = await ensureDatabaseIndexes();
    const existing = await database.collection<MovieDocument>("movies").findOne({ id });
    if (!existing) return Response.json({ error: "الفيلم غير موجود." }, { status: 404 });
    const patch = await request.json() as Record<string, unknown>;
    const movie = sanitizeMovie({ ...existing, ...patch, id });
    await database.collection<MovieDocument>("movies").updateOne(
      { id },
      { $set: { ...movie, updatedAt: new Date() } },
    );
    await database.collection("playback_history").updateMany(
      { movieId: id },
      { $set: { movie } },
    );
    return Response.json({ movie });
  } catch {
    return Response.json({ error: "تعذر تعديل الفيلم." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/movies/[id]">) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const { id } = await context.params;
  const database = await ensureDatabaseIndexes();
  const result = await database.collection<MovieDocument>("movies").deleteOne({ id });
  await database.collection("playback_history").deleteMany({ movieId: id });
  return result.deletedCount
    ? Response.json({ ok: true })
    : Response.json({ error: "الفيلم غير موجود." }, { status: 404 });
}
