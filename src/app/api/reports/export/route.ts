import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle } from '@/lib/api';
import { audit } from '@/lib/audit';
import { findRecords, recordFilter, type RecordRow, type SearchParams } from '@/lib/search';
import { CLASS_LABELS, type ClassOfDegree } from '@/lib/grading';

const MAX_ROWS = 20000;

function csvCell(v: unknown) {
  let s = v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export of a record search. PROVOST and HEAD_RECORDS only; every export is audited. */
export const GET = handle(async (req: Request) => {
  const user = await requirePermission('record:export');
  const sp = Object.fromEntries(new URL(req.url).searchParams) as SearchParams;
  await db();
  const filter = await recordFilter(user, sp);
  const rows = await findRecords(filter).sort({ 'session': 1 }).limit(MAX_ROWS).lean<RecordRow[]>();
  await audit(user, 'record.export', 'GraduandRecord', undefined, undefined, { ...sp, rows: rows.length });

  const header = ['Matric No', 'Surname', 'Other Names', 'Sex', 'Degree', 'Department', 'Session', 'CGPA', 'Class of Degree', 'Thesis Title', 'Senate Approval', 'Origin', 'Locked', 'Version'];
  const lines = [header.join(',')].concat(rows.map((r) => [
    r.student.matricNo, r.student.surname, r.student.otherNames, r.student.sex, r.degree, r.department.name, r.session.label,
    r.cgpa?.toFixed(2), r.classOfDegree ? CLASS_LABELS[r.classOfDegree as ClassOfDegree] : '', r.thesisTitle,
    r.senateApprovalDate, r.origin, r.locked ? 'Yes' : 'No', r.version,
  ].map(csvCell).join(',')));

  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="crr-records-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
