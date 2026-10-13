import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { canOpenFile } from '@/lib/api';
import { isLinked, linksFor } from '@/lib/files';
import { apiError, assertId, fromAction, json, out, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { deleteFile } from '@/app/(portal)/admin/files/actions';
import { StoredFile } from '@/models';

/** File details and what it is attached to. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  const user = await requirePermission();
  const id = await param(ctx);
  assertId(id, 'File');
  await db();
  const f = await StoredFile.findById(id).populate('uploadedBy', 'name').populate('department', 'name code').lean();
  if (!f || !(await canOpenFile(user, { _id: f._id, purpose: f.purpose, uploadedBy: (f.uploadedBy as unknown as { _id: never })._id }))) {
    return apiError(404, 'File not found');
  }
  const l = (await linksFor([f._id])).get(id)!;
  return json({ data: { ...out(f), attachedTo: l, linked: isLinked(l), contentUrl: `/api/v1/files/${id}/content` } });
});

/** Permanently delete an unlinked file (System Administrator). Body: { reason }. */
export const DELETE = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('files:delete');
  const id = await param(ctx);
  assertId(id, 'File');
  return fromAction(await deleteFile(id, {}, toForm(await readJson(req))));
});
