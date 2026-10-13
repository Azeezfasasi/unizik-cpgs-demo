import { requirePermission } from '@/lib/auth';
import { assertId, fromAction, param, toForm, v1, type RouteCtx } from '@/lib/v1';
import { deleteRow } from '@/app/(portal)/sheets/actions';

/** Remove a graduand row from a sheet that is still editable. */
export const DELETE = v1(async (_req: Request, ctx: RouteCtx) => {
  await requirePermission();
  const id = await param(ctx);
  const recordId = await param(ctx, 'recordId');
  assertId(id, 'Sheet');
  assertId(recordId, 'Row');
  return fromAction(await deleteRow(id, {}, toForm({ recordId })));
});
