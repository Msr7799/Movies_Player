import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  try {
    const database = await ensureDatabaseIndexes();
    const warnings: string[] = [];
    const safe = async <T>(label: string, operation: Promise<T>, fallback: T) => {
      try { return await operation; }
      catch (cause) {
        warnings.push(label);
        console.error(`[admin/stats] ${label}`, cause);
        return fallback;
      }
    };
    const [movieCount, historyCount, uniqueVisitors, visits, searches, topMovies, recentActivity] = await Promise.all([
      safe("movieCount", database.collection("movies").countDocuments(), 0),
      safe("historyCount", database.collection("playback_history").countDocuments(), 0),
      safe("uniqueVisitors", database.collection("playback_history").distinct("visitorId").then((items) => items.length), 0),
      safe("visits", database.collection("analytics_events").countDocuments({ event: "visit" }), 0),
      safe("searches", database.collection("analytics_events").countDocuments({ event: "search" }), 0),
      safe("topMovies", database.collection("playback_history").aggregate([
        { $group: { _id: "$movieId", title: { $first: "$movie.title" }, poster: { $first: "$movie.poster" }, plays: { $sum: 1 }, lastPlayedAt: { $max: "$watchedAt" } } },
        { $sort: { plays: -1, lastPlayedAt: -1 } },
        { $limit: 8 },
      ]).toArray(), []),
      safe("recentActivity", database.collection("playback_history").find({}, { projection: { _id: 0, visitorId: 0 } }).sort({ watchedAt: -1 }).limit(12).toArray(), []),
    ]);
    return Response.json({ movieCount, historyCount, uniqueVisitors, visits, searches, topMovies, recentActivity, warnings });
  } catch (cause) {
    console.error("[admin/stats] failed", cause);
    return Response.json({ error: "تعذر الاتصال بقاعدة البيانات لتحميل الإحصائيات." }, { status: 503 });
  }
}
