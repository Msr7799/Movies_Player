import "server-only";

import dns from "node:dns";
import { MongoClient, ServerApiVersion, type Db } from "mongodb";

declare global {
  var __anyMovieMongoClient: Promise<MongoClient> | undefined;
  var __anyMovieMongoIndexes: Promise<Db> | undefined;
}

function mongoClient() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!global.__anyMovieMongoClient) {
    const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",").map((value) => value.trim()).filter(Boolean);
    if (dnsServers?.length) dns.setServers(dnsServers);
    const client = new MongoClient(uri, {
      appName: "any-movie-web",
      maxPoolSize: 10,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    global.__anyMovieMongoClient = client.connect();
  }
  return global.__anyMovieMongoClient;
}

export async function movieDatabase(): Promise<Db> {
  const client = await mongoClient();
  return client.db(process.env.MONGODB_DATABASE?.trim() || "any_movie");
}

export async function ensureDatabaseIndexes() {
  if (!global.__anyMovieMongoIndexes) {
    global.__anyMovieMongoIndexes = movieDatabase().then(async (database) => {
      await Promise.all([
        database.collection("movies").createIndex({ updatedAt: -1 }),
        database.collection("movies").createIndex({ sortOrder: 1, updatedAt: -1 }),
        database.collection("movies").createIndex({ categories: 1, updatedAt: -1 }),
        database.collection("playback_history").createIndex({ visitorId: 1, movieId: 1 }, { unique: true }),
        database.collection("playback_history").createIndex({ watchedAt: -1 }),
        database.collection("analytics_events").createIndex({ createdAt: -1 }),
        database.collection("analytics_events").createIndex({ visitorId: 1, event: 1, day: 1 }),
      ]);
      return database;
    });
  }
  return global.__anyMovieMongoIndexes;
}
