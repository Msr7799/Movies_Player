import { isAdminRequest } from "@/lib/admin-auth";
import { DEFAULT_CATEGORY_COLORS, sanitizeCategoryColors } from "@/lib/category-colors";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";
type CategorySettings = { _id: string; colors?: unknown; updatedAt?: Date };

export async function GET() {
  try {
    const database = await ensureDatabaseIndexes();
    const settings = await database.collection<CategorySettings>("site_settings").findOne({ _id: "category-colors" });
    return Response.json({ colors: { ...DEFAULT_CATEGORY_COLORS, ...sanitizeCategoryColors(settings?.colors) } });
  } catch {
    return Response.json({ colors: DEFAULT_CATEGORY_COLORS });
  }
}

export async function PATCH(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const body = await request.json() as { colors?: unknown };
    const colors = sanitizeCategoryColors(body.colors);
    const database = await ensureDatabaseIndexes();
    await database.collection<CategorySettings>("site_settings").updateOne(
      { _id: "category-colors" },
      { $set: { colors, updatedAt: new Date() } },
      { upsert: true },
    );
    return Response.json({ colors: { ...DEFAULT_CATEGORY_COLORS, ...colors } });
  } catch {
    return Response.json({ error: "تعذر حفظ ألوان التصنيفات." }, { status: 400 });
  }
}
