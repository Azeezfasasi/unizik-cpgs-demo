import 'server-only';
import { assertInScope, type CurrentUser } from './auth';
import { fail } from './errors';
import { isEditable } from './workflow';
import { DigitizationBatch } from '@/models';
import type { ResultSheetDoc } from '@/models/ResultSheet';

type SheetRef = Pick<ResultSheetDoc, 'status' | 'origin' | 'department' | 'batch'>;

/** Who may change the rows and files of a sheet in its current state. */
export async function assertCanEdit(user: CurrentUser, sheet: SheetRef) {
  if (!isEditable(sheet.status)) fail('This sheet can no longer be edited');
  if (sheet.origin === 'ONLINE') {
    if (user.role !== 'DEPT_OFFICER') fail('Only the department PG coordinator can edit this sheet');
    await assertInScope(user, sheet.department);
    return;
  }
  if (user.role === 'TASKFORCE_LEAD') return;
  const batch = sheet.batch ? await DigitizationBatch.findById(sheet.batch).lean() : null;
  if (user.role !== 'INDEXER' || !batch?.indexer?.equals(user.id)) fail('Only the indexer assigned to this box can edit this sheet');
}

export async function canEdit(user: CurrentUser, sheet: SheetRef) {
  try {
    await assertCanEdit(user, sheet);
    return true;
  } catch {
    return false;
  }
}

/** Who may view a sheet: scoped readers, plus taskforce members on the sheet's box. */
export async function canView(user: CurrentUser, sheet: SheetRef & { createdBy?: unknown }) {
  if (['SUPER_ADMIN', 'PROVOST', 'HEAD_RECORDS', 'TASKFORCE_LEAD', 'AUDITOR'].includes(user.role)) return true;
  if (['DEPT_OFFICER', 'HOD', 'FACULTY_PG'].includes(user.role)) {
    try { await assertInScope(user, sheet.department); return true; } catch { return false; }
  }
  if (sheet.origin === 'LEGACY' && sheet.batch) {
    const b = await DigitizationBatch.findById(sheet.batch).select('indexer reviewer').lean();
    return !!(b?.indexer?.equals(user.id) || b?.reviewer?.equals(user.id));
  }
  return false;
}
