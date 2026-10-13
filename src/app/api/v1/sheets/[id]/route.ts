import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { canEdit, canView } from '@/lib/sheet-access';
import { rowFingerprint, snapshotRows } from '@/lib/sheets';
import { FLOW, STATUS_LABELS, type FlowStage } from '@/lib/workflow';
import { apiError, assertId, json, out, param, v1, type RouteCtx } from '@/lib/v1';
import { GraduandRecord, ResultSheet, StoredFile } from '@/models';

/** A result sheet with its graduand rows, scans, approval history, next stage and row fingerprint. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  const user = await requirePermission();
  const id = await param(ctx);
  assertId(id, 'Sheet');
  await db();
  // Access is checked on the plain document, then the related names are loaded.
  const raw = await ResultSheet.findById(id).select('status origin department batch').lean();
  if (!raw || !(await canView(user, raw))) return apiError(404, 'Sheet not found');
  const sheet = (await ResultSheet.findById(id)
    .populate('department', 'name code').populate('programme', 'name code degreeType')
    .populate('session', 'label').populate('batch', 'boxCode').lean())!;
  const [records, files, snapshot] = await Promise.all([
    GraduandRecord.find({ sheet: id }).populate('student', 'matricNo surname otherNames sex').lean(),
    StoredFile.find({ _id: { $in: sheet.files } }).select('originalName format bytes pages sha256 purpose createdAt').lean(),
    snapshotRows(sheet._id),
  ]);
  const stage = FLOW[sheet.status as FlowStage];
  await audit(user, 'sheet.view', 'ResultSheet', id, undefined, { via: 'api' });
  const o = out(sheet);
  delete o.lastSubmittedRows;
  delete o.previousSubmittedRows;
  return json({
    data: {
      ...o,
      statusLabel: STATUS_LABELS[sheet.status as keyof typeof STATUS_LABELS],
      nextAction: stage ? { role: stage.role, label: stage.label } : null,
      editableByYou: await canEdit(user, raw),
      rowFingerprint: records.length ? rowFingerprint(snapshot) : null,
      files: files.map((f) => out(f)),
      graduands: records.map((r) => out(r)),
    },
  });
});
