import 'server-only';
import * as XLSX from 'xlsx';
import { CourseSchema, GraduandRowSchema, type GraduandRow } from './validators';
import { CLASS_OF_DEGREE } from './grading';

export const GRADUAND_COLUMNS = [
  'Matric No', 'Surname', 'Other Names', 'Sex (M/F)', 'CGPA', 'Class of Degree',
  'Thesis Title', 'Supervisor',
] as const;
export const COURSE_COLUMNS = ['Matric No', 'Course Code', 'Course Title', 'Units', 'Score', 'Grade'] as const;

/** Two-sheet CRR result template: one row per graduand, one row per course taken. */
export function buildTemplate(meta: { department: string; programme: string; session: string }) {
  const wb = XLSX.utils.book_new();
  const g = XLSX.utils.aoa_to_sheet([[...GRADUAND_COLUMNS]]);
  g['!cols'] = [14, 18, 24, 9, 7, 16, 50, 26].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, g, 'Graduands');

  const c = XLSX.utils.aoa_to_sheet([[...COURSE_COLUMNS]]);
  c['!cols'] = [14, 12, 40, 7, 7, 7].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, c, 'Courses');

  const info = XLSX.utils.aoa_to_sheet([
    ['CPGS Results Repository: final result template'],
    ['Department', meta.department],
    ['Programme', meta.programme],
    ['Session', meta.session],
    [],
    ['Rules'],
    ['Do not rename sheets or column headers.'],
    ['Class of Degree must be one of', CLASS_OF_DEGREE.join(', ')],
    ['CGPA is on a 5-point scale with two decimal places.'],
    ['Each course row repeats the Matric No of the graduand it belongs to.'],
    ['Attach the signed and stamped result sheet scan (PDF) when you submit; it remains the legal source.'],
    [],
    ['Example Graduands row'],
    [...GRADUAND_COLUMNS],
    ['2019247001', 'OKONKWO', 'Chiamaka Grace', 'F', 4.62, 'DISTINCTION', 'Adoption of improved cassava varieties in Anambra State', 'Prof. A. B. Example'],
    [],
    ['Example Courses rows'],
    [...COURSE_COLUMNS],
    ['2019247001', 'AEX801', 'Research Methods', 3, 72, 'A'],
    ['2019247001', 'AEX802', 'Extension Communication', 3, 65, 'B'],
  ]);
  info['!cols'] = [{ wch: 34 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, info, 'Instructions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

import type { CellError } from './action-state';
export type { CellError };

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => (v === '' || v == null ? undefined : Number(v));

/** Parses a filled template. Row numbers in errors match what the user sees in Excel. */
export function parseTemplate(buf: ArrayBuffer): { rows: GraduandRow[]; errors: CellError[] } {
  const errors: CellError[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    return { rows: [], errors: [{ sheet: '-', row: 0, column: '-', message: 'File is not a readable Excel workbook' }] };
  }
  const gs = wb.Sheets['Graduands'], cs = wb.Sheets['Courses'];
  if (!gs) return { rows: [], errors: [{ sheet: 'Graduands', row: 0, column: '-', message: 'Sheet "Graduands" is missing' }] };

  const header = (XLSX.utils.sheet_to_json<string[]>(gs, { header: 1 })[0] ?? []).map(str);
  GRADUAND_COLUMNS.forEach((col, i) => {
    if (header[i] !== col) errors.push({ sheet: 'Graduands', row: 1, column: col, message: `Expected header "${col}"` });
  });
  if (errors.length) return { rows: [], errors };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(gs, { defval: '' });
  const courseRaw = cs ? XLSX.utils.sheet_to_json<Record<string, unknown>>(cs, { defval: '' }) : [];

  const coursesBy = new Map<string, GraduandRow['courses']>();
  courseRaw.forEach((r, i) => {
    const matric = str(r['Matric No']).toUpperCase();
    if (!matric && !str(r['Course Code'])) return;
    const c = { code: str(r['Course Code']), title: str(r['Course Title']), units: num(r['Units']), score: num(r['Score']), grade: str(r['Grade']) || undefined };
    const p = CourseSchema.safeParse(c);
    if (!p.success) {
      for (const iss of p.error.issues) {
        errors.push({ sheet: 'Courses', row: i + 2, column: String(iss.path[0] ?? '-'), message: iss.message });
      }
      return;
    }
    coursesBy.set(matric, [...(coursesBy.get(matric) ?? []), p.data]);
  });

  const rows: GraduandRow[] = [];
  const seen = new Set<string>();
  const colFor: Record<string, string> = {
    matricNo: 'Matric No', surname: 'Surname', otherNames: 'Other Names', sex: 'Sex (M/F)', cgpa: 'CGPA',
    classOfDegree: 'Class of Degree', thesisTitle: 'Thesis Title', supervisor: 'Supervisor',
  };
  raw.forEach((r, i) => {
    if (GRADUAND_COLUMNS.every((c) => str(r[c]) === '')) return;
    const matric = str(r['Matric No']).toUpperCase();
    const candidate = {
      matricNo: matric, surname: str(r['Surname']), otherNames: str(r['Other Names']),
      sex: str(r['Sex (M/F)']).toUpperCase() || undefined, cgpa: num(r['CGPA']),
      classOfDegree: str(r['Class of Degree']).toUpperCase().replace(/\s+/g, '_'),
      thesisTitle: str(r['Thesis Title']), supervisor: str(r['Supervisor']),
      courses: coursesBy.get(matric) ?? [],
    };
    const p = GraduandRowSchema.safeParse(candidate);
    if (!p.success) {
      for (const iss of p.error.issues) {
        const key = String(iss.path[0] ?? '');
        errors.push({ sheet: 'Graduands', row: i + 2, column: colFor[key] ?? key, message: iss.message });
      }
      return;
    }
    if (seen.has(matric)) {
      errors.push({ sheet: 'Graduands', row: i + 2, column: 'Matric No', message: `${matric} appears more than once` });
      return;
    }
    seen.add(matric);
    rows.push(p.data);
  });

  for (const m of coursesBy.keys()) {
    if (!seen.has(m) && !errors.some((e) => e.sheet === 'Graduands')) {
      errors.push({ sheet: 'Courses', row: 0, column: 'Matric No', message: `Courses listed for ${m}, who is not on the Graduands sheet` });
    }
  }
  if (!rows.length && !errors.length) {
    errors.push({ sheet: 'Graduands', row: 2, column: '-', message: 'No graduand rows found' });
  }
  return { rows, errors };
}
