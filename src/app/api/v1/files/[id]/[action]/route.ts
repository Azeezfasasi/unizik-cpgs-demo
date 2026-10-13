import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { canOpenFile } from '@/lib/api';
import { audit } from '@/lib/audit';
import { signedViewUrl, storageDriver } from '@/lib/storage';
import { apiError, assertId, fromAction, json, param, v1, type RouteCtx } from '@/lib/v1';
import { verifyFile } from '@/app/(portal)/admin/files/actions';
import { StoredFile } from '@/models';

/**
 * GET /files/{id}/url       a 5-minute signed link to the file
 * GET /files/{id}/content   redirects (302) to that link, for direct download
 */
export const GET = v1(async (req: Request, ctx: RouteCtx) => {
  const user = await requirePermission();
  const id = await param(ctx);
  const action = await param(ctx, 'action');
  assertId(id, 'File');
  if (action !== 'url' && action !== 'content') return apiError(404, 'Unknown file resource');
  await db();
  const file = await StoredFile.findById(id).lean();
  if (!file || !(await canOpenFile(user, file))) return apiError(404, 'File not found');
  if (file.storage === 'local' && storageDriver() !== 'local') return apiError(410, 'This file is no longer available and must be re-uploaded');
  await audit(user, 'file.view', 'StoredFile', id, undefined, { name: file.originalName, via: 'api' });
  const link = new URL(signedViewUrl(file), req.url).toString();
  if (action === 'content') return Response.redirect(link, 302);
  return json({ data: { url: link, format: file.format ?? 'pdf', expiresIn: 300 } });
});

/** POST /files/{id}/verify  re-reads the file and compares its SHA-256 with the upload. */
export const POST = v1(async (_req: Request, ctx: RouteCtx) => {
  await requirePermission('files:manage');
  const id = await param(ctx);
  assertId(id, 'File');
  if ((await param(ctx, 'action')) !== 'verify') return apiError(404, 'Unknown file action');
  const res = await verifyFile(id);
  return res.ok ? json({ ok: true, data: { intact: true }, message: res.message }) : fromAction({ ...res, status: res.status ?? 409 });
});
