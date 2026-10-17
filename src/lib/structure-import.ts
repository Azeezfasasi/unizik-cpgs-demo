import 'server-only';
import * as XLSX from 'xlsx';
import type { ClientSession } from 'mongoose';
import { Department, Faculty, Programme } from '@/models';
import { DEGREE_TYPES } from '@/models/Programme';
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
type DegreeType = (typeof DEGREE_TYPES)[number];

const SHEET = 'Structure';
const EXAMPLE = [
  ['Faculty of Agriculture', 'AGR', 'Agricultural Extension', 'AEX', 'M.Sc. Agricultural Extension', 'MSC-AEX', 'MSc', ''],
  ['Faculty of Agriculture', 'AGR', 'Agricultural Extension', 'AEX', 'Ph.D. Agricultural Extension', 'PHD-AEX', 'PhD', ''],
  ['Faculty of Agriculture', 'AGR', 'Crop Science', 'CRS', '', '', '', '^20\\d{8}$'],
];

/** "M.Sc", "m.sc.", "LL.M", "Ph.D" → MSc, LLM, PhD. */
function degreeType(v: string): DegreeType | null {
  const k = v.replace(/[.\s]/g, '').toLowerCase();
  return DEGREE_TYPES.find((d) => d.toLowerCase() === k) ?? null;
}

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
    ['Faculties, departments and programmes are matched by their code. Existing ones are reused and never changed; only new ones are added.'],
    ['Nothing is saved unless every row is valid. Use "Check only" first to see what would be added.'],
    [],
    ['Column', 'Rule'],
    ['Faculty / Faculty Code', 'Required on every row. Code 2–10 characters, e.g. AGR.'],
    ['Department / Department Code', 'Give both or neither. Code 2–10 characters, unique across the university, e.g. AEX.'],
    ['Programme / Programme Code', 'Give both or neither; needs a department. Code 2–20 characters, unique, e.g. MSC-AEX.'],
    ['Degree Type', `Required with a programme: ${DEGREE_TYPES.join(', ')} (M.Sc., LL.M., Ph.D. also accepted).`],
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
  programme?: { name: string; code: string; degreeType: DegreeType };
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
    const dt = dtRaw ? degreeType(dtRaw) : null;
    if (hasProg) {
      if (!hasDept) err('Department', 'A programme needs its department on the same row');
      if (pName.length < 3) err('Programme', 'Programme name is required with its code (at least 3 characters)');
      if (pCode.length < 2 || pCode.length > 20) err('Programme Code', 'Programme code must be 2–20 characters');
      if (!dt) err('Degree Type', `Degree type must be one of ${DEGREE_TYPES.join(', ')}`);
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
  programmes: { name: string; code: string; degreeType: DegreeType; departmentCode: string }[];
  existing: { faculties: number; departments: number; programmes: number };
};

/**
 * Works out what is new against the database and checks the rows agree with it and with each
 * other (a code always means the same thing). Name differences on existing items are warnings.
 */
export async function planStructureImport(rows: Row[]) {
  const errors: CellError[] = [];
  const warnings: string[] = [];
  const [faculties, departments, programmes] = await Promise.all([
    Faculty.find().lean(), Department.find().populate<{ faculty: { code: string } }>('faculty', 'code').lean(), Programme.find().populate<{ department: { code: string } }>('department', 'code').lean(),
  ]);
  const facBy = new Map(faculties.map((f) => [f.code, f]));
  const depBy = new Map(departments.map((d) => [d.code, d]));
  const progBy = new Map(programmes.map((p) => [p.code, p]));

  const plan: StructurePlan = { faculties: [], departments: [], programmes: [], existing: { faculties: 0, departments: 0, programmes: 0 } };
  const seenF = new Map<string, { name: string; line: number }>();
  const seenD = new Map<string, { name: string; facultyCode: string; line: number }>();
  const seenP = new Map<string, { line: number; departmentCode: string; name: string; degreeType: string }>();
  const counted = new Set<string>();
  const warn = (key: string, msg: string) => { if (!counted.has(key)) { counted.add(key); warnings.push(msg); } };
  const err = (line: number, column: string, message: string) => errors.push({ sheet: 'Structure', row: line, column, message });

  for (const r of rows) {
    // Faculty
    const f = r.faculty;
    const prevF = seenF.get(f.code);
    if (prevF && prevF.name.toLowerCase() !== f.name.toLowerCase()) err(r.line, 'Faculty', `Code ${f.code} is "${prevF.name}" on row ${prevF.line}`);
    if (!prevF) {
      seenF.set(f.code, { name: f.name, line: r.line });
      const ex = facBy.get(f.code);
      if (ex) {
        plan.existing.faculties++;
        if (ex.name.toLowerCase() !== f.name.toLowerCase()) warn(`f:${f.code}`, `Faculty ${f.code} already exists as "${ex.name}"; kept that name`);
      } else plan.faculties.push(f);
    }

    // Department
    const d = r.department;
    if (!d) continue;
    const prevD = seenD.get(d.code);
    if (prevD) {
      if (prevD.name.toLowerCase() !== d.name.toLowerCase()) err(r.line, 'Department', `Code ${d.code} is "${prevD.name}" on row ${prevD.line}`);
      if (prevD.facultyCode !== f.code) err(r.line, 'Faculty Code', `Department ${d.code} is under ${prevD.facultyCode} on row ${prevD.line}`);
    } else {
      seenD.set(d.code, { name: d.name, facultyCode: f.code, line: r.line });
      const ex = depBy.get(d.code);
      if (ex) {
        plan.existing.departments++;
        if (ex.faculty.code !== f.code) err(r.line, 'Faculty Code', `Department ${d.code} already exists under faculty ${ex.faculty.code}`);
        else if (ex.name.toLowerCase() !== d.name.toLowerCase()) warn(`d:${d.code}`, `Department ${d.code} already exists as "${ex.name}"; kept that name`);
        if (d.matricPattern && d.matricPattern !== (ex.matricPattern ?? '')) warn(`dp:${d.code}`, `Department ${d.code} already exists; its matric pattern was not changed`);
      } else plan.departments.push({ ...d, facultyCode: f.code });
    }

    // Programme
    const p = r.programme;
    if (!p) continue;
    const prevP = seenP.get(p.code);
    if (prevP) {
      if (prevP.departmentCode !== d.code || prevP.name.toLowerCase() !== p.name.toLowerCase() || prevP.degreeType !== p.degreeType) {
        err(r.line, 'Programme Code', `Code ${p.code} is already used on row ${prevP.line}`);
      } else warn(`pp:${p.code}`, `Programme ${p.code} is listed more than once; added once`);
      continue;
    }
    seenP.set(p.code, { line: r.line, departmentCode: d.code, name: p.name, degreeType: p.degreeType });
    const ex = progBy.get(p.code);
    if (ex) {
      plan.existing.programmes++;
      if (ex.department.code !== d.code) err(r.line, 'Programme Code', `Programme ${p.code} already exists under department ${ex.department.code}`);
      else if (ex.name.toLowerCase() !== p.name.toLowerCase() || ex.degreeType !== p.degreeType) {
        warn(`p:${p.code}`, `Programme ${p.code} already exists as "${ex.name}" (${ex.degreeType}); left unchanged`);
      }
    } else plan.programmes.push({ ...p, departmentCode: d.code });
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
