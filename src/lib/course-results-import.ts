import 'server-only';
import * as XLSX from 'xlsx';
import { CourseSchema } from './validators';
import { courseTotals } from './grading';
import type { CellError } from './action-state';
import { Amendment, GraduandRecord, Student } from '@/models';

/**
 * Bulk course results: one spreadsheet row per course taken, for many students, copied from their
 * Student's Final Result sheets. Each student's courses replace the courses on their locked record
 * once the Provost approves.
 */

export const COURSE_RESULT_COLUMNS = ['Matric No', 'Course Code', 'Course Title', 'Credit', 'Grade', 'Semester'] as const;
export const MAX_COURSE_ROWS = 6000;
export const MAX_STUDENTS = 300;

export type Course = { code: string; title?: string; units: number; grade?: string; semester?: number };

/** Header aliases (lower-case, spaces removed) → column. Also reads the Courses sheet of the result template. */
const ALIASES: Record<string, (typeof COURSE_RESULT_COLUMNS)[number]> = {
  matricno: 'Matric No', regno: 'Matric No', 'reg.no': 'Matric No', registrationnumber: 'Matric No', matricnumber: 'Matric No', matric: 'Matric No',
  coursecode: 'Course Code', code: 'Course Code', courseno: 'Course Code',
  coursetitle: 'Course Title', title: 'Course Title', titleofcourse: 'Course Title',
  credit: 'Credit', credits: 'Credit', units: 'Credit', unit: 'Credit', cu: 'Credit', creditunits: 'Credit',
  grade: 'Grade',
  semester: 'Semester', sem: 'Semester',
};

const PROJECT = /^(p|proj|project|thesis|dissertation|project\/thesis|project\/thesis\/dissertation)$/i;

export function buildCourseResultsTemplate() {
  const wb = XLSX.utils.book_new();
  const example: (string | number)[][] = [
    ['2020116004FB', 'ECO 811', 'Advanced Microeconomics', 4, 'C', 1],
    ['2020116004FB', 'ECO 813', 'Advanced Macroeconomics', 4, 'B', 1],
    ['2020116004FB', 'ECO 834', 'Commercial Policy', 3, 'C', 2],
    ['2020116004FB', 'ECO 826', 'Industrial Organisation', 3, 'B', 2],
    ['2020116004FB', 'ECO 899', 'M.Sc. Dissertation', 12, 'C', 'P'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([[...COURSE_RESULT_COLUMNS], ...example]);
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 40 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Courses');
  const notes = XLSX.utils.aoa_to_sheet([
    ['How to fill this template'],
    [],
    ['One row per course, copied from each student\'s Final Result sheet. Replace the example rows.'],
    ['Matric No', 'The student\'s matriculation / registration number. All rows of a student go together.'],
    ['Course Code', 'e.g. ECO 811'],
    ['Course Title', 'e.g. Advanced Microeconomics'],
    ['Credit', 'Credit units, a whole number (e.g. 3).'],
    ['Grade', 'A, B, C, D, E or F.'],
    ['Semester', '1, 2, 3 or 4 (students may have 2 to 4 semesters). P for the project / thesis / dissertation.'],
    [],
    ['The student\'s courses in this file replace any courses already on their record.'],
    ['Only locked records can be updated this way; each student becomes a request to the Provost with their scanned sheet attached.'],
  ]);
  notes['!cols'] = [{ wch: 16 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, notes, 'Notes');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const str = (v: unknown) => (v == null ? '' : String(v).trim());

/** Reads the first sheet with a Matric No and Course Code header; returns courses per matric number. */
export function parseCourseResults(buf: ArrayBuffer, fileName = '') {
  const errors: CellError[] = [];
  let wb: XLSX.WorkBook;
  try {
    wb = /\.csv$/i.test(fileName) ? XLSX.read(new TextDecoder().decode(buf), { type: 'string' }) : XLSX.read(buf, { type: 'array' });
  } catch {
    return { students: new Map<string, Course[]>(), errors: [{ sheet: '-', row: 0, column: '-', message: 'The file is not a readable Excel or CSV file' }] };
  }

  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: '' });
    const h = grid.findIndex((r) => {
      const cols = r.map((c) => ALIASES[str(c).toLowerCase().replace(/\s+/g, '')]);
      return cols.includes('Matric No') && cols.includes('Course Code');
    });
    if (h < 0) continue;
    const index = new Map<string, number>();
    grid[h].forEach((c, i) => {
      const col = ALIASES[str(c).toLowerCase().replace(/\s+/g, '')];
      if (col && !index.has(col)) index.set(col, i);
    });
    for (const need of ['Credit', 'Grade', 'Semester'] as const) {
      if (!index.has(need)) errors.push({ sheet: name, row: h + 1, column: need, message: `Column "${need}" is missing` });
    }
    if (errors.length) return { students: new Map<string, Course[]>(), errors };

    const students = new Map<string, Course[]>();
    const rows = grid.slice(h + 1);
    if (rows.length > MAX_COURSE_ROWS) {
      return { students, errors: [{ sheet: name, row: 0, column: '-', message: `At most ${MAX_COURSE_ROWS} course rows per file; split it into smaller files` }] };
    }
    rows.forEach((r, i) => {
      const cell = (c: string) => str(r[index.get(c) ?? -1]);
      const matric = cell('Matric No').toUpperCase().replace(/\s+/g, '');
      if (!matric && !cell('Course Code') && !cell('Course Title')) return;
      const row = h + i + 2;
      if (!matric) {
        errors.push({ sheet: name, row, column: 'Matric No', message: 'Matric No is empty' });
        return;
      }
      const sem = cell('Semester');
      if (!sem) {
        errors.push({ sheet: name, row, column: 'Semester', message: 'Enter the semester (1–4), or P for the project / thesis' });
        return;
      }
      const p = CourseSchema.safeParse({
        code: cell('Course Code'), title: cell('Course Title'), units: cell('Credit') || undefined,
        grade: cell('Grade') || undefined, semester: PROJECT.test(sem) ? undefined : sem,
      });
      if (!p.success) {
        const iss = p.error.issues[0];
        const column = ({ code: 'Course Code', units: 'Credit', grade: 'Grade', semester: 'Semester' } as Record<string, string>)[String(iss.path[0])] ?? '-';
        const message = column === 'Course Code' ? 'Enter the course code' : column === 'Credit' ? 'Credit must be a whole number from 0 to 30'
          : column === 'Semester' ? 'Semester must be 1, 2, 3, 4 or P' : iss.message;
        errors.push({ sheet: name, row, column, message });
        return;
      }
      const list = students.get(matric) ?? [];
      const c: Course = { code: p.data.code, title: p.data.title, units: p.data.units, grade: p.data.grade, ...(p.data.semester ? { semester: p.data.semester } : {}) };
      if (list.some((x) => x.code === c.code && x.semester === c.semester)) {
        errors.push({ sheet: name, row, column: 'Course Code', message: `${c.code} is listed twice for ${matric} in the same semester` });
        return;
      }
      students.set(matric, [...list, c]);
    });
    if (students.size > MAX_STUDENTS) errors.push({ sheet: name, row: 0, column: '-', message: `At most ${MAX_STUDENTS} students per file; split it into smaller files` });
    return { students, errors };
  }
  return { students: new Map<string, Course[]>(), errors: [{ sheet: '-', row: 0, column: '-', message: 'No sheet has "Matric No" and "Course Code" columns. Use the template.' }] };
}

export type CoursePlanItem = {
  matricNo: string; name?: string; recordId?: string; degree?: string; session?: string;
  courses: Course[]; semesters: number; credits: number; points: number; fcgpa: number | null; recordedCgpa?: number | null;
  /** Why this student cannot be sent; absent when ready. */
  problem?: string;
  warning?: string;
};

const sameCourses = (a: Course[], b: Course[]) => {
  const key = (c: Course) => [c.code, c.title ?? '', c.units, c.grade ?? '', c.semester ?? ''].join('|');
  return a.length === b.length && a.map(key).sort().join() === b.map(key).sort().join();
};

/** Matches each student to their one locked record and says what would be sent. */
export async function planCourseResults(students: Map<string, Course[]>): Promise<CoursePlanItem[]> {
  const matrics = [...students.keys()];
  const found = await Student.find({ matricNo: { $in: matrics } }).select('matricNo surname otherNames').lean();
  const byMatric = new Map(found.map((s) => [s.matricNo, s]));
  const records = await GraduandRecord.find({ student: { $in: found.map((s) => s._id) } })
    .select('student locked cgpa degree session courses')
    .populate<{ session: { label: string } }>('session', 'label').lean();
  const pending = new Set((await Amendment.find({ record: { $in: records.map((r) => r._id) }, status: 'PENDING' }).select('record').lean())
    .map((a) => a.record.toString()));

  return matrics.map((matricNo): CoursePlanItem => {
    const courses = students.get(matricNo)!;
    const t = courseTotals(courses);
    const base = { matricNo, courses, semesters: new Set(courses.filter((c) => c.semester).map((c) => c.semester)).size, credits: t.credits, points: t.points, fcgpa: t.gpa };
    const s = byMatric.get(matricNo);
    if (!s) return { ...base, problem: 'No student with this Matric No' };
    const name = `${s.surname.toUpperCase()}, ${s.otherNames}`;
    const mine = records.filter((r) => r.student.equals(s._id));
    const locked = mine.filter((r) => r.locked);
    if (!locked.length) {
      return { ...base, name, problem: mine.length ? 'Record not locked yet: enter the courses on its result sheet' : 'No graduand record for this student' };
    }
    if (locked.length > 1) return { ...base, name, problem: `Has ${locked.length} locked records; add the courses on the right record's page` };
    const r = locked[0];
    const item = { ...base, name, recordId: r._id.toString(), degree: r.degree, session: r.session?.label, recordedCgpa: r.cgpa };
    if (pending.has(r._id.toString())) return { ...item, problem: 'Already has a request waiting for the Provost' };
    const current = (r.courses ?? []).map((c) => ({ code: c.code ?? '', title: c.title ?? undefined, units: c.units ?? 0, grade: c.grade ?? undefined, ...(c.semester ? { semester: c.semester } : {}) }));
    if (sameCourses(current, courses)) return { ...item, problem: 'The record already has exactly these courses' };
    const warning = t.gpa != null && r.cgpa != null && Math.abs(t.gpa - r.cgpa) > 0.01
      ? `FCGPA from the courses is ${t.gpa.toFixed(2)}; the record says ${r.cgpa.toFixed(2)}` : undefined;
    return { ...item, warning };
  });
}
