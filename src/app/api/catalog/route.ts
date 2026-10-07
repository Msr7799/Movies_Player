import { ensureDatabaseIndexes } from "@/lib/mongodb";
import type { Movie } from "@/lib/media-types";

export const runtime = "nodejs";

type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

export async function GET() {
  try {
    const database = await ensureDatabaseIndexes();
    const documents = await database.collection<MovieDocument>("movies")
      .find({}, { projection: { _id: 0, createdAt: 0, updatedAt: 0 } })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
    documents.sort((left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER));
    return Response.json({ movies: documents });
  } catch {
    return Response.json({ error: "تعذر تحميل المكتبة العامة الآن." }, { status: 503 });
  }
}
