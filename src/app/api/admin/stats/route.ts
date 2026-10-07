import { isAdminRequest } from "@/lib/admin-auth";
import { ensureDatabaseIndexes } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  if (!await isAdminRequest()) return Response.json({ error: "غير مصرح." }, { status: 401 });
  const database = await ensureDatabaseIndexes();
  const [movieCount, historyCount, uniqueVisitors, visits, searches, topMovies, recentActivity] = await Promise.all([
    database.collection("movies").countDocuments(),
    database.collection("playback_history").countDocuments(),
    database.collection("playback_history").distinct("visitorId").then((items) => items.length),
    database.collection("analytics_events").countDocuments({ event: "visit" }),
    database.collection("analytics_events").countDocuments({ event: "search" }),
    database.collection("playback_history").aggregate([
      { $group: { _id: "$movieId", title: { $first: "$movie.title" }, poster: { $first: "$movie.poster" }, plays: { $sum: 1 }, lastPlayedAt: { $max: "$watchedAt" } } },
      { $sort: { plays: -1, lastPlayedAt: -1 } },
      { $limit: 8 },
    ]).toArray(),
    database.collection("playback_history").find({}, { projection: { _id: 0, visitorId: 0 } }).sort({ watchedAt: -1 }).limit(12).toArray(),
  ]);
  return Response.json({ movieCount, historyCount, uniqueVisitors, visits, searches, topMovies, recentActivity });
}
