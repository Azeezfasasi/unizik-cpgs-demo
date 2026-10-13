import { db } from '@/lib/db';
import { requirePermission, scopeFilter } from '@/lib/auth';
import { inboxCounts } from '@/lib/nav';
import { json, v1 } from '@/lib/v1';
import { AcademicSession, GraduandRecord, ResultSheet } from '@/models';

/** Dashboard figures for the caller's scope: records, sheets by status, graduands by session, work waiting. */
export const GET = v1(async () => {
  const user = await requirePermission();
  await db();
  const scope = await scopeFilter(user);
  const [records, locked, legacy, online, bySession, sheets, waiting] = await Promise.all([
    GraduandRecord.countDocuments(scope),
    GraduandRecord.countDocuments({ ...scope, locked: true }),
    GraduandRecord.countDocuments({ ...scope, origin: 'LEGACY' }),
    GraduandRecord.countDocuments({ ...scope, origin: 'ONLINE' }),
    GraduandRecord.aggregate<{ _id: unknown; n: number }>([{ $match: scope }, { $group: { _id: '$session', n: { $sum: 1 } } }]),
    ResultSheet.aggregate<{ _id: { origin: string; status: string }; n: number }>([
      { $match: scope }, { $group: { _id: { origin: '$origin', status: '$status' }, n: { $sum: 1 } } },
    ]),
    inboxCounts(user),
  ]);
  const sessions = await AcademicSession.find({ _id: { $in: bySession.map((s) => s._id as never) } }).lean<{ _id: { equals(x: unknown): boolean }; label: string }[]>();
  return json({
    data: {
      records: { total: records, locked, legacy, online },
      graduandsBySession: bySession
        .map((s) => ({ session: sessions.find((x) => x._id.equals(s._id))?.label ?? null, count: s.n }))
        .sort((a, b) => String(a.session).localeCompare(String(b.session))),
      sheetsByStatus: sheets.map((s) => ({ origin: s._id.origin, status: s._id.status, count: s.n })),
      waitingForYou: waiting,
    },
  });
});
