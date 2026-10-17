import { requirePermission } from '@/lib/auth';
import { apiError, fromAction, v1 } from '@/lib/v1';
import { importStructure } from '@/app/(portal)/admin/actions';

/**
 * POST /structure/import  multipart: file (.xlsx or .csv), mode=check|import
 * Bulk-adds faculties, departments and programmes from the structure template.
 */
export const POST = v1(async (req: Request) => {
  await requirePermission('structure:manage');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return apiError(400, 'Send the template as multipart/form-data with a "file" field');
  const mode = form?.get('mode') === 'check' ? 'check' : 'import';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('mode', mode);
  const res = await importStructure({}, fd);
  return fromAction(res, mode === 'import' && res.ok && /^Added /.test(res.message ?? '') ? 201 : 200);
});
