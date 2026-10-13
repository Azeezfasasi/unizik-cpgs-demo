import { requirePermission } from '@/lib/auth';
import { assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { decideAmendment } from '@/app/(portal)/amendments/actions';

/**
 * Approve or reject an amendment (Provost; never the requester).
 * Body: { decision: "approve" | "reject", comment? }; a comment is required to reject.
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('amendment:approve');
  const id = await param(ctx);
  assertId(id, 'Amendment');
  return fromAction(await decideAmendment(id, {}, toForm(await readJson(req))));
});
