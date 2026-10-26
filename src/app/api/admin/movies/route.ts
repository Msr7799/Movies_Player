import type { Movie } from "@/lib/media-types";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";
import { sanitizeMovie } from "@/lib/server-validation";
import { deletePlaybackHistory } from "@/lib/history-deletions";

export const runtime = "nodejs";

type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

export async function DELETE(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });

  let body: { all?: unknown; ids?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "بيانات الحذف غير صالحة." }, { status: 400 });
    }
    body = parsed as { all?: unknown; ids?: unknown };
  } catch {
    return Response.json({ error: "بيانات الحذف غير صالحة." }, { status: 400 });
  }

  const deleteAll = body.all === true;
  const ids: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const validIds = ids.filter((id): id is string => typeof id === "string" && Boolean(id.trim()) && id.length <= 120);
  if (!deleteAll && (
    validIds.length === 0
    || validIds.length !== ids.length
    || ids.length > 500
  )) {
    return Response.json({ error: "حدد من 1 إلى 500 فيلم صالح للحذف." }, { status: 400 });
  }

  try {
    const database = await ensureDatabaseIndexes();
    const movieCollection = database.collection<MovieDocument>("movies");
    const movieIds = deleteAll
      ? (await movieCollection.find({}, { projection: { _id: 0, id: 1 } }).toArray()).map((movie) => movie.id)
      : [...new Set(validIds)];
    if (!movieIds.length) return Response.json({ ok: true, deleted: 0 });

    const result = await movieCollection.deleteMany({ id: { $in: movieIds } });
    await deletePlaybackHistory(database, movieIds);
    return Response.json({ ok: true, deleted: result.deletedCount });
  } catch {
    return Response.json({ error: "تعذر حذف الأفلام المحددة." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const movie = sanitizeMovie(await request.json());
    const now = new Date();
    const database = await ensureDatabaseIndexes();
    if (movie.sortOrder === undefined) {
      const last = await database.collection<MovieDocument>("movies").findOne({}, { sort: { sortOrder: -1 }, projection: { sortOrder: 1 } });
      movie.sortOrder = typeof last?.sortOrder === "number" ? last.sortOrder + 1 : 0;
    }
    await database.collection<MovieDocument>("movies").updateOne(
      { id: movie.id },
      { $set: { ...movie, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    return Response.json({ movie });
  } catch {
    return Response.json({ error: "بيانات الفيلم غير صالحة." }, { status: 400 });
  }
}
