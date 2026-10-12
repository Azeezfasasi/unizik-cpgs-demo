import 'server-only';
import mongoose, { type ClientSession } from 'mongoose';
import { db } from './db';

let supportsTxn: boolean | undefined;

/**
 * Runs `fn` in a transaction when the deployment supports it (Atlas, replica sets),
 * otherwise runs it directly (standalone dev servers).
 */
export async function withTxn<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
  await db();
  if (supportsTxn === undefined) {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    supportsTxn = !!hello.setName || hello.msg === 'isdbgrid';
  }
  if (!supportsTxn) return fn(null);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await fn(session); });
    return result;
  } finally {
    await session.endSession();
  }
}
