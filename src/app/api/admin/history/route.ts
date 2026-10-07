import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export async function DELETE() {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const database = await ensureDatabaseIndexes();
  const result = await database.collection("playback_history").deleteMany({});
  return Response.json({ ok: true, deleted: result.deletedCount });
}
