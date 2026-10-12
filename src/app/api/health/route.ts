import mongoose from 'mongoose';
import { connection } from 'next/server';
import { db } from '@/lib/db';
import { storageDriver } from '@/lib/storage';

/** Uptime probe: confirms the app can reach the database. */
export async function GET() {
  await connection();
  try {
    await db();
    await mongoose.connection.db!.admin().ping();
    return Response.json({ ok: true, storage: storageDriver(), time: new Date().toISOString() }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
