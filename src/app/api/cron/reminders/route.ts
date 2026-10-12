import { cronAuthorized } from '@/lib/cron';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notifySheet } from '@/lib/sheets';
import { FLOW, type FlowStage } from '@/lib/workflow';
import { ResultSheet } from '@/models';

const WEEK = 7 * 864e5;

/** Daily: reminds approvers holding a sheet at their stage for more than 7 days (at most weekly per sheet). */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  await db();
  const cutoff = new Date(Date.now() - WEEK);
  const stuck = await ResultSheet.find({
    origin: 'ONLINE', status: { $in: Object.keys(FLOW) as FlowStage[] }, statusSince: { $lt: cutoff },
    $or: [{ remindedAt: null }, { remindedAt: { $lt: cutoff } }],
  }).select('_id').lean();
  for (const s of stuck) {
    await notifySheet(s._id);
    await ResultSheet.updateOne({ _id: s._id }, { $set: { remindedAt: new Date() } });
  }
  await audit(null, 'cron.reminders', 'ResultSheet', undefined, undefined, { reminded: stuck.length });
  return Response.json({ reminded: stuck.length });
}
