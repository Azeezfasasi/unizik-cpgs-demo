import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { saveLegacyRow } from '@/app/(portal)/sheets/actions';
import { ResultSheet } from '@/models';

type Course = { code?: string; title?: string; units?: number; score?: number; grade?: string };

/**
 * Add or update one graduand row on a legacy sheet (matched by matric number).
 * Body: { matricNo, surname, otherNames, sex?, cgpa?, classOfDegree, thesisTitle?, supervisor?,
 *         sourceFile?, sourcePage?, illegible?, remarks?, courses?: [{ code, title, units, score, grade }] }
 */
export const PUT = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission();
  const id = await param(ctx);
  assertId(id, 'Sheet');
  await db();
  if (!(await ResultSheet.exists({ _id: id }))) return apiError(404, 'Sheet not found');
  const { courses, ...row } = await readJson(req);
  const lines = Array.isArray(courses)
    ? (courses as Course[]).map((c) => [c.code, c.title, c.units, c.score, c.grade].map((x) => x ?? '').join(' | ')).join('\n')
    : '';
  return fromAction(await saveLegacyRow(id, {}, toForm({ ...row, courses: lines })));
});
