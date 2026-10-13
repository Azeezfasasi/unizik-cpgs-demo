import 'server-only';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { renderResultDocument } from './pdf';
import { verificationUrl } from './verify';
import { GraduandRecord, Verification } from '@/models';

function sign(verificationId: string, exp: number) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET!).update(`doc:${verificationId}:${exp}`).digest('base64url');
}

/** HMAC-signed download link for an issued document, valid for `days`. */
export function documentLink(verificationId: string, days = 7) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  return `/api/documents/${verificationId}?exp=${exp}&token=${sign(verificationId, exp)}`;
}

export function documentLinkValid(verificationId: string, exp: number, token: string) {
  if (!exp || exp < Date.now() / 1000) return false;
  const a = Buffer.from(sign(verificationId, exp)), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type Populated = {
  version: number; degree: string; cgpa?: number; classOfDegree?: string; thesisTitle?: string; senateApprovalDate?: Date;
  semesterGpas?: number[]; projectGrade?: number; effectiveDate?: Date;
  courses: { code: string; title?: string; units?: number; score?: number; grade?: string }[];
  student: { matricNo: string; surname: string; otherNames: string; sex?: string };
  department: { name: string; faculty: { name: string } }; session: { label: string };
};

/** Renders the PDF for an issued document; refuses revoked or superseded ones. */
export async function buildDocumentPdf(verificationId: string) {
  if (!Types.ObjectId.isValid(verificationId)) return { error: 'Not found' as const };
  const v = await Verification.findById(verificationId).lean();
  if (!v) return { error: 'Not found' as const };
  if (v.revoked) return { error: 'This document has been revoked' as const };
  const r = await GraduandRecord.findById(v.record)
    .populate('student', 'matricNo surname otherNames sex')
    .populate({ path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } })
    .populate('session', 'label')
    .lean<Populated>();
  if (!r) return { error: 'Not found' as const };
  if (r.version !== v.recordVersion) return { error: 'The record has been amended since this document was issued' as const };

  const bytes = await renderResultDocument({
    kind: v.kind as 'STATEMENT_OF_RESULT' | 'TRANSCRIPT', code: v.code, url: verificationUrl(v.code),
    issuedTo: v.issuedTo, issuedAt: v.createdAt, expiresAt: v.expiresAt,
    student: { name: `${r.student.surname.toUpperCase()}, ${r.student.otherNames}`, matricNo: r.student.matricNo, sex: r.student.sex },
    degree: r.degree, department: r.department.name, faculty: r.department.faculty?.name ?? '', session: r.session.label,
    cgpa: r.cgpa, classOfDegree: r.classOfDegree, thesisTitle: r.thesisTitle, senateApprovalDate: r.senateApprovalDate,
    semesterGpas: r.semesterGpas, projectGrade: r.projectGrade, effectiveDate: r.effectiveDate,
    version: r.version, courses: r.courses ?? [],
  });
  return { bytes, filename: `${v.kind === 'TRANSCRIPT' ? 'transcript' : 'statement'}-${r.student.matricNo}-${v.code}.pdf`, v };
}
