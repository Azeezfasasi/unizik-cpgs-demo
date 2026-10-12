import 'server-only';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { AuditLog, AuditHead } from '@/models';
import { db } from './db';

type Actor = { id: string; name?: string } | null;

function chainSecret() {
  const s = process.env.AUDIT_CHAIN_SECRET;
  if (!s) throw new Error('AUDIT_CHAIN_SECRET is not set');
  return s;
}

/** Strip ObjectIds, Dates and undefined so the hashed form equals what Mongo returns later. */
const plain = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export function computeHash(e: {
  seq: number; at: Date; actor?: string | null; action: string; entity?: string | null;
  entityId?: string | null; before?: unknown; after?: unknown; prevHash: string;
}) {
  const body = JSON.stringify([
    e.seq, e.at.toISOString(), e.actor ?? null, e.action, e.entity ?? null, e.entityId ?? null,
    e.before ?? null, e.after ?? null, e.prevHash,
  ]);
  return crypto.createHmac('sha256', chainSecret()).update(body).digest('hex');
}

/**
 * Appends a hash-chained entry. The chain head is advanced with a compare-and-set,
 * so concurrent writers retry instead of forking the chain.
 */
export async function audit(actor: Actor, action: string, entity?: string, entityId?: string,
  before?: unknown, after?: unknown) {
  await db();
  let ip: string | undefined, userAgent: string | undefined;
  try {
    const h = await headers();
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
    userAgent = h.get('user-agent') ?? undefined;
  } catch {
    // called outside a request (cron/scripts)
  }
  const b = plain(before), a = plain(after);

  for (let attempt = 0; attempt < 20; attempt++) {
    const head = (await AuditHead.findById('head').lean()) ?? { seq: 0, hash: 'GENESIS' };
    const seq = head.seq + 1;
    const at = new Date();
    const hash = computeHash({ seq, at, actor: actor?.id, action, entity, entityId, before: b, after: a, prevHash: head.hash });

    const res = await AuditHead.updateOne(
      { _id: 'head', seq: head.seq },
      { $set: { seq, hash } },
      { upsert: head.seq === 0 },
    ).catch((err) => (err?.code === 11000 ? { modifiedCount: 0, upsertedCount: 0 } : Promise.reject(err)));

    if (res.modifiedCount === 1 || res.upsertedCount === 1) {
      await AuditLog.create({
        seq, at, actor: actor?.id, actorName: actor?.name, action, entity, entityId,
        before: b, after: a, ip, userAgent, prevHash: head.hash, hash,
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
  }
  throw new Error('Could not append audit entry (chain contention)');
}

/** Recomputes the chain. Returns the first broken sequence number, or null if intact. */
export async function verifyAuditChain() {
  await db();
  let prev = 'GENESIS', expectedSeq = 1, checked = 0;
  const cursor = AuditLog.find().sort({ seq: 1 }).lean().cursor();
  for await (const e of cursor) {
    const recomputed = computeHash({
      seq: e.seq, at: e.at, actor: e.actor?.toString(), action: e.action, entity: e.entity,
      entityId: e.entityId, before: e.before, after: e.after, prevHash: e.prevHash,
    });
    if (e.seq !== expectedSeq || e.prevHash !== prev || e.hash !== recomputed) {
      return { ok: false as const, brokenAt: e.seq, checked };
    }
    prev = e.hash; expectedSeq++; checked++;
  }
  return { ok: true as const, brokenAt: null, checked };
}
