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

/**
 * Default CPGS class-of-degree bands on a 5-point CGPA scale.
 * PROVISIONAL: confirm against the official CPGS grading table for each session
 * (open question in the implementation guide) before go-live.
 */
export const DEFAULT_BANDS: { min: number; cls: ClassOfDegree }[] = [
  { min: 4.5, cls: 'DISTINCTION' },
  { min: 3.5, cls: 'CREDIT' },
  { min: 3.0, cls: 'MERIT' },
  { min: 2.5, cls: 'PASS' },
  { min: 0, cls: 'FAIL' },
];

export function expectedClass(cgpa: number): ClassOfDegree {
  return DEFAULT_BANDS.find((b) => cgpa >= b.min)!.cls;
}

/** Returns a warning message when CGPA and class of degree disagree, or null. */
export function classConsistency(cgpa: number | undefined | null, cls: ClassOfDegree | undefined | null, degreeType?: string) {
  if (cgpa == null || !cls || cls === 'NOT_APPLICABLE') return null;
  if (degreeType === 'PhD') return null;
  const exp = expectedClass(cgpa);
  return exp === cls ? null : `CGPA ${cgpa.toFixed(2)} normally gives ${CLASS_LABELS[exp]}, not ${CLASS_LABELS[cls]}`;
}

export function scoreToGrade(score: number) {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}
