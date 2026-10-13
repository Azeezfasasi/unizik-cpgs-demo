import { db } from '@/lib/db';
import { listSheets } from '@/lib/queries';
import { apiError, assertId, json, out, param, requireRead, v1, type RouteCtx } from '@/lib/v1';
import { DigitizationBatch } from '@/models';

/** A box with its team and the result sheets created from it. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  const user = await requireRead('digitization:view');
  const id = await param(ctx);
  assertId(id, 'Box');
  await db();
  const b = await DigitizationBatch.findById(id)
    .populate('department', 'name code').populate('sessions', 'label')
    .populate('indexer', 'name email').populate('reviewer', 'name email').lean<Record<string, { _id?: { equals(x: string): boolean } }>>();
  if (!b) return apiError(404, 'Box not found');
  if ((user.role === 'INDEXER' || user.role === 'QA_REVIEWER') && !b.indexer?._id?.equals(user.id) && !b.reviewer?._id?.equals(user.id)) {
    return apiError(404, 'Box not found');
  }
  return json({ data: { ...out(b), sheets: await listSheets({ batch: id }) } });
});
