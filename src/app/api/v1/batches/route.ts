import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { fromAction, json, out, pageMeta, paging, readJson, requireRead, toForm, v1 } from '@/lib/v1';
import { createBatch } from '@/app/(portal)/digitization/actions';
import { DigitizationBatch } from '@/models';

/** Archive boxes. Indexers and QA Reviewers see only boxes assigned to them. Query: status, department, page, limit. */
export const GET = v1(async (req: Request) => {
  const user = await requireRead('digitization:view');
  await db();
  const url = new URL(req.url);
  const filter: Record<string, unknown> = {};
  if (user.role === 'INDEXER') filter.indexer = user.id;
  if (user.role === 'QA_REVIEWER') filter.reviewer = user.id;
  const status = url.searchParams.get('status');
  if (status) filter.status = status;
  const department = url.searchParams.get('department');
  if (department) filter.department = department;
  const { page, limit, skip } = paging(url);
  const [total, rows] = await Promise.all([
    DigitizationBatch.countDocuments(filter),
    DigitizationBatch.find(filter).sort({ priority: 1, boxCode: 1 }).skip(skip).limit(limit)
      .populate('department', 'name code').populate('sessions', 'label')
      .populate('indexer', 'name email').populate('reviewer', 'name email').lean(),
  ]);
  return json({ data: rows.map((b) => out(b)), meta: pageMeta(page, limit, total) });
});

/**
 * Inventory a box (Taskforce Lead, Head of Records). Body: { boxCode, department, sessions: [ids],
 * estimatedSheets, condition, priority, location?, notes? }.
 */
export const POST = v1(async (req: Request) => {
  await requirePermission('batch:assign');
  const res = await createBatch({}, toForm(await readJson(req), { __api: '1' }));
  if (!res.ok) return fromAction(res);
  await db();
  const b = await DigitizationBatch.findById(res.data?.id).populate('department', 'name code').populate('sessions', 'label').lean();
  return json({ ok: true, data: b ? out(b) : null }, 201);
});
