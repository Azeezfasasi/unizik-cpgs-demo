import { db } from '@/lib/db';
import { json, out, pageMeta, paging, requireRead, v1 } from '@/lib/v1';
import { Amendment } from '@/models';

/** Amendments to locked records. Query: status (PENDING|APPROVED|REJECTED), page, limit. */
export const GET = v1(async (req: Request) => {
  await requireRead('amendment:request', 'amendment:approve', 'audit:read');
  await db();
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const filter: Record<string, unknown> = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? { status } : {};
  const { page, limit, skip } = paging(url);
  const [total, rows] = await Promise.all([
    Amendment.countDocuments(filter),
    Amendment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('requestedBy', 'name').populate('decidedBy', 'name')
      .populate({ path: 'record', select: 'degree student version', populate: { path: 'student', select: 'matricNo surname otherNames' } }).lean(),
  ]);
  return json({ data: rows.map((a) => out(a)), meta: pageMeta(page, limit, total) });
});
