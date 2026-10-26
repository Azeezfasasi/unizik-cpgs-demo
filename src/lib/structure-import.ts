import 'server-only';
import * as XLSX from 'xlsx';
import type { ClientSession } from 'mongoose';
import { Department, Faculty, Programme } from '@/models';
import { findDegree, getDegrees } from './degree-list';
import type { CellError } from './action-state';

/**
 * Bulk import of the academic structure from one sheet: one row per programme, carrying its
 * department and faculty. Rows may stop at the department (or faculty) to add those alone.
 * Faculties, departments and programmes are matched by code; existing ones are reused, never changed.
 */
export const STRUCTURE_COLUMNS = [
  'Faculty', 'Faculty Code', 'Department', 'Department Code', 'Programme', 'Programme Code', 'Degree Type', 'Matric Pattern',
] as const;
type Column = (typeof STRUCTURE_COLUMNS)[number];

const SHEET = 'Structure';
const EXAMPLE = [
  ['Faculty of Agriculture', 'AGR', 'Agricultural Extension', 'AEX', 'M.Sc. Agricultural Extension', 'MSC-AEX', 'MSc', ''],
  ['Faculty of Agriculture', 'AGR', 'Agricultural Extension', 'AEX', 'Ph.D. Agricultural Extension', 'PHD-AEX', 'PhD', ''],
  ['Faculty of Agriculture', 'AGR', 'Crop Science', 'CRS', '', '', '', '^20\\d{8}$'],
];

const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** Template (xlsx or csv); with `rows`, it is filled with the current structure instead of examples. */
export function buildStructureFile(format: 'xlsx' | 'csv', rows?: string[][]) {
  const data = [[...STRUCTURE_COLUMNS], ...(rows ?? [])];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  if (format === 'csv') return '﻿' + XLSX.utils.sheet_to_csv(sheet) + '\r\n';
  sheet['!cols'] = [34, 12, 34, 14, 40, 16, 12, 22].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, SHEET);
  const info = XLSX.utils.aoa_to_sheet([
    ['CPGS Results Repository: academic structure import'],
    [],
    ['How it works'],
    ['One row per programme, with its department and faculty on the same row. A row can stop after the department (or faculty) to add just that.'],
    ['Faculties and departments are matched by code, programmes by department + name + degree type. Existing ones are reused and never changed; only new ones are added.'],
    ['Nothing is saved unless every row is valid. Use "Check only" first to see what would be added. Differences from what already exists are shown as warnings.'],
    [],
    ['Column', 'Rule'],
    ['Faculty / Faculty Code', 'Required on every row. Code 2–10 characters, e.g. AGR.'],
    ['Department / Department Code', 'Give both or neither. Code 2–10 characters, unique across the university, e.g. AEX.'],
    ['Programme', 'Optional; needs a department on the same row. A programme is recognised by its department, name and degree type.'],
    ['Programme Code', 'Optional. Leave it blank, or reuse one code (e.g. the department code) for several programmes: a unique code such as MSC-AEX or PHD-AEX is generated.'],
    ['Degree Type', 'Required with a programme: a degree code from Academic structure → Degrees (e.g. PGD, MSc, PhD), or another spelling listed there (M.Sc., Ph.D.).'],
    ['Matric Pattern', 'Optional regular expression for the department\'s matric numbers, e.g. ^20\\d{8}$.'],
    [],
    ['Examples'],
    [...STRUCTURE_COLUMNS],
    ...EXAMPLE,
  ]);
  info['!cols'] = [{ wch: 30 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, info, 'Instructions');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** The current structure as template rows: one row per programme, plus departments without programmes. */
export async function currentStructureRows() {
  const [faculties, departments, programmes] = await Promise.all([
    Faculty.find().sort({ name: 1 }).lean(), Department.find().sort({ name: 1 }).lean(), Programme.find().sort({ name: 1 }).lean(),
  ]);
  const rows: string[][] = [];
  for (const f of faculties) {
    const deps = departments.filter((d) => d.faculty.equals(f._id));
    if (!deps.length) rows.push([f.name, f.code, '', '', '', '', '', '']);
    for (const d of deps) {
      const progs = programmes.filter((p) => p.department.equals(d._id));
      if (!progs.length) rows.push([f.name, f.code, d.name, d.code, '', '', '', d.matricPattern ?? '']);
      for (const p of progs) rows.push([f.name, f.code, d.name, d.code, p.name, p.code, p.degreeType, d.matricPattern ?? '']);
    }
  }
  return rows;
}

type Row = {
  line: number;
  faculty: { name: string; code: string };
  department?: { name: string; code: string; matricPattern?: string };
  /** degreeType is the text in the file until planStructureImport resolves it to a degree code. */
  programme?: { name: string; code: string; degreeType: string };
};

/** Reads the file into rows, reporting cell problems with the row numbers people see in Excel. */
export function parseStructureFile(buf: ArrayBuffer, fileName: string): { rows: Row[]; errors: CellError[] } {
  const isCsv = /\.csv$/i.test(fileName);
  const sheetName = isCsv ? 'CSV' : SHEET;
  let wb: XLSX.WorkBook;
  try {
    wb = isCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(buf, { type: 'array' });
  } catch {
    return { rows: [], errors: [{ sheet: '-', row: 0, column: '-', message: `File is not a readable ${isCsv ? 'CSV file' : 'Excel workbook'}` }] };
  }
  const ws = isCsv ? wb.Sheets[wb.SheetNames[0]] : wb.Sheets[SHEET] ?? wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const header = (grid[0] ?? []).map(str);
  const index = new Map<Column, number>();
  const errors: CellError[] = [];
  for (const col of STRUCTURE_COLUMNS) {
    const i = header.findIndex((h) => h.toLowerCase() === col.toLowerCase());
    if (i >= 0) index.set(col, i);
    else if (col !== 'Matric Pattern') errors.push({ sheet: sheetName, row: 1, column: col, message: `Column "${col}" is missing` });
  }
  if (errors.length) return { rows: [], errors };
  const cell = (r: unknown[], col: Column) => str(r[index.get(col) ?? -1]);

  const rows: Row[] = [];
  grid.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.every((v) => str(v) === '')) return;
    const err = (column: string, message: string) => errors.push({ sheet: sheetName, row: line, column, message });
    const before = errors.length;

    const fName = cell(r, 'Faculty'), fCode = cell(r, 'Faculty Code').toUpperCase();
    if (fName.length < 3) err('Faculty', 'Faculty name is required (at least 3 characters)');
    if (fCode.length < 2 || fCode.length > 10) err('Faculty Code', 'Faculty code must be 2–10 characters');

    const dName = cell(r, 'Department'), dCode = cell(r, 'Department Code').toUpperCase(), pattern = cell(r, 'Matric Pattern');
    const hasDept = !!(dName || dCode);
    if (hasDept) {
      if (dName.length < 3) err('Department', 'Department name is required with its code (at least 3 characters)');
      if (dCode.length < 2 || dCode.length > 10) err('Department Code', 'Department code must be 2–10 characters');
      if (pattern) { try { new RegExp(pattern); } catch { err('Matric Pattern', 'Not a valid regular expression'); } }
    } else if (pattern) err('Matric Pattern', 'A matric pattern needs a department on the same row');

    const pName = cell(r, 'Programme'), pCode = cell(r, 'Programme Code').toUpperCase(), dtRaw = cell(r, 'Degree Type');
    const hasProg = !!(pName || pCode || dtRaw);
    const dt = dtRaw || null;
    if (hasProg) {
      if (!hasDept) err('Department', 'A programme needs its department on the same row');
      if (pName.length < 3) err('Programme', 'Programme name is required (at least 3 characters)');
      if (pCode && (pCode.length < 2 || pCode.length > 20)) err('Programme Code', 'Programme code must be 2–20 characters, or leave it blank to generate one');
      if (!dt) err('Degree Type', 'Degree type is required with a programme');
    }
    if (errors.length > before) return;
    rows.push({
      line,
      faculty: { name: fName, code: fCode },
      department: hasDept ? { name: dName, code: dCode, matricPattern: pattern || undefined } : undefined,
      programme: hasProg ? { name: pName, code: pCode, degreeType: dt! } : undefined,
    });
  });
  if (!rows.length && !errors.length) errors.push({ sheet: sheetName, row: 2, column: '-', message: 'No rows found' });
  return { rows, errors };
}

export type StructurePlan = {
  faculties: { name: string; code: string }[];
  departments: { name: string; code: string; facultyCode: string; matricPattern?: string }[];
  programmes: { name: string; code: string; degreeType: string; departmentCode: string }[];
  existing: { faculties: number; departments: number; programmes: number };
  /** Programme codes the import made up because the cell was blank or the code was already taken. */
  generatedCodes: { line: number; name: string; given: string; code: string }[];
};

/** "MSc" + "REE" → "MSC-REE"; keeps a base that already starts with the degree prefix. */
function programmeCode(degree: string, base: string, used: Set<string>) {
  const prefix = degree.toUpperCase();
  const stem = (base.startsWith(`${prefix}-`) ? base : `${prefix}-${base}`).slice(0, 17);
  let code = stem;
  for (let n = 2; used.has(code); n++) code = `${stem}-${n}`;
  return code;
}

/**
 * Works out what is new against the database. Codes identify faculties and departments; a
 * programme is identified by its department, name and degree type, so its code only has to be
 * unique, and one is generated when the cell is blank or the code is already taken. Differences
 * from what already exists are warnings: existing items always win and are never changed.
 */
export async function planStructureImport(rows: Row[]) {
  const errors: CellError[] = [];
  const warnings: string[] = [];
  const [faculties, departments, programmes] = await Promise.all([
    Faculty.find().lean(),
    Department.find().populate<{ faculty: { code: string } }>('faculty', 'code').lean(),
    Programme.find().populate<{ department: { code: string } }>('department', 'code').lean(),
  ]);
  const facBy = new Map(faculties.map((f) => [f.code, f]));
  const depBy = new Map(departments.map((d) => [d.code, d]));
  const progKey = (dept: string, name: string, degree: string) => `${dept}|${name.trim().toLowerCase()}|${degree}`;
  const progBy = new Map(programmes.map((p) => [progKey(p.department.code, p.name, p.degreeType), p]));
  const usedCodes = new Set(programmes.map((p) => p.code));

  // Degree types must be degrees in Academic structure → Degrees (any of their spellings).
  const degrees = await getDegrees();
  for (const r of rows) {
    if (!r.programme) continue;
    const d = findDegree(r.programme.degreeType, degrees);
    if (d) r.programme.degreeType = d.code;
    else errors.push({ sheet: SHEET, row: r.line, column: 'Degree Type', message: `Unknown degree "${r.programme.degreeType}": use ${degrees.map((x) => x.code).join(', ')}, or add it under Academic structure → Degrees` });
  }
  if (errors.length) return { plan: { faculties: [], departments: [], programmes: [], existing: { faculties: 0, departments: 0, programmes: 0 }, generatedCodes: [] } as StructurePlan, errors, warnings };

  const plan: StructurePlan = { faculties: [], departments: [], programmes: [], existing: { faculties: 0, departments: 0, programmes: 0 }, generatedCodes: [] };
  const seenF = new Map<string, { name: string; line: number }>();
  const seenD = new Map<string, { name: string; facultyCode: string; line: number }>();
  const seenP = new Map<string, number>();
  const once = new Set<string>();
  // A programme code given to more than one programme in the file is treated as a shared base
  // (often the department code), so every one of those programmes gets its own generated code.
  const keysByCode = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.programme?.code || !r.department) continue;
    const set = keysByCode.get(r.programme.code) ?? new Set<string>();
    set.add(progKey(r.department.code, r.programme.name, r.programme.degreeType));
    keysByCode.set(r.programme.code, set);
  }
  const sharedCodes = new Set([...keysByCode].filter(([, keys]) => keys.size > 1).map(([code]) => code));
  const warn = (key: string, msg: string) => { if (!once.has(key)) { once.add(key); warnings.push(msg); } };

  for (const r of rows) {
    // Faculty: the code is its identity; the first name given (or the existing one) is kept.
    const f = r.faculty;
    const prevF = seenF.get(f.code);
    if (prevF) {
      if (prevF.name.toLowerCase() !== f.name.toLowerCase()) warn(`fn:${f.code}`, `Faculty ${f.code} has more than one name in the file; used "${prevF.name}" (row ${prevF.line})`);
    } else {
      seenF.set(f.code, { name: f.name, line: r.line });
      const ex = facBy.get(f.code);
      if (ex) {
        plan.existing.faculties++;
        if (ex.name.toLowerCase() !== f.name.toLowerCase()) warn(`f:${f.code}`, `Faculty ${f.code} already exists as "${ex.name}"; kept that name`);
      } else plan.faculties.push(f);
    }

    // Department: likewise identified by code; it stays under the faculty it was first given.
    const d = r.department;
    if (!d) continue;
    const prevD = seenD.get(d.code);
    let deptFaculty = f.code;
    if (prevD) {
      deptFaculty = prevD.facultyCode;
      if (prevD.name.toLowerCase() !== d.name.toLowerCase()) warn(`dn:${d.code}`, `Department ${d.code} has more than one name in the file; used "${prevD.name}" (row ${prevD.line})`);
      if (prevD.facultyCode !== f.code) warn(`df:${d.code}`, `Department ${d.code} is listed under ${prevD.facultyCode} and ${f.code}; kept it under ${prevD.facultyCode}`);
    } else {
      const ex = depBy.get(d.code);
      if (ex) {
        deptFaculty = ex.faculty.code;
        plan.existing.departments++;
        if (ex.faculty.code !== f.code) warn(`df:${d.code}`, `Department ${d.code} already exists under faculty ${ex.faculty.code}; its programmes were added there`);
        else if (ex.name.toLowerCase() !== d.name.toLowerCase()) warn(`d:${d.code}`, `Department ${d.code} already exists as "${ex.name}"; kept that name`);
        if (d.matricPattern && d.matricPattern !== (ex.matricPattern ?? '')) warn(`dp:${d.code}`, `Department ${d.code} already exists; its matric pattern was not changed`);
      } else plan.departments.push({ ...d, facultyCode: f.code });
      seenD.set(d.code, { name: d.name, facultyCode: deptFaculty, line: r.line });
    }

    // Programme: identified by department + name + degree; the code just has to be unique.
    const p = r.programme;
    if (!p) continue;
    const key = progKey(d.code, p.name, p.degreeType);
    if (seenP.has(key)) { warn(`pp:${key}`, `"${p.name}" (${p.degreeType}) in ${d.code} is listed more than once; added once`); continue; }
    seenP.set(key, r.line);
    if (progBy.has(key)) { plan.existing.programmes++; continue; }
    let code = p.code;
    if (!code || usedCodes.has(code) || sharedCodes.has(code)) {
      code = programmeCode(p.degreeType, p.code || d.code, usedCodes);
      plan.generatedCodes.push({ line: r.line, name: p.name, given: p.code, code });
    }
    usedCodes.add(code);
    plan.programmes.push({ name: p.name, code, degreeType: p.degreeType, departmentCode: d.code });
  }
  if (plan.generatedCodes.length) {
    const sample = plan.generatedCodes.slice(0, 4).map((g) => `${g.given ? `${g.given} → ` : ''}${g.code}`).join(', ');
    warnings.push(`Programme codes were generated for ${plan.generatedCodes.length} programme${plan.generatedCodes.length === 1 ? '' : 's'} because the code was blank or already used (e.g. ${sample}). Download "Current structure" after importing to see them all.`);
  }
  return { plan, errors, warnings };
}

/** Creates the new items in order (faculties, departments, programmes) and returns their ids by code. */
export async function applyStructurePlan(plan: StructurePlan, session: ClientSession | null) {
  const opts = session ? { session } : {};
  const facIds = new Map((await Faculty.find().select('code').lean()).map((f) => [f.code, f._id]));
  const createdF = plan.faculties.length ? await Faculty.insertMany(plan.faculties, opts) : [];
  createdF.forEach((f) => facIds.set(f.code, f._id));

  const depIds = new Map((await Department.find().select('code').lean()).map((d) => [d.code, d._id]));
  const createdD = plan.departments.length
    ? await Department.insertMany(plan.departments.map((d) => ({ name: d.name, code: d.code, faculty: facIds.get(d.facultyCode), matricPattern: d.matricPattern })), opts)
    : [];
  createdD.forEach((d) => depIds.set(d.code, d._id));

  const createdP = plan.programmes.length
    ? await Programme.insertMany(plan.programmes.map((p) => ({ name: p.name, code: p.code, degreeType: p.degreeType, department: depIds.get(p.departmentCode) })), opts)
    : [];
  return { faculties: createdF.length, departments: createdD.length, programmes: createdP.length };
}
