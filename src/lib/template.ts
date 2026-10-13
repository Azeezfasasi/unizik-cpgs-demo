import 'server-only';
import * as XLSX from 'xlsx';
import { CourseSchema, GraduandRowSchema, type GraduandRow } from './validators';
import { CLASS_OF_DEGREE } from './grading';
import type { CellError } from './action-state';

export type { CellError };

export const GRADUAND_COLUMNS = [
  'Matric No', 'Surname', 'Other Names', 'Sex (M/F)', 'CGPA', 'Class of Degree',
  'Thesis Title', 'Supervisor',
] as const;
/** Extra columns for legacy indexing: where each row was read from, and doubtful rows. */
export const LEGACY_COLUMNS = ['Source Page', 'Illegible (Y/N)', 'Remarks'] as const;
export const COURSE_COLUMNS = ['Matric No', 'Course Code', 'Course Title', 'Units', 'Score', 'Grade'] as const;

type TemplateOptions = { legacy?: boolean };

const headerFor = ({ legacy }: TemplateOptions) => [...GRADUAND_COLUMNS, ...(legacy ? LEGACY_COLUMNS : [])];

const EXAMPLE = ['2019247001', 'OKONKWO', 'Chiamaka Grace', 'F', 4.62, 'DISTINCTION', 'Adoption of improved cassava varieties in Anambra State', 'Prof. A. B. Example'];
const EXAMPLE_LEGACY = [3, 'N', ''];

/** Two-sheet CRR result template (xlsx): one row per graduand, one row per course taken. */
export function buildTemplate(meta: { department: string; programme: string; session: string }, opts: TemplateOptions = {}) {
  const header = headerFor(opts);
  const wb = XLSX.utils.book_new();
  const g = XLSX.utils.aoa_to_sheet([header]);
  g['!cols'] = [14, 18, 24, 9, 7, 16, 50, 26, ...(opts.legacy ? [11, 14, 30] : [])].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, g, 'Graduands');

  const c = XLSX.utils.aoa_to_sheet([[...COURSE_COLUMNS]]);
  c['!cols'] = [14, 12, 40, 7, 7, 7].map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, c, 'Courses');

  const info = XLSX.utils.aoa_to_sheet([
    [opts.legacy ? 'CPGS Results Repository: legacy indexing template' : 'CPGS Results Repository: final result template'],
    ['Department', meta.department],
    ['Programme', meta.programme],
    ['Session', meta.session],
    [],
    ['Rules'],
    ['Do not rename sheets or column headers.'],
    ['Class of Degree must be one of', CLASS_OF_DEGREE.join(', ')],
    ['CGPA is on a 5-point scale with two decimal places.'],
    ['Each course row repeats the Matric No of the graduand it belongs to. The Courses sheet is optional.'],
    ...(opts.legacy
      ? [
          ['Source Page', 'Page of the scanned result sheet the row was read from (optional).'],
          ['Illegible (Y/N)', 'Y when part of the row cannot be read; the Head of Records reviews it instead of a guess.'],
          ['Re-importing', 'Rows with a matric number already on the sheet are updated; nothing is deleted.'],
        ]
      : [['Attach the signed and stamped result sheet scan (PDF) when you submit; it remains the legal source.']]),
    [],
    ['Example Graduands row'],
    header,
    [...EXAMPLE, ...(opts.legacy ? EXAMPLE_LEGACY : [])],
    [],
    ['Example Courses rows'],
    [...COURSE_COLUMNS],
    ['2019247001', 'AEX801', 'Research Methods', 3, 72, 'A'],
    ['2019247001', 'AEX802', 'Extension Communication', 3, 65, 'B'],
  ]);
  info['!cols'] = [{ wch: 34 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, info, 'Instructions');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Single-sheet CSV template (graduand rows only; courses need the Excel template). */
export function buildCsvTemplate(opts: TemplateOptions = {}) {
  const sheet = XLSX.utils.aoa_to_sheet([headerFor(opts)]);
  return '﻿' + XLSX.utils.sheet_to_csv(sheet) + '\r\n';
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => (v === '' || v == null ? undefined : Number(v));

function readWorkbook(buf: ArrayBuffer, isCsv: boolean) {
  if (!isCsv) return XLSX.read(buf, { type: 'array' });
  // CSV: keep every cell as text so matric numbers keep leading zeros and never become 2.01E+09.
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return XLSX.read(text, { type: 'string', raw: true });
}

/**
 * Parses a filled template (Excel with Graduands/Courses sheets, or a single-sheet CSV).
 * Row numbers in errors match what the user sees in Excel.
 */
export function parseTemplate(buf: ArrayBuffer, opts: { fileName?: string; legacy?: boolean } = {}): { rows: GraduandRow[]; errors: CellError[] } {
  const errors: CellError[] = [];
  const isCsv = /\.csv$/i.test(opts.fileName ?? '');
  let wb: XLSX.WorkBook;
  try {
    wb = readWorkbook(buf, isCsv);
  } catch {
    return { rows: [], errors: [{ sheet: '-', row: 0, column: '-', message: `File is not a readable ${isCsv ? 'CSV file' : 'Excel workbook'}` }] };
  }
  const gName = isCsv ? 'CSV' : 'Graduands';
  const gs = isCsv ? wb.Sheets[wb.SheetNames[0]] : wb.Sheets['Graduands'];
  const cs = isCsv ? undefined : wb.Sheets['Courses'];
  if (!gs) return { rows: [], errors: [{ sheet: 'Graduands', row: 0, column: '-', message: 'Sheet "Graduands" is missing' }] };

  const header = (XLSX.utils.sheet_to_json<string[]>(gs, { header: 1 })[0] ?? []).map(str);
  GRADUAND_COLUMNS.forEach((col, i) => {
    if (header[i] !== col) errors.push({ sheet: gName, row: 1, column: col, message: `Expected header "${col}" in column ${i + 1}` });
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
    sourcePage: 'Source Page', illegible: 'Illegible (Y/N)', remarks: 'Remarks',
  };
  const allColumns = [...GRADUAND_COLUMNS, ...(opts.legacy ? LEGACY_COLUMNS : [])];
  raw.forEach((r, i) => {
    if (allColumns.every((c) => str(r[c]) === '')) return;
    const matric = str(r['Matric No']).toUpperCase();
    const flag = str(r['Illegible (Y/N)']).toUpperCase();
    // Collected with the row's other problems, so one upload reports everything wrong with it.
    const badFlag = opts.legacy && !!flag && !['Y', 'N', 'YES', 'NO'].includes(flag);
    if (badFlag) errors.push({ sheet: gName, row: i + 2, column: 'Illegible (Y/N)', message: 'Use Y or N' });
    const candidate = {
      matricNo: matric, surname: str(r['Surname']), otherNames: str(r['Other Names']),
      sex: str(r['Sex (M/F)']).toUpperCase() || undefined, cgpa: num(r['CGPA']),
      classOfDegree: str(r['Class of Degree']).toUpperCase().replace(/\s+/g, '_'),
      thesisTitle: str(r['Thesis Title']), supervisor: str(r['Supervisor']),
      ...(opts.legacy ? {
        sourcePage: num(r['Source Page']), illegible: flag === 'Y' || flag === 'YES', remarks: str(r['Remarks']),
      } : {}),
      courses: coursesBy.get(matric) ?? [],
    };
    const p = GraduandRowSchema.safeParse(candidate);
    if (!p.success) {
      for (const iss of p.error.issues) {
        const key = String(iss.path[0] ?? '');
        errors.push({ sheet: gName, row: i + 2, column: colFor[key] ?? key, message: iss.message });
      }
      return;
    }
    if (badFlag) return;
    if (seen.has(matric)) {
      errors.push({ sheet: gName, row: i + 2, column: 'Matric No', message: `${matric} appears more than once` });
      return;
    }
    seen.add(matric);
    rows.push(p.data);
  });

  for (const m of coursesBy.keys()) {
    if (!seen.has(m) && !errors.some((e) => e.sheet === gName)) {
      errors.push({ sheet: 'Courses', row: 0, column: 'Matric No', message: `Courses listed for ${m}, who is not on the Graduands sheet` });
    }
  }
  if (!rows.length && !errors.length) {
    errors.push({ sheet: gName, row: 2, column: '-', message: 'No graduand rows found' });
  }
  return { rows, errors };
}
