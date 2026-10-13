import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, json, out, param, readJson, requireRead, toForm, v1, type RouteCtx } from '@/lib/v1';
import { requestAmendment } from '@/app/(portal)/amendments/actions';
import { Amendment, GraduandRecord } from '@/models';

/** Amendments requested for this record. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  await requireRead('amendment:request', 'amendment:approve', 'audit:read');
  const id = await param(ctx);
  assertId(id, 'Record');
  await db();
  const rows = await Amendment.find({ record: id }).sort({ createdAt: -1 })
    .populate('requestedBy', 'name').populate('decidedBy', 'name').lean();
  return json({ data: rows.map((a) => out(a)) });
});

/**
 * Request a correction to a locked record (Head of Records). Body: any of cgpa, classOfDegree,
 * thesisTitle, supervisor, senateApprovalDate, remarks, projectGrade, effectiveDate, boardMeeting; plus reason and evidence (a file id
 * uploaded with purpose AMENDMENT_EVIDENCE).
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('amendment:request');
  const id = await param(ctx);
  assertId(id, 'Record');
  await db();
  if (!(await GraduandRecord.exists({ _id: id }))) return apiError(404, 'Record not found');
  const res = await requestAmendment(id, {}, toForm(await readJson(req)));
  if (!res.ok) return fromAction(res);
  const a = await Amendment.findOne({ record: id, status: 'PENDING' }).lean();
  return json({ ok: true, message: res.message, data: a ? out(a) : null }, 201);
});
