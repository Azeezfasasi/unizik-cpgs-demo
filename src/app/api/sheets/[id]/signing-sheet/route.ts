import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { AuthError, requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canView } from '@/lib/sheet-access';
import { buildSigningSheet } from '@/lib/signing-pdf';
import { ResultSheet } from '@/models';

/**
 * Print-ready sheet built from a sheet's rows: for online submissions the department result sheet to sign
 * and stamp; for legacy sheets the taskforce's certified transcription of the archived original.
 */
export const GET = handle(async (_req: Request, ctx: RouteContext<'/api/sheets/[id]/signing-sheet'>) => {
  const user = await requirePermission();
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return Response.json({ error: 'Not found' }, { status: 404 });
  await db();
  const sheet = await ResultSheet.findById(id).lean();
  if (!sheet) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!(await canView(user, sheet))) throw new AuthError('You cannot open this sheet');

  const doc = await buildSigningSheet(sheet);
  if (!doc) return Response.json({ error: 'Add graduand rows first; the sheet is built from them.' }, { status: 400 });
  await audit(user, 'sheet.signing_sheet', 'ResultSheet', id, undefined, { fingerprint: doc.fingerprint, rows: doc.rows });

  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
});
