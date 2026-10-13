import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { AuthError, requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canView } from '@/lib/sheet-access';
import { rowFingerprint, snapshotRows } from '@/lib/sheets';
import { renderSigningSheet } from '@/lib/signing-sheet';
import { AcademicSession, Department, DigitizationBatch, GraduandRecord, Programme, ResultSheet } from '@/models';

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

  const [dept, prog, session, records, snapshot, box] = await Promise.all([
    Department.findById(sheet.department).populate<{ faculty: { name: string } }>('faculty', 'name').lean(),
    Programme.findById(sheet.programme).lean(),
    AcademicSession.findById(sheet.session).lean(),
    GraduandRecord.find({ sheet: sheet._id })
      .populate<{ student: { matricNo: string; surname: string; otherNames: string; sex?: string } }>('student', 'matricNo surname otherNames sex')
      .lean(),
    snapshotRows(sheet._id),
    sheet.batch ? DigitizationBatch.findById(sheet.batch).select('boxCode').lean() : null,
  ]);
  if (!records.length) return Response.json({ error: 'Add graduand rows first; the sheet is built from them.' }, { status: 400 });
  records.sort((a, b) => a.student.matricNo.localeCompare(b.student.matricNo));

  const fingerprint = rowFingerprint(snapshot);
  const bytes = await renderSigningSheet({
    kind: sheet.origin === 'LEGACY' ? 'LEGACY' : 'ONLINE', boxCode: box?.boxCode,
    reference: sheet.reference, fingerprint, generatedAt: new Date(),
    faculty: dept?.faculty?.name ?? '', department: dept?.name ?? '', programme: prog?.name ?? '', session: session?.label ?? '',
    rows: records.map((r) => ({
      matricNo: r.student.matricNo, name: `${r.student.surname.toUpperCase()}, ${r.student.otherNames}`, sex: r.student.sex,
      cgpa: r.cgpa, classOfDegree: r.classOfDegree, thesisTitle: r.thesisTitle,
      semesterGpas: r.semesterGpas, projectGrade: r.projectGrade, effectiveDate: r.effectiveDate, boardMeeting: r.boardMeeting,
    })),
  });
  await audit(user, 'sheet.signing_sheet', 'ResultSheet', id, undefined, { fingerprint, rows: records.length });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${sheet.reference.replaceAll('/', '-')}-${sheet.origin === 'LEGACY' ? 'certified-transcription' : 'for-signing'}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});
