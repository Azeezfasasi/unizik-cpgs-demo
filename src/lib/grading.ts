export const CLASS_OF_DEGREE = ['DISTINCTION', 'CREDIT', 'MERIT', 'PASS', 'FAIL', 'NOT_APPLICABLE'] as const;
export type ClassOfDegree = (typeof CLASS_OF_DEGREE)[number];

export const CLASS_LABELS: Record<ClassOfDegree, string> = {
  DISTINCTION: 'Distinction',
  CREDIT: 'Credit',
  MERIT: 'Merit',
  PASS: 'Pass',
  FAIL: 'Fail',
  NOT_APPLICABLE: 'Not applicable',
};

export type Band = { min: number; cls: ClassOfDegree };

/** Classes that carry a CGPA band, highest first. Fail always starts at 0. */
export const BANDED_CLASSES = ['DISTINCTION', 'CREDIT', 'MERIT', 'PASS', 'FAIL'] as const;

/**
 * Starting class-of-degree bands on a 5-point CGPA scale, used until the administrator
 * saves the official CPGS table in Academic structure (stored in the database).
 */
export const DEFAULT_BANDS: Band[] = [
  { min: 4.5, cls: 'DISTINCTION' },
  { min: 3.5, cls: 'CREDIT' },
  { min: 3.0, cls: 'MERIT' },
  { min: 2.5, cls: 'PASS' },
  { min: 0, cls: 'FAIL' },
];

export function expectedClass(cgpa: number, bands: Band[] = DEFAULT_BANDS): ClassOfDegree {
  return bands.find((b) => cgpa >= b.min)?.cls ?? 'FAIL';
}

/** Returns a warning message when CGPA and class of degree disagree, or null. */
export function classConsistency(cgpa: number | undefined | null, cls: ClassOfDegree | undefined | null, degreeType?: string,
  bands: Band[] = DEFAULT_BANDS) {
  if (cgpa == null || !cls || cls === 'NOT_APPLICABLE') return null;
  if (degreeType === 'PhD') return null;
  const exp = expectedClass(cgpa, bands);
  return exp === cls ? null : `CGPA ${cgpa.toFixed(2)} normally gives ${CLASS_LABELS[exp]}, not ${CLASS_LABELS[cls]}`;
}

export function scoreToGrade(score: number) {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}

/** CPGS grade points (5-point scale): also how the project grade is recorded on the PG Board result list. */
export const GRADE_POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 } as const;
export type Letter = keyof typeof GRADE_POINTS;

/** Letter for a whole grade point (5 → A … 0 → F), or null. */
export function gradeLetter(points?: number | null): Letter | null {
  if (points == null || !Number.isInteger(points) || points < 0 || points > 5) return null;
  return 'FEDCBA'[points] as Letter;
}

/** Project grade as shown to people, e.g. "5.00 (A)". */
export function fmtProjectGrade(points?: number | null) {
  if (points == null) return '—';
  const l = gradeLetter(points);
  return l ? `${points.toFixed(2)} (${l})` : points.toFixed(2);
}

type GradedCourse = { units?: number | null; grade?: string | null; semester?: number | null };

/** GPA of the courses taken in one semester, from units and letter grades; null when none are graded. */
export function semesterGpa(courses: GradedCourse[], semester: number) {
  let units = 0, points = 0;
  for (const c of courses) {
    const gp = c.grade ? GRADE_POINTS[c.grade as Letter] : undefined;
    if (c.semester !== semester || !c.units || gp == null) continue;
    units += c.units;
    points += c.units * gp;
  }
  return units ? Math.round((points / units) * 100) / 100 : null;
}

/** Warnings where a semester GPA worked out from the courses differs from the one recorded. */
export function semesterGpaWarnings(courses: GradedCourse[], recorded: number[] = []) {
  const ORD = ['1st', '2nd', '3rd', '4th'];
  return recorded.flatMap((gpa, i) => {
    const fromCourses = semesterGpa(courses, i + 1);
    return fromCourses != null && Math.abs(fromCourses - gpa) > 0.01
      ? [`${ORD[i]} semester GPA from the courses is ${fromCourses.toFixed(2)}, but ${gpa.toFixed(2)} was recorded`]
      : [];
  });
}

/** Choices for a project grade input: value is the grade point, label e.g. "5.00 (A)". */
export const PROJECT_OPTIONS = Object.entries(GRADE_POINTS).map(([l, p]) => [String(p), `${p.toFixed(2)} (${l})`] as const);

/**
 * Courses grouped by semester in order (1st, 2nd, ...), with courses whose semester was not
 * recorded last (semester null). A single group when no semester is recorded at all.
 */
export function semesterGroups<T extends { semester?: number | null }>(courses: T[]) {
  const by = new Map<number | null, T[]>();
  for (const c of courses) {
    const k = c.semester ?? null;
    by.set(k, [...(by.get(k) ?? []), c]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a ?? 99) - (b ?? 99))
    .map(([semester, list]) => ({ semester, courses: list }));
}
