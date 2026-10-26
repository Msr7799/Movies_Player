import type { Db } from "mongodb";

type HistoryDeletion = { movieId: string; deletedAt: number };

export async function deletePlaybackHistory(database: Db, movieIds: string[]) {
  const ids = [...new Set(movieIds)].filter(Boolean);
  if (!ids.length) return 0;

  const deletedAt = Date.now();
  await database.collection<HistoryDeletion>("playback_history_deletions").bulkWrite(
    ids.map((movieId) => ({
      updateOne: {
        filter: { movieId },
        update: { $set: { deletedAt } },
        upsert: true,
      },
    })),
  );
  const result = await database.collection("playback_history").deleteMany({ movieId: { $in: ids } });
  return result.deletedCount;
}

export async function historyWasDeleted(database: Db, movieId: string, watchedAt: number) {
  const deletion = await database.collection<HistoryDeletion>("playback_history_deletions").findOne({ movieId });
  return deletion !== null && watchedAt <= deletion.deletedAt;
}
