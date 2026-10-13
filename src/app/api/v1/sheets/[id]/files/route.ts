import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { storeUpload } from '@/lib/uploads';
import { apiError, assertId, fromAction, json, out, param, v1, type RouteCtx } from '@/lib/v1';
import { attachFile } from '@/app/(portal)/sheets/actions';
import { ResultSheet } from '@/models';

/**
 * Upload a scan and attach it to the sheet in one step. multipart/form-data with a "file" field
 * (PDF, JPG or PNG). Request bodies are limited to about 4 MB on the hosted service.
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  const user = await requirePermission('legacy:upload', 'submission:create');
  const id = await param(ctx);
  assertId(id, 'Sheet');
  await db();
  const sheet = await ResultSheet.findById(id).select('origin').lean();
  if (!sheet) return apiError(404, 'Sheet not found');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return apiError(400, 'Send the scan as multipart/form-data with a "file" field');
  const stored = await storeUpload(user, file, sheet.origin === 'LEGACY' ? 'LEGACY_SCAN' : 'SUBMISSION_SCAN', { sheetId: id });
  const res = await attachFile(id, stored.id);
  if (!res.ok) return fromAction(res);
  return json({ ok: true, message: 'Scan uploaded and attached.', data: out(stored.toObject()) }, 201);
});
