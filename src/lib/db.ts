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
      // The driver error carries class instances (TopologyDescription) that cannot cross to the
      // client error boundary, so log it here and throw a plain, readable error instead.
      console.error('[db] connection failed:', err?.name, err?.message);
      throw new Error(
        'Could not reach the database. Check your internet connection and that this IP address is allowed in MongoDB Atlas (Network Access), then retry.',
      );
    });
  }
  return g._mongo;
}
