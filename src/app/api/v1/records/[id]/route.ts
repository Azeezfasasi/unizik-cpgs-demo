import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { scopedDepartmentIds } from '@/lib/auth';
import { apiError, assertId, json, out, param, requireRead, v1, type RouteCtx } from '@/lib/v1';
import { GraduandRecord } from '@/models';

/** One graduand record with courses, source sheet and earlier versions. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  const user = await requireRead('record:read');
  const id = await param(ctx);
  assertId(id, 'Record');
  await db();
  const r = await GraduandRecord.findById(id)
    .populate('student', 'matricNo surname otherNames sex')
    .populate({ path: 'department', select: 'name code faculty', populate: { path: 'faculty', select: 'name code' } })
    .populate('programme', 'name code degreeType').populate('session', 'label startYear')
    .populate('sheet', 'reference status origin').lean<{ department: { _id: { equals(x: unknown): boolean } } }>();
  if (!r) return apiError(404, 'Record not found');
  const scope = await scopedDepartmentIds(user);
  if (scope && !scope.some((d) => r.department._id.equals(d))) return apiError(404, 'Record not found');
  await audit(user, 'record.view', 'GraduandRecord', id, undefined, { via: 'api' });
  return json({ data: out(r) });
});
