import 'server-only';
import { Types } from 'mongoose';
import { scopeFilter, type CurrentUser } from './auth';
import { Department, GraduandRecord, Student } from '@/models';

export type SearchParams = {
  q?: string; faculty?: string; department?: string; programme?: string; session?: string;
  cls?: string; origin?: string; locked?: string; page?: string;
};

const oid = (s?: string) => (s && Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : undefined);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds the GraduandRecord filter for a search, always inside the user's department/faculty scope. */
export async function recordFilter(user: CurrentUser, p: SearchParams) {
  const and: Record<string, unknown>[] = [await scopeFilter(user)];
  const q = p.q?.trim().slice(0, 100);

  if (q) {
    const ors: Record<string, unknown>[] = [];
    if (/\d/.test(q)) {
      const students = await Student.find({ matricNo: { $regex: `^${escapeRegex(q.toUpperCase())}` } }).select('_id').limit(500).lean();
      ors.push({ student: { $in: students.map((s) => s._id) } });
    }
    const named = await Student.find({ $text: { $search: q } }).select('_id').limit(500).lean();
    if (named.length) ors.push({ student: { $in: named.map((s) => s._id) } });
    const theses = await GraduandRecord.find({ $text: { $search: q } }).select('_id').limit(500).lean();
    if (theses.length) ors.push({ _id: { $in: theses.map((t) => t._id) } });
    and.push(ors.length ? { $or: ors } : { _id: null });
  }

  if (oid(p.faculty)) {
    const depts = await Department.find({ faculty: oid(p.faculty) }).select('_id').lean();
    and.push({ department: { $in: depts.map((d) => d._id) } });
  }
  if (oid(p.department)) and.push({ department: oid(p.department) });
  if (oid(p.programme)) and.push({ programme: oid(p.programme) });
  if (oid(p.session)) and.push({ session: oid(p.session) });
  if (p.cls) and.push({ classOfDegree: p.cls });
  if (p.origin === 'LEGACY' || p.origin === 'ONLINE') and.push({ origin: p.origin });
  if (p.locked === '1') and.push({ locked: true });
  if (p.locked === '0') and.push({ locked: false });
  return { $and: and };
}

export type RecordRow = {
  _id: Types.ObjectId; cgpa?: number; classOfDegree?: string; origin: string; locked: boolean; degree: string;
  thesisTitle?: string; senateApprovalDate?: Date; version: number;
  semesterGpas?: number[]; projectGrade?: number; effectiveDate?: Date; boardMeeting?: string;
  student: { matricNo: string; surname: string; otherNames: string; sex?: string };
  department: { name: string; code: string }; session: { label: string };
  programme?: { name: string; degreeType: string } | null;
};

export function findRecords(filter: object) {
  return GraduandRecord.find(filter)
    .populate('student', 'matricNo surname otherNames sex')
    .populate('department', 'name code')
    .populate('programme', 'name degreeType')
    .populate('session', 'label');
}
