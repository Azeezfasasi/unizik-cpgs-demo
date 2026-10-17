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
 * Appends a hash-chained entry. The next number and previous hash come from the last entry in
 * the log itself, and the unique index on `seq` makes concurrent writers retry instead of
 * forking the chain. The separate head record is only a mirror used by verification, so a
 * missing or stale head can never block writes (or sign-in).
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
    const last = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
    const prev = last ? { seq: last.seq, hash: last.hash } : { seq: 0, hash: 'GENESIS' };
    const seq = prev.seq + 1;
    const at = new Date();
    const hash = computeHash({ seq, at, actor: actor?.id, action, entity, entityId, before: b, after: a, prevHash: prev.hash });
    try {
      await AuditLog.create({
        seq, at, actor: actor?.id, actorName: actor?.name, action, entity, entityId,
        before: b, after: a, ip, userAgent, prevHash: prev.hash, hash,
      });
    } catch (err) {
      // Another writer took this number first: re-read the end of the chain and try again.
      if ((err as { code?: number })?.code === 11000) {
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
        continue;
      }
      throw err;
    }
    await mirrorHead(seq, hash);
    return;
  }
  throw new Error('Could not append audit entry (chain contention)');
}

/**
 * Keeps the head record at the highest entry written, so verification can tell if entries were
 * removed from the end of the log. Best effort: it never blocks or fails an audited action.
 */
async function mirrorHead(seq: number, hash: string) {
  try {
    await AuditHead.updateOne({ _id: 'head' }, [{
      $set: {
        hash: { $cond: [{ $lt: [{ $ifNull: ['$seq', 0] }, seq] }, hash, '$hash'] },
        seq: { $max: [{ $ifNull: ['$seq', 0] }, seq] },
      },
    }], { upsert: true, updatePipeline: true });
  } catch (err) {
    console.error('[audit] could not update the chain head mirror', err);
  }
}

export type ChainBreak = 'missing' | 'altered' | 'truncated';

/**
 * Recomputes the chain. Returns the first broken sequence number (null if intact) and why:
 * an entry missing from the sequence, an entry whose contents or links no longer match its
 * hash, or entries removed from the end (the head mirror is ahead of the last entry).
 */
export async function verifyAuditChain() {
  await db();
  let prev = 'GENESIS', expectedSeq = 1, checked = 0;
  const cursor = AuditLog.find().sort({ seq: 1 }).lean().cursor();
  for await (const e of cursor) {
    const recomputed = computeHash({
      seq: e.seq, at: e.at, actor: e.actor?.toString(), action: e.action, entity: e.entity,
      entityId: e.entityId, before: e.before, after: e.after, prevHash: e.prevHash,
    });
    if (e.seq !== expectedSeq) return { ok: false as const, brokenAt: expectedSeq, checked, reason: 'missing' as ChainBreak };
    if (e.prevHash !== prev || e.hash !== recomputed) return { ok: false as const, brokenAt: e.seq, checked, reason: 'altered' as ChainBreak };
    prev = e.hash; expectedSeq++; checked++;
  }
  const head = await AuditHead.findById('head').lean();
  if (head && head.seq >= expectedSeq) return { ok: false as const, brokenAt: expectedSeq, checked, reason: 'truncated' as ChainBreak };
  return { ok: true as const, brokenAt: null, checked, reason: null };
}

/** One sentence explaining a chain break, for the audit page, the API and the nightly email. */
export function describeChainBreak(r: { brokenAt: number | null; checked: number; reason: ChainBreak | null }) {
  if (r.brokenAt == null) return `Chain intact: ${r.checked} entries verified.`;
  const what = {
    missing: `entry #${r.brokenAt} is missing (removed from the log)`,
    altered: `entry #${r.brokenAt} was altered or does not link to the entry before it`,
    truncated: `entries from #${r.brokenAt} onwards were removed from the end of the log`,
  }[r.reason ?? 'altered'];
  return `Chain broken: ${what}. ${r.checked} entries before it are valid.`;
}
