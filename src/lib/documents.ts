import 'server-only';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { renderResultDocument, type DocumentData } from './pdf';
import { DEFAULT_DOCUMENT_SETTINGS, getDocumentSettings } from './document-settings';
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
  version: number; degree: string; cgpa?: number; classOfDegree?: string; senateApprovalDate?: Date;
  effectiveDate?: Date; boardMeeting?: string;
  courses: { code: string; title?: string; units?: number; grade?: string; semester?: number }[];
  student: DocumentData['student'];
  department: { name: string; faculty: { name: string } }; session: { label: string };
  programme: { name: string; degreeType: string } | null;
};

/** Renders the PDF for an issued document; refuses revoked or superseded ones. */
export async function buildDocumentPdf(verificationId: string) {
  if (!Types.ObjectId.isValid(verificationId)) return { error: 'Not found' as const };
  const v = await Verification.findById(verificationId).lean();
  if (!v) return { error: 'Not found' as const };
  if (v.revoked) return { error: 'This document has been revoked' as const };
  const r = await GraduandRecord.findById(v.record)
    .populate('student', 'matricNo surname otherNames sex phone email address modeOfStudy dateRegistered admission')
    .populate({ path: 'department', select: 'name faculty', populate: { path: 'faculty', select: 'name' } })
    .populate('session', 'label')
    .populate('programme', 'name degreeType')
    .lean<Populated>();
  if (!r) return { error: 'Not found' as const };
  if (r.version !== v.recordVersion) return { error: 'The record has been amended since this document was issued' as const };

  // Courses in semester order, as on the record.
  const courses = [...(r.courses ?? [])].sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99));
  const bytes = await renderResultDocument({
    kind: v.kind as 'STATEMENT_OF_RESULT' | 'TRANSCRIPT', code: v.code, url: verificationUrl(v.code),
    reference: v.reference ?? v.code, issuedTo: v.issuedTo, issuedToAddress: v.issuedToAddress,
    // The letterhead in force when issued; documents issued before it was kept use the current one.
    issuedAt: v.createdAt, expiresAt: v.expiresAt,
    settings: { ...DEFAULT_DOCUMENT_SETTINGS, ...(v.letterhead && typeof v.letterhead === 'object' ? v.letterhead : await getDocumentSettings()) },
    student: r.student,
    programme: r.programme?.name ?? r.degree, degreeType: r.programme?.degreeType ?? '',
    department: r.department.name, faculty: r.department.faculty?.name ?? '', session: r.session.label,
    cgpa: r.cgpa, classOfDegree: r.classOfDegree, boardApprovalDate: r.senateApprovalDate,
    boardMeeting: r.boardMeeting, effectiveDate: r.effectiveDate,
    version: r.version, courses,
  });
  return { bytes, filename: `${v.kind === 'TRANSCRIPT' ? 'transcript' : 'statement'}-${r.student.matricNo}-${v.code}.pdf`, v };
}
