import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { assertInScope, requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { fail } from '@/lib/errors';
import { buildTemplate } from '@/lib/template';
import { AcademicSession, Department, Programme, ResultSheet } from '@/models';

/** The CRR result template (xlsx), labelled for the sheet it will be uploaded to. */
export const GET = handle(async (req: Request) => {
  const user = await requirePermission('submission:create');
  const sheetId = new URL(req.url).searchParams.get('sheet') ?? '';
  if (!Types.ObjectId.isValid(sheetId)) fail('Missing sheet');
  await db();
  const sheet = await ResultSheet.findById(sheetId).lean();
  if (!sheet) fail('Sheet not found');
  await assertInScope(user, sheet!.department);
  const [dept, prog, session] = await Promise.all([
    Department.findById(sheet!.department).lean(), Programme.findById(sheet!.programme).lean(), AcademicSession.findById(sheet!.session).lean(),
  ]);
  const buf = buildTemplate({ department: dept?.name ?? '', programme: prog?.name ?? '', session: session?.label ?? '' });
  const name = `CRR-results-${prog?.code ?? 'programme'}-${session?.label.replace('/', '-') ?? ''}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${name}"`,
    },
  });
});
