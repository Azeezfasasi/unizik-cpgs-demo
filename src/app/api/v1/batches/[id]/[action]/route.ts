import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { assignBatch, setBatchStatus } from '@/app/(portal)/digitization/actions';

/**
 * PUT /batches/{id}/assignments  { indexer?, reviewer? }  (must be different people)
 * PUT /batches/{id}/status       { status: INVENTORIED | IN_PROGRESS | COMPLETED }
 */
export const PUT = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('batch:assign');
  const id = await param(ctx);
  assertId(id, 'Box');
  const body = await readJson(req);
  switch (await param(ctx, 'action')) {
    case 'assignments': return fromAction(await assignBatch(id, {}, toForm(body)));
    case 'status': return fromAction(await setBatchStatus(id, {}, toForm(body)));
    default: return apiError(404, 'Unknown box action. Use assignments or status.');
  }
});
