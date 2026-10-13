import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { AuthError, requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { fail } from '@/lib/errors';
import { canView } from '@/lib/sheet-access';
import { buildCsvTemplate, buildTemplate } from '@/lib/template';
import { AcademicSession, Department, Programme, ResultSheet } from '@/models';

/**
 * The CRR result template for a sheet: Excel (default) or CSV (`?format=csv`).
 * Legacy sheets get the indexing variant with Source Page, Illegible and Remarks columns.
 */
export const GET = handle(async (req: Request) => {
  const user = await requirePermission('submission:create', 'legacy:upload');
  const url = new URL(req.url);
  const sheetId = url.searchParams.get('sheet') ?? '';
  if (!Types.ObjectId.isValid(sheetId)) fail('Missing sheet');
  await db();
  const sheet = await ResultSheet.findById(sheetId).lean();
  if (!sheet) fail('Sheet not found');
  if (!(await canView(user, sheet))) throw new AuthError('You cannot open this sheet');

  const [prog, session] = await Promise.all([Programme.findById(sheet.programme).lean(), AcademicSession.findById(sheet.session).lean()]);
  const legacy = sheet.origin === 'LEGACY';
  const base = `CRR-${legacy ? 'legacy' : 'results'}-${prog?.code ?? 'programme'}-${session?.label.replace('/', '-') ?? ''}`;

  if (url.searchParams.get('format') === 'csv') {
    return new Response(buildCsvTemplate({ legacy }), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${base}.csv"` },
    });
  }
  const dept = await Department.findById(sheet.department).lean();
  const buf = buildTemplate({ department: dept?.name ?? '', programme: prog?.name ?? '', session: session?.label ?? '' }, { legacy });
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${base}.xlsx"`,
    },
  });
});
