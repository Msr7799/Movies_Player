import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length <= 120))].slice(0, 500)
      : [];
    if (!ids.length) return Response.json({ error: "قائمة الترتيب فارغة." }, { status: 400 });
    const database = await ensureDatabaseIndexes();
    await database.collection("movies").bulkWrite(ids.map((id, sortOrder) => ({
      updateOne: { filter: { id }, update: { $set: { sortOrder, updatedAt: new Date() } } },
    })));
    return Response.json({ ok: true, count: ids.length });
  } catch {
    return Response.json({ error: "تعذر حفظ ترتيب الأفلام." }, { status: 400 });
  }
}
