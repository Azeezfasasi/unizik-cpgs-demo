import 'server-only';
import * as XLSX from 'xlsx';
import { Types, type ClientSession } from 'mongoose';
import { Department, Faculty, GraduandRecord, Programme, Student } from '@/models';
import { getDegrees, type DegreeItem } from './degree-list';
import { GraduandRowSchema, type GraduandRow } from './validators';
import type { CellError } from './action-state';

/**
 * Reads PG Board result lists as the CPGS keeps them in Excel. Every sheet with a header row is
 * read (S/N, NAME/REG. NO. or NAME + REGISTRATION NUMBER, FACULTY, DEPARTMENT, PROG., 1ST–4TH SEM.,
 * PROJECT, FCGPA, EFFECTIVE DATE / DATE OF GRAD, AREA OF SPECIALIZATION, GENDER). Title rows are
 * skipped; header rows may repeat with a different column layout and each one re-maps the columns.
 */

type Field = 'sn' | 'nameReg' | 'name' | 'reg' | 'faculty' | 'department' | 'degree' | 'sem1' | 'sem2' | 'sem3' | 'sem4'
  | 'project' | 'fcgpa' | 'wef' | 'specialization' | 'sex' | 'session';

const canon = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

function fieldFor(header: string): Field | null {
  const c = canon(header);
  if (!c) return null;
  if (c === 'sn' || c === 'serialno' || c === 'sno') return 'sn';
  if (c.includes('name') && (c.includes('reg') || c.includes('matric'))) return 'nameReg';
  if (c === 'name' || c === 'names' || c === 'fullname' || c === 'nameofstudent' || c === 'nameofcandidate') return 'name';
  if (c.startsWith('regno') || c.startsWith('matric') || c.startsWith('registrationn') || c === 'regnumber') return 'reg';
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
  if (c.startsWith('effectivedate') || c.startsWith('wef') || c.startsWith('dateofgrad') || c === 'graduationdate') return 'wef';
  if (c.includes('speciali')) return 'specialization';
  if (c === 'sex' || c === 'gender') return 'sex';
  if (c === 'session') return 'session';
  return null;
}

const str = (v: unknown) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/** dd/mm/yy, dd/mm/yyyy, "WEF 13/03/2014" or an Excel date → YYYY-MM-DD; "NOT SUPPLIED", "N/A" → blank. */
function day(v: unknown) {
  if (v === '' || v == null) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : String(v);
  }
  const s = String(v).trim().replace(/^w\.?e\.?f\.?\s*/i, '');
  if (!/\d/.test(s)) return undefined; // "NOT SUPPLIED", "N/A", "-"
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

/** "58th" from "...58TH BOARD MEETING", "96TH BOARD" or "96TH MGT APPROVED RESULTS". */
function meetingIn(text: string) {
  const m = text.match(/\b(\d{1,3})\s*(ST|ND|RD|TH)\b[^A-Z0-9]*(?:PG\s*)?(?:BOARD|MGT|MEETING)/i);
  return m ? `${m[1]}${m[2].toLowerCase()}` : undefined;
}

export type BoardRow = {
  /** Unique across the workbook (sheet index and row), used for programme choices. */
  uid: number;
  sheet: string; line: number;
  facultyText: string; departmentText: string; degreeText: string; sessionText: string;
  row: GraduandRow;
};

/** Parses every sheet of a board list; rows are validated as graduand rows (class comes from FCGPA). */
export function parseBoardList(buf: ArrayBuffer, fileName: string) {
  const errors: CellError[] = [];
  const warnings: string[] = [];
  const isCsv = /\.csv$/i.test(fileName);
  let wb: XLSX.WorkBook;
  try {
    wb = isCsv
      ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''), { type: 'string', raw: true })
      : XLSX.read(buf, { type: 'array' });
  } catch {
    return { meeting: undefined, rows: [], errors: [{ sheet: '-', row: 0, column: '-', message: 'File is not a readable Excel or CSV file' }], warnings };
  }

  let meeting: string | undefined;
  const rows: BoardRow[] = [];
  const seen = new Map<string, { sheet: string; line: number; cgpa?: number; degree: string }>();
  let duplicates = 0;
  let sheetsWithHeader = 0;

  wb.SheetNames.forEach((sheetName, si) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', blankrows: true });
    let map: Map<Field, number> | null = null;
    grid.forEach((cells, i) => {
      const line = i + 1;
      const texts = cells.map(str);
      if (!meeting && !map) meeting = meetingIn(texts.join(' '));
      // A header row: it names the person column and the faculty or department column.
      const fields = texts.map(fieldFor);
      if ((fields.includes('nameReg') || fields.includes('name')) && (fields.includes('department') || fields.includes('faculty'))) {
        if (!map) sheetsWithHeader++;
        map = new Map();
        fields.forEach((f, ci) => { if (f && !map!.has(f)) map!.set(f, ci); });
        return;
      }
      if (!map || texts.every((t) => !t)) return;
      const get = (f: Field) => (map!.has(f) ? cells[map!.get(f)!] : '');
      const nameText = str(get(map.has('nameReg') ? 'nameReg' : 'name'));
      if (!nameText) return; // continuation or spacer row
      const err = (column: string, message: string) => errors.push({ sheet: sheetName, row: line, column, message });

      const parsed = splitNameReg(nameText);
      const reg = (map.has('reg') ? str(get('reg')) : parsed.reg).replace(/\s+/g, '').toUpperCase();
      if (!reg) {
        // A heading inside the sheet ("62ND BOARD MEETING; SUPPLEMENTARY LIST"): no result on the row.
        if (!str(get('department')) && !str(get('faculty')) && !str(get('degree')) && !str(get('fcgpa'))) return;
        err('NAME/REG. NO.', `No registration number found for "${nameText}"`);
        return;
      }

      const sems = (['sem1', 'sem2', 'sem3', 'sem4'] as const).map((f) => num(get(f)));
      const last = sems.findLastIndex((v) => v !== undefined);
      if (sems.slice(0, last + 1).some((v) => v === undefined)) { err('Semester GPAs', 'A semester GPA is blank between filled ones'); return; }
      const candidate = {
        matricNo: reg, surname: parsed.surname, otherNames: parsed.otherNames || '-',
        sex: ({ M: 'M', F: 'F' } as Record<string, string>)[str(get('sex')).toUpperCase().slice(0, 1)],
        cgpa: num(get('fcgpa')),
        semesterGpas: sems.slice(0, last + 1),
        projectGrade: num(get('project')),
        effectiveDate: day(get('wef')),
        boardMeeting: meeting,
        remarks: str(get('specialization')) ? `Area of specialization: ${str(get('specialization'))}` : undefined,
        courses: [],
      };
      const p = GraduandRowSchema.safeParse(candidate);
      if (!p.success) {
        for (const iss of p.error.issues) {
          const key = String(iss.path[0] ?? '');
          const column = ({ cgpa: 'FCGPA', projectGrade: 'PROJECT', effectiveDate: 'DATE OF GRADUATION', semesterGpas: 'Semester GPAs', surname: 'NAME', otherNames: 'NAME' } as Record<string, string>)[key] ?? key;
          err(column, iss.message);
        }
        return;
      }
      // A graduand listed again (e.g. on a summary sheet) with the same result is imported once.
      const degree = str(get('degree')).toUpperCase();
      const prev = seen.get(reg);
      if (prev) {
        if (prev.cgpa === p.data.cgpa && prev.degree === degree) { duplicates++; return; }
        err('REGISTRATION NUMBER', `${reg} is also on ${prev.sheet === sheetName ? '' : `sheet "${prev.sheet}", `}row ${prev.line} with a different result`);
        return;
      }
      seen.set(reg, { sheet: sheetName, line, cgpa: p.data.cgpa, degree });
      rows.push({
        uid: si * 100000 + line, sheet: sheetName, line,
        facultyText: str(get('faculty')), departmentText: str(get('department')),
        degreeText: str(get('degree')), sessionText: str(get('session')),
        row: p.data,
      });
    });
  });

  // The board number may only be in a sheet name ("96TH BOARD") or the file name.
  meeting ??= wb.SheetNames.map(meetingIn).find(Boolean) ?? meetingIn(fileName.replace(/[_-]/g, ' '));
  if (meeting) for (const r of rows) r.row.boardMeeting ??= meeting;
  if (duplicates) warnings.push(`${duplicates} graduand(s) appear on more than one sheet with the same result; each was imported once`);
  if (!sheetsWithHeader) errors.push({ sheet: '-', row: 0, column: '-', message: 'No header row found (one with NAME and FACULTY or DEPARTMENT)' });
  else if (!rows.length && !errors.length) errors.push({ sheet: '-', row: 0, column: '-', message: 'No graduand rows found' });
  return { meeting, rows, errors, warnings };
}

/** Name key that ignores case, punctuation, "Faculty/Department of", "&" vs "and" and plural endings. */
function nameKey(s: string) {
  return s.toUpperCase().replace(/&/g, ' AND ').replace(/\b(FACULTY|DEPARTMENT|DEPT|SCHOOL)\s+OF\b/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (w.length > 3 ? w.replace(/S$/, '') : w)).join(' ');
}
const compact = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');

/** Abbreviations seen on board lists ("Medical Lab Sci.", "Educational Mgt&policy", "English Lang.&lit"). */
const ABBREVIATIONS: Record<string, string> = {
  LAB: 'LABORATORY', SCI: 'SCIENCE', SC: 'SCIENCE', MGT: 'MANAGEMENT', MGMT: 'MANAGEMENT', MGMNT: 'MANAGEMENT',
  LANG: 'LANGUAGE', LIT: 'LITERATURE', TECH: 'TECHNOLOGY', BIOTECH: 'BIOTECHNOLOGY', CHEM: 'CHEMISTRY', ENGR: 'ENGINEERING',
  ENGG: 'ENGINEERING', EDUC: 'EDUCATION', EDU: 'EDUCATION', ADMIN: 'ADMINISTRATION', STUD: 'STUDIES', INTL: 'INTERNATIONAL',
  ECON: 'ECONOMICS', ECONS: 'ECONOMICS', AGRIC: 'AGRICULTURAL', GEOG: 'GEOGRAPHY', PHYS: 'PHYSICS',
  MATHS: 'MATHEMATICS', MATH: 'MATHEMATICS', STATS: 'STATISTICS', STAT: 'STATISTICS', COMP: 'COMPUTER', ELECT: 'ELECTRICAL',
  MECH: 'MECHANICAL', DEPT: '', DEPARTMENT: '', FACULTY: '',
};
const STOP = new Set(['AND', 'OF', 'THE', 'FOR', 'IN', '']);
const singular = (w: string) => (w.length > 3 ? w.replace(/S$/, '') : w);

/** Words of a name, upper-case, abbreviations expanded, without "and/of" or plural endings. */
function wordsOf(s: string) {
  return s.toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z]+/g, ' ').split(' ')
    .map((w) => ABBREVIATIONS[w] ?? w).filter((w) => !STOP.has(w)).map(singular);
}

/** Edit distance, for typos such as "Pharmceutical". */
function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** A list word stands for a structure word: same, shortened ("Met" for Metallurgical), or a small typo. */
function wordFits(listWord: string, word: string) {
  if (listWord === word) return true;
  if (listWord.length >= 3 && word.startsWith(listWord)) return true;
  return listWord.length >= 6 && editDistance(listWord, word) <= (listWord.length >= 9 ? 2 : 1);
}

/**
 * Whether a department name on the list refers to a structure department: every list word fits the
 * structure words in order (two list words may join, "Micro Biology" → Microbiology), leaving at most
 * one structure word unmatched when the list gives two or more words.
 */
function nameFits(list: string, name: string) {
  const a = wordsOf(list), b = wordsOf(name);
  if (!a.length || !b.length) return false;
  if (a.join('') === b.join('')) return true;
  let j = 0, matched = 0;
  for (let i = 0; i < a.length; i++) {
    let found = false;
    while (j < b.length && !found) {
      if (i + 1 < a.length && wordFits(a[i] + a[i + 1], b[j])) { i++; found = true; } else if (wordFits(a[i], b[j])) found = true;
      j++;
    }
    if (!found) return false;
    matched++;
  }
  const unmatched = b.length - matched;
  return unmatched === 0 || (a.length >= 2 && unmatched <= 1);
}

/** Initials of a name as written ("Medical Lab Sci." → MLS), for matching department codes. */
const initialsOf = (s: string) => s.toUpperCase().replace(/&/g, ' ').replace(/[^A-Z]+/g, ' ').split(' ')
  .filter((w) => w && !STOP.has(w)).map((w) => w[0]).join('');

/** Built-in programme-type spellings on board lists, with the label used to name a new programme. */
const BUILTIN_DEGREES: Record<string, { type: string; label: string }> = {
  PGD: { type: 'PGD', label: 'PGD' }, PGDE: { type: 'PGD', label: 'PGDE' }, PGDIP: { type: 'PGD', label: 'PGD' },
  MA: { type: 'MA', label: 'M.A.' }, MSC: { type: 'MSc', label: 'M.Sc.' }, MED: { type: 'MEd', label: 'M.Ed.' },
  MBA: { type: 'MBA', label: 'MBA' }, LLM: { type: 'LLM', label: 'LL.M.' }, MPHIL: { type: 'MPhil', label: 'M.Phil.' },
  PHD: { type: 'PhD', label: 'Ph.D.' }, DPHIL: { type: 'PhD', label: 'Ph.D.' },
  MENG: { type: 'MSc', label: 'M.Eng.' }, MTECH: { type: 'MSc', label: 'M.Tech.' }, MARCH: { type: 'MSc', label: 'M.Arch.' },
  MPH: { type: 'MSc', label: 'MPH' }, MPA: { type: 'MSc', label: 'MPA' }, MLIS: { type: 'MSc', label: 'MLIS' }, MLS: { type: 'MSc', label: 'MLS' },
  MSCED: { type: 'MEd', label: 'M.Sc.Ed.' }, MFA: { type: 'MA', label: 'MFA' }, MMUS: { type: 'MA', label: 'M.Mus.' },
  MPHARM: { type: 'MSc', label: 'M.Pharm.' }, MCOM: { type: 'MSc', label: 'M.Com.' }, MURP: { type: 'MSc', label: 'MURP' },
  MIT: { type: 'MSc', label: 'MIT' }, MPM: { type: 'MSc', label: 'MPM' }, MPS: { type: 'MSc', label: 'MPS' },
};
/**
 * Spelling → degree for this import: the built-in spellings of degrees that exist, plus every managed
 * degree's code and other spellings (Academic structure → Degrees), which take precedence.
 */
function degreeSpellings(degrees: DegreeItem[]) {
  const codes = new Set(degrees.map((d) => d.code));
  const out: Record<string, { type: string; label: string }> = {};
  for (const [k, v] of Object.entries(BUILTIN_DEGREES)) if (codes.has(v.type)) out[k] = v;
  for (const d of degrees) {
    const label = d.aliases.find((a) => a.includes('.')) ?? d.code;
    for (const sp of [d.code, ...d.aliases]) {
      const k = compact(sp);
      if (!k) continue;
      // A built-in spelling keeps its label (MENG → "M.Eng."); otherwise the dotted spelling or the code.
      out[k] = { type: d.code, label: BUILTIN_DEGREES[k]?.label ?? label };
    }
  }
  return out;
}

/** "LIBRARY & INFORMATION SCIENCE" → "Library & Information Science" (mixed-case text is kept). */
function titleCase(s: string) {
  if (s !== s.toUpperCase()) return s.trim();
  return s.toLowerCase().split(/\s+/).filter(Boolean)
    .map((w, i) => (i > 0 && ['and', 'of', 'in', 'for', 'the', '&'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/** Short unique code from a name's initials ("Library & Information Science" → LIS), suffixed if taken. */
function codeFor(name: string, used: Set<string>, min = 2) {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/)
    .filter((w) => w && !['FACULTY', 'DEPARTMENT', 'OF', 'AND', 'IN', 'FOR', 'THE'].includes(w));
  let base = words.map((w) => w[0]).join('').slice(0, 6);
  if (base.length < min) base = (words[0] ?? 'NEW').slice(0, 3);
  let code = base;
  for (let n = 2; used.has(code); n++) code = `${base}${n}`;
  used.add(code);
  return code;
}

export type BoardTarget = { departmentId: Types.ObjectId; programmeId: Types.ObjectId; programmeName: string; degreeType: string };

/** A row whose department has several programmes of its degree type: the person importing picks one. */
export type ProgrammeChoice = {
  uid: number; sheet: string; line: number; matricNo: string; name: string; group: string; department: string; degreeType: string;
  options: { id: string; name: string }[];
  /** Set when the programme was already picked on screen (kept so the choice stays visible). */
  selected?: string;
};

/** Faculties, departments and programmes to add to Academic structure (ids assigned in advance). */
export type StructureAdditions = {
  faculties: { _id: Types.ObjectId; name: string; code: string }[];
  departments: { _id: Types.ObjectId; name: string; code: string; faculty: Types.ObjectId; facultyName: string }[];
  programmes: { _id: Types.ObjectId; name: string; code: string; degreeType: string; department: Types.ObjectId; departmentName: string }[];
};

/**
 * Matches each row's department (by name, using the faculty when two share a name) and programme:
 * the department's only programme of that type (narrowed by the list's own label, e.g. PGDE), or
 * else the one picked on screen, the one the student already has a record for, or the one named
 * like the area of specialization. Undecided rows come back as `choices`. With `addMissing`,
 * departments and programmes not in Academic structure are planned as `additions` instead of errors.
 */
export async function resolveBoardRows(rows: BoardRow[], allowedDepartments: Types.ObjectId[] | null,
  picked: Map<number, string> = new Map(), addMissing = false) {
  const errors: CellError[] = [];
  const [faculties, allDepartments, programmes, degrees] = await Promise.all([Faculty.find().lean(), Department.find().lean(), Programme.find().lean(), getDegrees()]);
  const spellings = degreeSpellings(degrees);
  const degreeOf = (text: string) => spellings[compact(text)] ?? null;
  const departments = allowedDepartments ? allDepartments.filter((d) => allowedDepartments.some((a) => a.equals(d._id))) : allDepartments;
  const facKey = new Map(faculties.map((f) => [String(f._id), nameKey(f.name)]));
  const byKey = new Map<string, typeof departments>();
  // A department is listed once per key even when its name and code give the same key ("Law" / LAW).
  for (const d of departments) for (const k of new Set([nameKey(d.name), d.code.toUpperCase()])) byKey.set(k, [...(byKey.get(k) ?? []), d]);
  const facultyName = new Map(faculties.map((f) => [String(f._id), f.name]));
  /** Whether faculty text on the list refers to this faculty (exact, abbreviated, or sharing a word stem). */
  const facultyFits = (text: string, facultyId: Types.ObjectId) => {
    const name = facultyName.get(String(facultyId)) ?? '';
    if (!text || nameKey(name) === nameKey(text) || nameFits(text, name)) return true;
    const stem = nameKey(text).split(' ')[0]?.slice(0, 6);
    return !!stem && stem.length >= 4 && (nameKey(name).split(' ')[0] ?? '').startsWith(stem);
  };
  const fuzzyCache = new Map<string, typeof departments>();
  /** Departments a list name refers to when its spelling differs (abbreviations, typos, initials as code). */
  const fuzzyDepartments = (text: string, facultyText: string) => {
    const key = `${text}|${facultyText}`;
    if (!fuzzyCache.has(key)) {
      const inFaculty = (d: (typeof departments)[number]) => !facultyText || facultyFits(facultyText, d.faculty);
      let found = departments.filter((d) => nameFits(text, d.name) && inFaculty(d));
      if (!found.length) found = departments.filter((d) => initialsOf(text).length >= 2 && initialsOf(text) === d.code.replace(/\d+$/, '') && inFaculty(d));
      fuzzyCache.set(key, found);
    }
    return fuzzyCache.get(key)!;
  };
  const notes: string[] = [];

  // Programmes students already have records for, to settle re-imports without asking again.
  const students = await Student.find({ matricNo: { $in: rows.map((r) => r.row.matricNo) } }).select('matricNo').lean();
  const studentOf = new Map(students.map((s) => [s.matricNo, s._id]));
  const records = await GraduandRecord.find({ student: { $in: students.map((s) => s._id) } }).select('student programme').lean();

  const additions: StructureAdditions = { faculties: [], departments: [], programmes: [] };
  const usedCodes = {
    faculty: new Set(faculties.map((f) => f.code)), department: new Set(allDepartments.map((d) => d.code)), programme: new Set(programmes.map((p) => p.code)),
  };
  const newFaculty = new Map<string, StructureAdditions['faculties'][number]>();
  const newDept = new Map<string, StructureAdditions['departments'][number]>();
  const newProg = new Map<string, StructureAdditions['programmes'][number]>();

  /** Existing faculty by name, or by a unique shared word stem ("Agricultural Sciences" → Agriculture). */
  const facultyFor = (text: string) => {
    const key = nameKey(text);
    const exact = faculties.filter((f) => nameKey(f.name) === key);
    if (exact.length === 1) return { _id: exact[0]._id, name: exact[0].name };
    const near = text ? faculties.filter((f) => facultyFits(text, f._id)) : [];
    if (near.length === 1) return { _id: near[0]._id, name: near[0].name };
    if (!text) return null;
    let f = newFaculty.get(key);
    if (!f) {
      const name = /^faculty/i.test(text) ? titleCase(text) : `Faculty of ${titleCase(text)}`;
      f = { _id: new Types.ObjectId(), name, code: codeFor(name, usedCodes.faculty) };
      newFaculty.set(key, f);
      additions.faculties.push(f);
    }
    return { _id: f._id, name: f.name };
  };

  const targets = new Map<number, BoardTarget>();
  const choices: ProgrammeChoice[] = [];
  const reported = new Set<string>();
  const once = (key: string, e: CellError) => { if (!reported.has(key)) { reported.add(key); errors.push(e); } };
  const hint = addMissing ? '' : '; tick "Add missing departments and programmes" to add it from this list';

  for (const r of rows) {
    const at = { sheet: r.sheet, row: r.line };
    const dText = r.departmentText || r.facultyText;
    const rowDegree = degreeOf(r.degreeText);
    let cands = byKey.get(nameKey(dText)) ?? byKey.get(dText.toUpperCase()) ?? [];
    let fuzzy = false;
    if (!cands.length && dText && !newDept.has(nameKey(dText))) { cands = fuzzyDepartments(dText, r.facultyText); fuzzy = cands.length > 0; }
    if (cands.length > 1 && r.facultyText) {
      const inFaculty = cands.filter((d) => facKey.get(String(d.faculty)) === nameKey(r.facultyText) || facultyFits(r.facultyText, d.faculty));
      if (inFaculty.length) cands = inFaculty;
    }
    // Several left (e.g. LAW): the one that runs this kind of programme.
    if (cands.length > 1 && rowDegree) {
      const running = cands.filter((d) => programmes.some((p) => p.department.equals(d._id) && p.degreeType === rowDegree.type));
      if (running.length) cands = running;
    }
    if (cands.length > 1) {
      once(`d:${nameKey(dText)}`, {
        ...at, column: 'DEPARTMENT',
        message: `"${dText}" could be ${cands.map((d) => d.name).join(' or ')}; write the department name in full (or add the faculty)`,
      });
      continue;
    }
    if (fuzzy && cands.length === 1) {
      const note = `"${dText}" matched to ${cands[0].name} (${cands[0].code})`;
      if (!notes.includes(note)) notes.push(note);
    }
    let dept: { _id: Types.ObjectId; name: string; code: string } | undefined = cands[0];
    if (!dept) {
      const planned = newDept.get(nameKey(dText));
      if (planned) dept = planned;
      else if (!addMissing || allowedDepartments || !dText) {
        once(`d:${nameKey(dText)}`, {
          ...at, column: 'DEPARTMENT',
          message: `Department "${dText}"${r.facultyText ? ` (${r.facultyText})` : ''} is not ${allowedDepartments ? 'one of this box\'s departments' : `in Academic structure${hint}`}`,
        });
        continue;
      } else {
        const fac = facultyFor(r.facultyText);
        if (!fac) { once(`d:${nameKey(dText)}`, { ...at, column: 'FACULTY', message: `Give the faculty of "${dText}" so it can be added` }); continue; }
        const name = titleCase(dText);
        const d = { _id: new Types.ObjectId(), name, code: codeFor(name, usedCodes.department, 3), faculty: fac._id, facultyName: fac.name };
        newDept.set(nameKey(dText), d);
        additions.departments.push(d);
        dept = d;
      }
    }

    const deg = degreeOf(r.degreeText);
    if (!deg) {
      once(`g:${compact(r.degreeText)}`, { ...at, column: 'PROG.', message: `Unknown programme type "${r.degreeText}"; use ${degrees.map((d) => d.code).join(', ')}, or add it under Academic structure → Degrees` });
      continue;
    }
    let progs = programmes.filter((p) => p.department.equals(dept!._id) && p.degreeType === deg.type);
    // The list's own label narrows the choice (PGDE vs PGD in the same department).
    const labelled = progs.filter((p) => compact(p.name).startsWith(compact(deg.label)));
    if (progs.length > 1 && labelled.length) progs = labelled;
    if (!progs.length) {
      const key = `${dept._id}|${deg.label}`;
      const planned = newProg.get(key);
      if (planned) {
        targets.set(r.uid, { departmentId: dept._id, programmeId: planned._id, programmeName: planned.name, degreeType: deg.type });
        continue;
      }
      if (!addMissing) {
        once(`p:${dept.code}:${deg.type}`, { ...at, column: 'PROG.', message: `${dept.name} has no ${deg.type} programme yet${hint}` });
        continue;
      }
      const name = `${deg.label} ${dept.name}`;
      const stem = `${compact(deg.label)}-${dept.code}`.slice(0, 17);
      let code = stem;
      for (let n = 2; usedCodes.programme.has(code); n++) code = `${stem}-${n}`;
      usedCodes.programme.add(code);
      const p = { _id: new Types.ObjectId(), name, code, degreeType: deg.type, department: dept._id, departmentName: dept.name };
      newProg.set(key, p);
      additions.programmes.push(p);
      targets.set(r.uid, { departmentId: dept._id, programmeId: p._id, programmeName: p.name, degreeType: deg.type });
      continue;
    }
    let prog = progs.length === 1 ? progs[0] : undefined;
    const pick = progs.length > 1 ? picked.get(r.uid) : undefined;
    if (!prog) {
      const sid = studentOf.get(r.row.matricNo);
      const spec = r.row.remarks?.replace(/^Area of specialization:\s*/, '');
      const named = spec ? progs.filter((p) => nameKey(p.name).includes(nameKey(spec))) : [];
      prog = (pick && progs.find((p) => String(p._id) === pick))
        || (sid && progs.find((p) => records.some((x) => x.student.equals(sid) && x.programme.equals(p._id))))
        || (named.length === 1 ? named[0] : undefined);
    }
    if (!prog || (pick && String(prog._id) === pick)) {
      choices.push({
        uid: r.uid, sheet: r.sheet, line: r.line, matricNo: r.row.matricNo, name: `${r.row.surname}, ${r.row.otherNames}`,
        group: `${dept.code}|${deg.type}`, department: dept.name, degreeType: deg.type,
        options: progs.map((p) => ({ id: String(p._id), name: p.name })),
        selected: prog ? String(prog._id) : undefined,
      });
      if (!prog) continue;
    }
    targets.set(r.uid, { departmentId: dept._id, programmeId: prog._id, programmeName: prog.name, degreeType: deg.type });
  }
  return { targets, errors, choices, additions, notes };
}

/** Adds the planned faculties, departments and programmes (in that order). */
export async function applyStructureAdditions(a: StructureAdditions, session: ClientSession | null) {
  const opts = session ? { session } : {};
  if (a.faculties.length) await Faculty.insertMany(a.faculties.map(({ _id, name, code }) => ({ _id, name, code })), opts);
  if (a.departments.length) await Department.insertMany(a.departments.map(({ _id, name, code, faculty }) => ({ _id, name, code, faculty })), opts);
  if (a.programmes.length) {
    await Programme.insertMany(a.programmes.map(({ _id, name, code, degreeType, department }) => ({ _id, name, code, degreeType, department })), opts);
  }
}

/** One line describing the additions, for messages and the audit log. */
export function describeAdditions(a: StructureAdditions) {
  const parts = [
    a.faculties.length ? `${a.faculties.length} facult${a.faculties.length === 1 ? 'y' : 'ies'} (${a.faculties.map((f) => f.name).join(', ')})` : '',
    a.departments.length ? `${a.departments.length} department${a.departments.length === 1 ? '' : 's'} (${a.departments.map((d) => `${d.name} [${d.code}]`).join(', ')})` : '',
    a.programmes.length ? `${a.programmes.length} programme${a.programmes.length === 1 ? '' : 's'} (${a.programmes.map((p) => p.name).join(', ')})` : '',
  ].filter(Boolean);
  return parts.join('; ');
}
