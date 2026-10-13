import { requirePermission } from '@/lib/auth';
import { assertId, fromAction, param, toForm, v1, type RouteCtx } from '@/lib/v1';
import { detachFile } from '@/app/(portal)/sheets/actions';

/** Detach a scan from an editable sheet (it then appears as unlinked on the File storage page). */
export const DELETE = v1(async (_req: Request, ctx: RouteCtx) => {
  await requirePermission();
  const id = await param(ctx);
  const fileId = await param(ctx, 'fileId');
  assertId(id, 'Sheet');
  assertId(fileId, 'File');
  return fromAction(await detachFile(id, {}, toForm({ fileId })));
});
