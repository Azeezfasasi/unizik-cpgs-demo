import { z } from 'zod';
import { CLASS_OF_DEGREE, GRADE_POINTS, type Letter } from './grading';
import { ROLES } from './rbac';

/** "1", "1st", "First", "Sem 1" → 1; anything else is left for the validator to reject. */
function semesterNumber(v: string) {
  const t = v.trim().toLowerCase();
  if (!t) return undefined;
  const words = ['first', 'second', 'third', 'fourth'].indexOf(t.replace(/\s*sem(ester)?$/, ''));
  if (words >= 0) return words + 1;
  const m = t.match(/^(?:sem(?:ester)?\s*)?([1-4])(?:st|nd|rd|th)?(?:\s*sem(?:ester)?)?$/);
  return m ? Number(m[1]) : v;
}

const optStr = z.string().trim().max(500).optional().transform((v) => v || undefined);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const CourseSchema = z.object({
  code:  z.string().trim().min(2).max(20).transform((s) => s.toUpperCase()),
  title: optStr,
  units: z.coerce.number().int().min(0).max(30),
  score: z.coerce.number().min(0).max(100).optional(),
  grade: z.string().trim().toUpperCase().regex(/^[A-F]$/, 'Grade must be A–F').optional(),
  /** Semester the course was taken in (1–4), as on the semester result sheets. */
  semester: z.preprocess(
    (v) => (typeof v === 'string' ? semesterNumber(v) : v),
    z.coerce.number({ message: 'Semester must be 1–4' }).int('Semester must be 1–4').min(1, 'Semester must be 1–4').max(4, 'Semester must be 1–4'),
  ).optional(),
});

const gpa = (label: string) => z.coerce.number({ message: `${label} must be a number` })
  .min(0, `${label} must be 0–5`).max(5, `${label} must be 0–5`);

/** A calendar day as YYYY-MM-DD, not in the future. */
const pastDay = (label: string) => z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (DD/MM/YYYY)`)
  .refine((s) => !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), `${label} is not a valid date`)
  .refine((s) => new Date(s) <= new Date(), `${label} cannot be in the future`)
  .transform((s) => new Date(s));

export const GraduandRowSchema = z.object({
  matricNo:   z.string().trim().min(4, 'Matric number is required').max(30).transform((s) => s.toUpperCase()),
  surname:    z.string().trim().min(1, 'Surname is required').max(80),
  otherNames: z.string().trim().min(1, 'Other names are required').max(120),
  sex:        z.enum(['M', 'F']).optional(),
  cgpa:       gpa('CGPA').optional(),
  /** Left out: worked out from the CGPA with the grading bands when the row is saved. */
  classOfDegree: z.enum(CLASS_OF_DEGREE, { message: `Class must be one of ${CLASS_OF_DEGREE.join(', ')}` }).optional(),
  semesterGpas: z.array(gpa('Semester GPA')).max(4, 'At most 4 semester GPAs').default([]),
  /** Whole grade point (5 = A, 4 = B, 3 = C, 2 = D, 1 = E, 0 = F); the letter is accepted too. */
  projectGrade: z.preprocess(
    (v) => (typeof v === 'string' && /^[A-F]$/i.test(v.trim()) ? GRADE_POINTS[v.trim().toUpperCase() as Letter] : v),
    z.coerce.number({ message: 'Project grade must be a grade point or letter' })
      .int('Project grade must be a whole grade point: 5 = A, 4 = B, 3 = C, 2 = D, 1 = E')
      .min(0, 'Project grade must be 0–5').max(5, 'Project grade must be 0–5'),
  ).optional(),
  effectiveDate: pastDay('Effective date of graduation').optional(),
  /** Stored as the meeting alone ("63rd"), so "63rd PG Board Meeting" and "63rd" are the same. */
  boardMeeting: z.string().trim().max(60).optional()
    .transform((v) => v?.replace(/\s*(p\.?\s*g\.?\s*)?board(\s*meeting)?\s*$/i, '').trim() || undefined),
  thesisTitle: optStr,
  supervisor:  optStr,
  sourcePage:  z.coerce.number().int().min(1).optional(),
  illegible:   z.boolean().optional(),
  remarks:     optStr,
  courses:     z.array(CourseSchema).default([]),
}).refine((r) => r.cgpa != null || r.classOfDegree, {
  path: ['cgpa'], message: 'Give the CGPA (FCGPA) or the class of degree',
});
export type GraduandRow = z.infer<typeof GraduandRowSchema>;

export const PasswordSchema = z.string()
  .min(12, 'Use at least 12 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

export const UserCreateSchema = z.object({
  name:  z.string().trim().min(3).max(120),
  email: z.email().trim().toLowerCase(),
  role:  z.enum(ROLES),
  department: objectId.optional().or(z.literal('').transform(() => undefined)),
  faculty:    objectId.optional().or(z.literal('').transform(() => undefined)),
});

export const BatchSchema = z.object({
  boxCode:    z.string().trim().toUpperCase().regex(/^CRR-BOX-\d{4,}$/, 'Use the format CRR-BOX-0001'),
  /** One or more departments, unless the box covers all departments (allDepartments). */
  departments: z.array(objectId).default([]),
  allDepartments: z.boolean().default(false),
  sessions:   z.array(objectId).min(1, 'Pick at least one session'),
  estimatedSheets: z.coerce.number().int().min(0).max(100000),
  condition:  z.enum(['GOOD', 'FAIR', 'DAMAGED', 'SEVERELY_DAMAGED']),
  priority:   z.coerce.number().int().min(1).max(5),
  location:   optStr,
  notes:      optStr,
}).refine((b) => b.allDepartments || b.departments.length > 0, {
  path: ['departments'], message: 'Pick at least one department, or tick "All departments" for a PG Board list',
});

export { objectId };

export function firstError(err: z.ZodError) {
  const i = err.issues[0];
  return i ? `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}` : 'Invalid input';
}
