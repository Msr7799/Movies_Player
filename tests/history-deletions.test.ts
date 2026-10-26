import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { deletePlaybackHistory, historyWasDeleted } from "../src/lib/history-deletions.js";

describe("playback history deletion", () => {
  it("blocks an old browser snapshot while allowing a new watch", async () => {
    const deletions = new Map<string, number>();
    const history = new Set(["movie-a", "movie-b"]);
    const database = {
      collection(name: string) {
        if (name === "playback_history_deletions") return {
          async bulkWrite(operations: Array<{ updateOne: { filter: { movieId: string }; update: { $set: { deletedAt: number } } } }>) {
            for (const { updateOne } of operations) deletions.set(updateOne.filter.movieId, updateOne.update.$set.deletedAt);
          },
          async findOne(filter: { movieId: string }) {
            const deletedAt = deletions.get(filter.movieId);
            return deletedAt === undefined ? null : { movieId: filter.movieId, deletedAt };
          },
        };
        if (name === "playback_history") return {
          async deleteMany(filter: { movieId: { $in: string[] } }) {
            let deletedCount = 0;
            for (const id of filter.movieId.$in) if (history.delete(id)) deletedCount++;
            return { deletedCount };
          },
        };
        throw new Error(`Unexpected collection: ${name}`);
      },
    } as unknown as Db;

    const oldWatch = Date.now() - 60_000;
    expect(await deletePlaybackHistory(database, ["movie-a", "movie-a"])).toBe(1);
    expect(history.has("movie-a")).toBe(false);
    expect(await historyWasDeleted(database, "movie-a", oldWatch)).toBe(true);
    expect(await historyWasDeleted(database, "movie-a", Date.now() + 1)).toBe(false);
    expect(await historyWasDeleted(database, "movie-b", oldWatch)).toBe(false);
  });
});
