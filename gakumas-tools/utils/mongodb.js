import { MongoClient } from "mongodb";

const { MONGODB_URI, MONGODB_DB } = process.env;

if (!MONGODB_URI) {
  console.warn(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
}

if (!MONGODB_DB) {
  console.warn(
    "Please define the MONGODB_DB environment variable inside .env.local"
  );
}

const INDEXES = {
  memories: { userId: 1 },
  loadouts: { userId: 1, createdAt: -1 },
};

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = global.mongo;

if (!cached) {
  cached = global.mongo = { conn: null, promise: null };
}

async function ensureIndexes(db) {
  try {
    await Promise.all(
      Object.entries(INDEXES).map(([name, keys]) =>
        db.collection(name).createIndex(keys)
      )
    );
  } catch (err) {
    console.warn("mongodb: could not ensure indexes:", err?.message || err);
  }
}

async function createConnection() {
  const client = await MongoClient.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const db = client.db(MONGODB_DB);
  await ensureIndexes(db);
  return { client, db };
}

export async function connect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = createConnection().catch((err) => {
      // Let the next request retry instead of awaiting this rejection.
      cached.promise = null;
      throw err;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
