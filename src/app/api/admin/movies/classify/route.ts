import { isAdminRequest } from "@/lib/admin-auth";
import { GeminiRequestError, geminiJson } from "@/lib/gemini";
import type { Movie } from "@/lib/media-types";
import { MOVIE_CATEGORIES, validMovieCategories } from "@/lib/movie-categories";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";

type MovieDocument = Movie & { createdAt: Date; updatedAt: Date };

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          categories: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
        required: ["id", "categories"],
      },
    },
  },
  required: ["items"],
};

function safeSource(value: string | undefined) {
  try {
    const parsed = new URL(value || "");
    return `${parsed.hostname}${decodeURIComponent(parsed.pathname).slice(0, 240)}`;
  } catch { return ""; }
}

export async function POST(request: Request) {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const body = await request.json() as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === "string" && id.length <= 120))].slice(0, 40)
      : [];
    if (ids.length === 0) return Response.json({ error: "حدد فيلمًا واحدًا على الأقل." }, { status: 400 });
    const database = await ensureDatabaseIndexes();
    const movies = await database.collection<MovieDocument>("movies")
      .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, title: 1, sources: 1 } })
      .toArray();
    if (movies.length === 0) return Response.json({ error: "لم يتم العثور على الأفلام المحددة." }, { status: 404 });
    const allowed = MOVIE_CATEGORIES.map(([id, label]) => `${id}=${label}`).join(", ");
    const result = await geminiJson<{ items: Array<{ id: string; categories: string[] }> }>(
      `Classify each supplied movie or series using only the allowed category IDs. Choose nationality/type categories and relevant genres when evidence in the title or sanitized source path supports them. Do not invent categories. "social" is only for social-media-origin content, and "site" is only for content produced by this site's owner. Allowed: ${allowed}. Items: ${JSON.stringify(movies.map((movie) => ({ id: movie.id, title: movie.title, source: safeSource(movie.sources[0]?.url) })))}.`,
      schema,
      35_000,
    );
    const updates = result.items.flatMap((item) => {
      if (!ids.includes(item.id)) return [];
      const categories = validMovieCategories(item.categories);
      return categories.length ? [{ id: item.id, categories }] : [];
    });
    if (updates.length) {
      await database.collection<MovieDocument>("movies").bulkWrite(updates.map((item) => ({
        updateOne: { filter: { id: item.id }, update: { $set: { categories: item.categories, updatedAt: new Date() } } },
      })));
      await Promise.all(updates.map((item) => database.collection("playback_history").updateMany(
        { movieId: item.id },
        { $set: { "movie.categories": item.categories } },
      )));
    }
    return Response.json({ updated: updates.length, items: updates });
  } catch (cause) {
    if (cause instanceof GeminiRequestError) {
      const messages = {
        "missing-key": "متغير GEMINI_API_KEY غير موجود في بيئة Vercel Production.",
        quota: "توقفت حصة Gemini أو تجاوز المفتاح حد الطلبات. راجع Quotas في Google AI Studio.",
        forbidden: "رفض Gemini المفتاح. تحقق من صلاحية المفتاح وقيود API والمشروع المرتبط به.",
        model: "نموذج Gemini المحدد غير متاح لهذا المفتاح أو المشروع.",
        timeout: "انتهت مهلة Gemini قبل اكتمال التصنيف. جرّب عددًا أقل من الأفلام.",
        request: "رفض Gemini طلب التصنيف أو أعاد استجابة غير صالحة.",
      } as const;
      return Response.json({ error: messages[cause.reason], diagnostic: cause.message }, { status: 502 });
    }
    return Response.json({ error: "تعذر إكمال تصنيف Gemini الآن." }, { status: 502 });
  }
}
