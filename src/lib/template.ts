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
/** Columns of the PG Board result list: semester GPAs, project grade, WEF date and board meeting. All optional. */
export const BOARD_COLUMNS = [
  'Sem 1 GPA', 'Sem 2 GPA', 'Sem 3 GPA', 'Sem 4 GPA', 'Project', 'Effective Date', 'Board Meeting',
] as const;
/** Extra columns for legacy indexing: where each row was read from, and doubtful rows. */
export const LEGACY_COLUMNS = ['Source Page', 'Illegible (Y/N)', 'Remarks'] as const;
export const COURSE_COLUMNS = ['Matric No', 'Course Code', 'Course Title', 'Units', 'Score', 'Grade'] as const;

type Column = (typeof GRADUAND_COLUMNS)[number] | (typeof BOARD_COLUMNS)[number] | (typeof LEGACY_COLUMNS)[number];
type TemplateOptions = { legacy?: boolean };

const headerFor = ({ legacy }: TemplateOptions) => [...GRADUAND_COLUMNS, ...BOARD_COLUMNS, ...(legacy ? LEGACY_COLUMNS : [])];

const EXAMPLE = ['2019247001', 'OKONKWO', 'Chiamaka Grace', 'F', 4.28, '', 'Adoption of improved cassava varieties in Anambra State', 'Prof. A. B. Example',
  3.90, 4.45, '', '', 5.00, '13/03/2021', '63rd'];
const EXAMPLE_LEGACY = [3, 'N', ''];

/** Header spellings accepted for each column, compared without case, spaces or punctuation. */
const ORD = ['1st', '2nd', '3rd', '4th'];
const ALIASES: Record<string, Column | 'IGNORE'> = {
  sn: 'IGNORE', serialno: 'IGNORE',
  matricno: 'Matric No', matricnumber: 'Matric No', regno: 'Matric No', registrationno: 'Matric No', registrationnumber: 'Matric No',
  surname: 'Surname', othernames: 'Other Names', sex: 'Sex (M/F)', sexmf: 'Sex (M/F)',
  cgpa: 'CGPA', fcgpa: 'CGPA', classofdegree: 'Class of Degree', class: 'Class of Degree',
  thesistitle: 'Thesis Title', thesis: 'Thesis Title', supervisor: 'Supervisor',
  project: 'Project', proj: 'Project', projectgrade: 'Project',
  effectivedate: 'Effective Date', effectivedateofgraduation: 'Effective Date', wef: 'Effective Date', effectivedateddmmyyyy: 'Effective Date',
  boardmeeting: 'Board Meeting',
  sourcepage: 'Source Page', illegible: 'Illegible (Y/N)', illegibleyn: 'Illegible (Y/N)', remarks: 'Remarks',
  ...Object.fromEntries([1, 2, 3, 4].flatMap((n) => {
    const col = `Sem ${n} GPA` as Column;
    const o = ORD[n - 1];
    return [`sem${n}gpa`, `sem${n}`, `semester${n}`, `${o}sem`, `${o}semester`, `${o}semgpa`, `${o}semestergpa`].map((k) => [k, col]);
  })),
};
const canon = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Two-sheet CRR result template (xlsx): one row per graduand, one row per course taken. */
export function buildTemplate(meta: { department: string; programme: string; session: string }, opts: TemplateOptions = {}) {
  const header = headerFor(opts);
  const wb = XLSX.utils.book_new();
  const g = XLSX.utils.aoa_to_sheet([header]);
  g['!cols'] = [14, 18, 24, 9, 7, 16, 50, 26, 10, 10, 10, 10, 8, 14, 14, ...(opts.legacy ? [11, 14, 30] : [])].map((wch) => ({ wch }));
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
    ['Do not rename sheets. Columns may be in any order; S/N is ignored.'],
    ['CGPA', 'Final CGPA (FCGPA) on a 5-point scale with two decimal places.'],
    ['Class of Degree', `Optional: left blank, it is worked out from the CGPA (PhD: Not applicable). If given, one of ${CLASS_OF_DEGREE.join(', ')}.`],
    ['Sem 1 GPA … Sem 4 GPA', 'Optional: the GPA for each semester, as on the PG Board result list. Fill them in order and leave unused semesters blank.'],
    ['Project', 'Optional: the project / dissertation grade point (0–5).'],
    ['Effective Date', 'Optional: effective date of graduation (WEF) as DD/MM/YYYY, e.g. 13/03/2014.'],
    ['Board Meeting', 'Optional: the PG Board meeting that considered the result, e.g. 63rd.'],
    ['Courses', 'Each course row repeats the Matric No of the graduand it belongs to. The Courses sheet is optional.'],
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

/**
 * Reads an effective date as YYYY-MM-DD: an Excel date cell, DD/MM/YYYY (with or without a
 * leading "WEF") or YYYY-MM-DD. Anything else is passed through for the validator to reject.
 */
function day(v: unknown) {
  if (v === '' || v == null) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : String(v);
  }
  const s = String(v).trim().replace(/^w\.?e\.?f\.?\s*/i, '');
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function readWorkbook(buf: ArrayBuffer, isCsv: boolean) {
  if (!isCsv) return XLSX.read(buf, { type: 'array' });
  // CSV: keep every cell as text so matric numbers keep leading zeros and never become 2.01E+09.
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return XLSX.read(text, { type: 'string', raw: true });
}

/** Maps each header cell to its column; reports unknown, repeated and missing columns. */
function readHeader(cells: unknown[], sheet: string) {
  const errors: CellError[] = [];
  const index = new Map<Column, number>();
  cells.forEach((cell, i) => {
    const label = str(cell);
    if (!label) return;
    const col = ALIASES[canon(label)];
    if (!col) {
      errors.push({ sheet, row: 1, column: label, message: `Unknown column "${label}". Use the headers from the template` });
    } else if (col !== 'IGNORE') {
      if (index.has(col)) errors.push({ sheet, row: 1, column: label, message: `Column "${col}" appears more than once` });
      else index.set(col, i);
    }
  });
  for (const col of ['Matric No', 'Surname', 'Other Names'] as const) {
    if (!index.has(col)) errors.push({ sheet, row: 1, column: col, message: `Column "${col}" is missing` });
  }
  if (!index.has('CGPA') && !index.has('Class of Degree')) {
    errors.push({ sheet, row: 1, column: 'CGPA', message: 'Add a "CGPA" (or "FCGPA") column' });
  }
  return { index, errors };
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

  const grid = XLSX.utils.sheet_to_json<unknown[]>(gs, { header: 1, defval: '' });
  const header = readHeader(grid[0] ?? [], gName);
  if (header.errors.length) return { rows: [], errors: header.errors };
  const cell = (r: unknown[], col: Column) => {
    const i = header.index.get(col);
    return i == null ? '' : r[i];
  };

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
    projectGrade: 'Project', effectiveDate: 'Effective Date', boardMeeting: 'Board Meeting',
    sourcePage: 'Source Page', illegible: 'Illegible (Y/N)', remarks: 'Remarks',
  };
  grid.slice(1).forEach((r, i) => {
    const excelRow = i + 2;
    if (r.every((v) => str(v) === '')) return;
    const matric = str(cell(r, 'Matric No')).toUpperCase();
    const flag = str(cell(r, 'Illegible (Y/N)')).toUpperCase();
    // Collected with the row's other problems, so one upload reports everything wrong with it.
    let rowBad = false;
    if (opts.legacy && flag && !['Y', 'N', 'YES', 'NO'].includes(flag)) {
      errors.push({ sheet: gName, row: excelRow, column: 'Illegible (Y/N)', message: 'Use Y or N' });
      rowBad = true;
    }
    const sems = ([1, 2, 3, 4] as const).map((n) => cell(r, `Sem ${n} GPA`));
    const lastSem = sems.findLastIndex((v) => str(v) !== '');
    const gap = sems.slice(0, lastSem + 1).findIndex((v) => str(v) === '');
    if (gap >= 0) {
      errors.push({ sheet: gName, row: excelRow, column: `Sem ${gap + 1} GPA`, message: 'Fill semester GPAs in order, with no gaps' });
      rowBad = true;
    }
    const candidate = {
      matricNo: matric, surname: str(cell(r, 'Surname')), otherNames: str(cell(r, 'Other Names')),
      sex: str(cell(r, 'Sex (M/F)')).toUpperCase() || undefined, cgpa: num(cell(r, 'CGPA')),
      classOfDegree: str(cell(r, 'Class of Degree')).toUpperCase().replace(/\s+/g, '_') || undefined,
      semesterGpas: gap >= 0 ? [] : sems.slice(0, lastSem + 1).map(num),
      projectGrade: num(cell(r, 'Project')), effectiveDate: day(cell(r, 'Effective Date')),
      boardMeeting: str(cell(r, 'Board Meeting')),
      thesisTitle: str(cell(r, 'Thesis Title')), supervisor: str(cell(r, 'Supervisor')),
      ...(opts.legacy ? {
        sourcePage: num(cell(r, 'Source Page')), illegible: flag === 'Y' || flag === 'YES', remarks: str(cell(r, 'Remarks')),
      } : {}),
      courses: coursesBy.get(matric) ?? [],
    };
    const p = GraduandRowSchema.safeParse(candidate);
    if (!p.success) {
      for (const iss of p.error.issues) {
        const key = String(iss.path[0] ?? '');
        const column = key === 'semesterGpas' ? `Sem ${Number(iss.path[1] ?? 0) + 1} GPA` : colFor[key] ?? key;
        errors.push({ sheet: gName, row: excelRow, column, message: iss.message });
      }
      return;
    }
    if (rowBad) return;
    if (seen.has(matric)) {
      errors.push({ sheet: gName, row: excelRow, column: 'Matric No', message: `${matric} appears more than once` });
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
