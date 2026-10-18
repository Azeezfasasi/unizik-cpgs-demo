import 'server-only';
import { db } from './db';
import { rowFingerprint, snapshotRows } from './sheets';
import { renderSigningSheet } from './signing-sheet';
import { AcademicSession, Department, DigitizationBatch, GraduandRecord, Programme } from '@/models';
import type { ResultSheetDoc } from '@/models/ResultSheet';

type Sheet = Pick<ResultSheetDoc, '_id' | 'reference' | 'origin' | 'department' | 'programme' | 'session' | 'batch'>;

/**
 * The print-ready sheet for signing built from a sheet's rows: for online submissions the department
 * result sheet; for legacy sheets the taskforce's certified transcription. Null when it has no rows.
 */
export async function buildSigningSheet(sheet: Sheet) {
  await db();
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
  if (!records.length) return null;
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
  const filename = `${sheet.reference.replaceAll('/', '-')}-${sheet.origin === 'LEGACY' ? 'certified-transcription' : 'for-signing'}.pdf`;
  return { bytes, fingerprint, rows: records.length, filename };
}
