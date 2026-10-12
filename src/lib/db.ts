import 'server-only';
import mongoose from 'mongoose';

const g = globalThis as unknown as { _mongo?: Promise<typeof mongoose> };

/** Cached connection, safe for serverless and dev hot reloads. */
export async function db() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!g._mongo) {
    g._mongo = mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 }).catch((err) => {
      g._mongo = undefined;
      throw err;
    });
  }
  return g._mongo;
}
