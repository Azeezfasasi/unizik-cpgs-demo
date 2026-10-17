import 'server-only';
import * as XLSX from 'xlsx';
import { Types } from 'mongoose';
import { Department, Faculty, Programme } from '@/models';
import { DEGREE_TYPES } from '@/models/Programme';
import { GraduandRowSchema, type GraduandRow } from './validators';
import type { CellError } from './action-state';

/**
 * Reads a PG Board result list ("Final postgraduate results for the 58th Board meeting…") as the
 * CPGS keeps it in Excel: title rows, then a header row (S/N, NAME/REG. NO., FACULTY, DEPARTMENT,
 * PROG., 1ST–4TH SEM., PROJECT, FCGPA, EFFECTIVE DATE OF GRADUATION, AREA OF SPECIALIZATION).
 * Header rows may repeat with a different column layout further down; each one re-maps the columns.
 */

type Field = 'sn' | 'nameReg' | 'name' | 'reg' | 'faculty' | 'department' | 'degree' | 'sem1' | 'sem2' | 'sem3' | 'sem4'
  | 'project' | 'fcgpa' | 'wef' | 'specialization' | 'sex' | 'session';

const canon = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function fieldFor(header: string): Field | null {
  const c = canon(header);
  if (!c) return null;
  if (c === 'sn' || c === 'serialno' || c === 'sno') return 'sn';
  if (c.includes('name') && (c.includes('reg') || c.includes('matric'))) return 'nameReg';
  if (c === 'name' || c === 'names' || c === 'fullname' || c === 'nameofstudent') return 'name';
  if (c.startsWith('regno') || c.startsWith('matric') || c === 'registrationnumber') return 'reg';
  if (c.startsWith('faculty')) return 'faculty';
  if (c.startsWith('department') || c === 'dept') return 'department';
  if (c.startsWith('prog') || c === 'degree') return 'degree';
  const sem = c.match(/^(1st|2nd|3rd|4th|first|second|third|fourth)sem/) ?? c.match(/^sem(?:ester)?([1-4])/);
  if (sem) {
    const n = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, first: 1, second: 2, third: 3, fourth: 4 }[sem[1]] ?? Number(sem[1]);
    return `sem${n}` as Field;
  }
  if (c.startsWith('proj')) return 'project';
  if (c === 'fcgpa' || c === 'cgpa' || c === 'finalcgpa') return 'fcgpa';
  if (c.startsWith('effectivedate') || c.startsWith('wef') || c.startsWith('dateofgraduation')) return 'wef';
  if (c.includes('speciali')) return 'specialization';
  if (c === 'sex' || c === 'gender') return 'sex';
  if (c === 'session') return 'session';
  return null;
}

const str = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/** dd/mm/yy, dd/mm/yyyy, "WEF 13/03/2014" or an Excel date → YYYY-MM-DD (two-digit years are 20yy). */
function day(v: unknown) {
  if (v === '' || v == null) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : String(v);
  }
  const s = String(v).trim().replace(/^w\.?e\.?f\.?\s*/i, '');
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!m) return s;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const num = (v: unknown) => (str(v) === '' ? undefined : str(v));

/** "ORAEGBUNAM,KENNETH IKENGA EMEKA 2009397001P" → surname, other names and reg. number. */
function splitNameReg(text: string) {
  const m = text.match(/^(.*?)[\s,]*\b(\d{6,}[A-Z]{0,3})\s*$/i);
  const namePart = (m ? m[1] : text).trim();
  const reg = m ? m[2].toUpperCase() : '';
  const [surname, ...rest] = namePart.includes(',') ? namePart.split(',') : namePart.split(' ');
  return { surname: surname.trim().toUpperCase(), otherNames: rest.join(namePart.includes(',') ? ',' : ' ').trim(), reg };
}

export type BoardRow = {
  line: number;
  facultyText: string; departmentText: string; degreeText: string; sessionText: string;
  row: GraduandRow;
};

/** Parses the board list; rows are validated as graduand rows (class of degree comes from FCGPA). */
export function parseBoardList(buf: ArrayBuffer, fileName: string) {
  const errors: CellError[] = [];
  const isCsv = /\.csv$/i.test(fileName);
  let wb: XLSX.WorkBook;
  try {
    wb = isCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(buf, { type: 'array' });
  } catch {
    return { meeting: undefined, rows: [], errors: [{ sheet: '-', row: 0, column: '-', message: 'File is not a readable Excel or CSV file' }] };
  }
  const sheetName = wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: true });

  let meeting: string | undefined;
  let map: Map<Field, number> | null = null;
  const rows: BoardRow[] = [];
  const seen = new Map<string, number>();

  grid.forEach((cells, i) => {
    const line = i + 1;
    const texts = cells.map(str);
    const joined = texts.join(' ');
    if (!meeting) {
      const m = joined.match(/\b(\d{1,3})\s*(ST|ND|RD|TH)\b[^A-Z0-9]*(?:PG\s*)?BOARD/i);
      if (m) meeting = `${m[1]}${m[2].toLowerCase()}`;
    }
    // A header row: it names the person column and the faculty or department column.
    const fields = texts.map(fieldFor);
    if ((fields.includes('nameReg') || fields.includes('name')) && (fields.includes('department') || fields.includes('faculty'))) {
      map = new Map();
      fields.forEach((f, ci) => { if (f && !map!.has(f)) map!.set(f, ci); });
      return;
    }
    if (!map || texts.every((t) => !t)) return;
    const get = (f: Field) => (map!.has(f) ? cells[map!.get(f)!] : '');
    const nameText = str(get(map.has('nameReg') ? 'nameReg' : 'name'));
    if (!nameText) return; // continuation or spacer row
    const err = (column: string, message: string) => errors.push({ sheet: 'Board list', row: line, column, message });

    const parsed = splitNameReg(nameText);
    const reg = map.has('reg') ? str(get('reg')).toUpperCase() : parsed.reg;
    if (!reg) { err('NAME/REG. NO.', `No registration number found in "${nameText}"`); return; }
    if (seen.has(reg)) { err('NAME/REG. NO.', `${reg} appears more than once (row ${seen.get(reg)})`); return; }
    seen.set(reg, line);

    const sems = (['sem1', 'sem2', 'sem3', 'sem4'] as const).map((f) => num(get(f)));
    const last = sems.findLastIndex((v) => v !== undefined);
    const candidate = {
      matricNo: reg, surname: parsed.surname, otherNames: parsed.otherNames || '-',
      sex: str(get('sex')).toUpperCase().slice(0, 1) || undefined,
      cgpa: num(get('fcgpa')),
      semesterGpas: sems.slice(0, last + 1).map((v) => v ?? '0'),
      projectGrade: num(get('project')),
      effectiveDate: day(get('wef')),
      boardMeeting: meeting,
      remarks: str(get('specialization')) ? `Area of specialization: ${str(get('specialization'))}` : undefined,
      courses: [],
    };
    if (sems.slice(0, last + 1).some((v) => v === undefined)) {
      err('Semester GPAs', 'A semester GPA is blank between filled ones');
      return;
    }
    const p = GraduandRowSchema.safeParse(candidate);
    if (!p.success) {
      for (const iss of p.error.issues) {
        const key = String(iss.path[0] ?? '');
        const column = ({ cgpa: 'FCGPA', projectGrade: 'PROJECT', effectiveDate: 'EFFECTIVE DATE', semesterGpas: 'Semester GPAs', sex: 'SEX', surname: 'NAME/REG. NO.', otherNames: 'NAME/REG. NO.' } as Record<string, string>)[key] ?? key;
        err(column, iss.message);
      }
      return;
    }
    rows.push({
      line,
      facultyText: str(get('faculty')), departmentText: str(get('department')),
      degreeText: str(get('degree')), sessionText: str(get('session')),
      row: p.data,
    });
  });
  if (!map) errors.push({ sheet: sheetName, row: 0, column: '-', message: 'No header row found (one with NAME/REG. NO. and FACULTY or DEPARTMENT)' });
  else if (!rows.length && !errors.length) errors.push({ sheet: sheetName, row: 0, column: '-', message: 'No graduand rows found' });
  return { meeting, rows, errors };
}

/** Name key that ignores case, punctuation, "Faculty/Department of", "&" vs "and" and plural endings. */
function nameKey(s: string) {
  return s.toUpperCase().replace(/&/g, ' AND ').replace(/\b(FACULTY|DEPARTMENT|DEPT|SCHOOL)\s+OF\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/S$/, '') : w)).join(' ');
}

const DEGREE_ALIASES: Record<string, (typeof DEGREE_TYPES)[number]> = { MENG: 'MSc', MTECH: 'MSc', MARCH: 'MSc', MPH: 'MSc', MPA: 'MSc', PHD: 'PhD', DPHIL: 'PhD' };
function degreeOf(text: string) {
  const k = text.replace(/[.\s]/g, '').toUpperCase();
  return DEGREE_TYPES.find((d) => d.toUpperCase() === k) ?? DEGREE_ALIASES[k] ?? null;
}

export type BoardTarget = { departmentId: Types.ObjectId; programmeId: Types.ObjectId; programmeName: string; degreeType: string };

/**
 * Matches each row's department (by name, using the faculty when two departments share a name)
 * and its programme (the department's only programme of that degree type, or the one named
 * like the area of specialization). Unknown or ambiguous ones are listed once each.
 */
export async function resolveBoardRows(rows: BoardRow[], allowedDepartments: Types.ObjectId[] | null) {
  const errors: CellError[] = [];
  const [faculties, departments, programmes] = await Promise.all([
    Faculty.find().lean(),
    Department.find(allowedDepartments ? { _id: { $in: allowedDepartments } } : {}).lean(),
    Programme.find().lean(),
  ]);
  const facKey = new Map(faculties.map((f) => [String(f._id), nameKey(f.name)]));
  const byKey = new Map<string, typeof departments>();
  for (const d of departments) for (const k of [nameKey(d.name), d.code.toUpperCase()]) byKey.set(k, [...(byKey.get(k) ?? []), d]);

  const targets = new Map<number, BoardTarget>();
  const reported = new Set<string>();
  const once = (key: string, e: CellError) => { if (!reported.has(key)) { reported.add(key); errors.push(e); } };

  for (const r of rows) {
    const dText = r.departmentText || r.facultyText;
    let cands = byKey.get(nameKey(dText)) ?? byKey.get(dText.toUpperCase()) ?? [];
    if (cands.length > 1 && r.facultyText) cands = cands.filter((d) => facKey.get(String(d.faculty)) === nameKey(r.facultyText));
    if (cands.length !== 1) {
      once(`d:${nameKey(dText)}`, {
        sheet: 'Board list', row: r.line, column: 'DEPARTMENT',
        message: cands.length
          ? `"${dText}" matches more than one department; add the faculty or rename one in Academic structure`
          : `Department "${dText}"${r.facultyText ? ` (${r.facultyText})` : ''} is not ${allowedDepartments ? 'one of this box\'s departments' : 'in Academic structure'}`,
      });
      continue;
    }
    const dept = cands[0];
    const degree = degreeOf(r.degreeText);
    if (!degree) {
      once(`g:${r.degreeText}`, { sheet: 'Board list', row: r.line, column: 'PROG.', message: `Unknown programme type "${r.degreeText}"; use ${DEGREE_TYPES.join(', ')}` });
      continue;
    }
    let progs = programmes.filter((p) => p.department.equals(dept._id) && p.degreeType === degree);
    const spec = r.row.remarks?.replace(/^Area of specialization:\s*/, '');
    if (progs.length > 1 && spec) {
      const named = progs.filter((p) => nameKey(p.name).includes(nameKey(spec)));
      if (named.length === 1) progs = named;
    }
    if (progs.length !== 1) {
      once(`p:${dept.code}:${degree}`, {
        sheet: 'Board list', row: r.line, column: 'PROG.',
        message: progs.length
          ? `${dept.name} has several ${degree} programmes (${progs.map((p) => p.name).join(', ')}); fill AREA OF SPECIALIZATION with the programme name`
          : `${dept.name} has no ${degree} programme yet; add it in Academic structure (Bulk add works too)`,
      });
      continue;
    }
    targets.set(r.line, { departmentId: dept._id, programmeId: progs[0]._id, programmeName: progs[0].name, degreeType: degree });
  }
  return { targets, errors };
}
