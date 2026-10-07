import type { Movie } from "@/lib/media-types";
import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";
import { sanitizeMovie } from "@/lib/server-validation";

export const runtime = "nodejs";

type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

export async function POST(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const movie = sanitizeMovie(await request.json());
    const now = new Date();
    const database = await ensureDatabaseIndexes();
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
