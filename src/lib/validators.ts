import { z } from 'zod';
import { CLASS_OF_DEGREE } from './grading';
import { ROLES } from './rbac';

const optStr = z.string().trim().max(500).optional().transform((v) => v || undefined);
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const CourseSchema = z.object({
  code:  z.string().trim().min(2).max(20).transform((s) => s.toUpperCase()),
  title: optStr,
  units: z.coerce.number().int().min(0).max(30),
  score: z.coerce.number().min(0).max(100).optional(),
  grade: z.string().trim().toUpperCase().regex(/^[A-F]$/, 'Grade must be A–F').optional(),
});

export const GraduandRowSchema = z.object({
  matricNo:   z.string().trim().min(4, 'Matric number is required').max(30).transform((s) => s.toUpperCase()),
  surname:    z.string().trim().min(1, 'Surname is required').max(80),
  otherNames: z.string().trim().min(1, 'Other names are required').max(120),
  sex:        z.enum(['M', 'F']).optional(),
  cgpa:       z.coerce.number().min(0, 'CGPA must be 0–5').max(5, 'CGPA must be 0–5').optional(),
  classOfDegree: z.enum(CLASS_OF_DEGREE, { message: `Class must be one of ${CLASS_OF_DEGREE.join(', ')}` }),
  thesisTitle: optStr,
  supervisor:  optStr,
  sourcePage:  z.coerce.number().int().min(1).optional(),
  illegible:   z.boolean().optional(),
  remarks:     optStr,
  courses:     z.array(CourseSchema).default([]),
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
  department: objectId,
  sessions:   z.array(objectId).min(1, 'Pick at least one session'),
  estimatedSheets: z.coerce.number().int().min(0).max(100000),
  condition:  z.enum(['GOOD', 'FAIR', 'DAMAGED', 'SEVERELY_DAMAGED']),
  priority:   z.coerce.number().int().min(1).max(5),
  location:   optStr,
  notes:      optStr,
});

export { objectId };

export function firstError(err: z.ZodError) {
  const i = err.issues[0];
  return i ? `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}` : 'Invalid input';
}
