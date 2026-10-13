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
