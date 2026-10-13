import 'server-only';
import type { Types } from 'mongoose';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { AuthError, type CurrentUser } from './auth';
import { NotFoundError, UserError } from './errors';
import { firstError } from './validators';
import { can } from './rbac';
import { canEdit, canView } from './sheet-access';
import { GraduandRecord, ResultSheet } from '@/models';
import type { StoredFileDoc } from '@/models/StoredFile';

/** Wraps a route handler so auth and validation failures become clean JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
      if (e instanceof UserError) return Response.json({ error: e.message }, { status: 400 });
      if (e instanceof ZodError) return Response.json({ error: firstError(e) }, { status: 400 });
      console.error('[api]', e);
      return Response.json({ error: 'Server error' }, { status: 500 });
    }
  };
}

/** Resolves where an upload belongs and checks the user may add files there. */
export async function uploadTarget(user: CurrentUser, purpose: string, scope: { sheetId?: string; recordId?: string }) {
  if (purpose === 'AMENDMENT_EVIDENCE') {
    if (!can(user.role, 'amendment:request')) throw new AuthError('You cannot upload amendment evidence');
    const rec = await GraduandRecord.findById(scope.recordId).populate<{ department: { _id: unknown; code: string } }>('department', 'code').lean();
    if (!rec) throw new NotFoundError('Record not found');
    return { departmentId: String(rec.department._id), folder: `crr/amendments/${rec.department.code}` };
  }
  if (purpose !== 'LEGACY_SCAN' && purpose !== 'SUBMISSION_SCAN') throw new UserError('Unknown upload purpose');
  const sheet = await ResultSheet.findById(scope.sheetId)
    .populate<{ department: { _id: unknown; code: string } }>('department', 'code')
    .populate<{ session: { label: string } }>('session', 'label').lean();
  if (!sheet) throw new NotFoundError('Sheet not found');
  if ((purpose === 'LEGACY_SCAN') !== (sheet.origin === 'LEGACY')) throw new UserError('Wrong upload type for this sheet');
  const ref = { status: sheet.status, origin: sheet.origin, batch: sheet.batch, department: sheet.department._id as Types.ObjectId };
  if (!(await canEdit(user, ref))) throw new AuthError('You cannot add files to this sheet');
  const origin = sheet.origin === 'LEGACY' ? 'legacy' : 'online';
  return {
    departmentId: String(sheet.department._id),
    folder: `crr/${origin}/${sheet.department.code}/${sheet.session.label.replace('/', '-')}/${sheet.reference.replaceAll('/', '-')}`,
  };
}

/** Whether the user may open a stored file. */
export async function canOpenFile(user: CurrentUser, file: Pick<StoredFileDoc, '_id' | 'purpose' | 'uploadedBy'>) {
  if (file.uploadedBy.equals(user.id)) return true;
  // Custodians of the file register (File storage page) may open any file.
  if (can(user.role, 'files:read')) return true;
  if (file.purpose === 'AMENDMENT_EVIDENCE') {
    return can(user.role, 'amendment:request') || can(user.role, 'amendment:approve') || can(user.role, 'audit:read');
  }
  const sheet = await ResultSheet.findOne({ files: file._id }).lean();
  return !!sheet && (await canView(user, sheet));
}
