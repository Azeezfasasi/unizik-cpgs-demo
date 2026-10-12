import 'server-only';
import { headers } from 'next/headers';
import { db } from './db';
import { audit } from './audit';
import { verifyLimiter } from './ratelimit';
import { hmacValid, normaliseCode } from './verify';
import { CLASS_LABELS, type ClassOfDegree } from './grading';
import { GraduandRecord, Verification } from '@/models';

export type LookupResult =
  | { status: 'RATE_LIMITED' | 'INVALID_CODE' | 'NOT_FOUND' }
  | {
      status: 'VALID' | 'REVOKED' | 'EXPIRED' | 'SUPERSEDED';
      code: string; kind: string; name: string; degree: string; classOfDegree: string;
      session: string; senateApprovalDate: Date | null; issuedAt: Date; expiresAt: Date; revokedAt?: Date | null;
    };

type Populated = {
  version: number; degree: string; classOfDegree?: string; senateApprovalDate?: Date;
  student: { surname: string; otherNames: string }; session: { label: string };
};

/**
 * Public verification lookup. Returns only what an employer needs to compare against
 * the document: never scores, the scan or contact details.
 */
export async function lookupCode(raw: string): Promise<LookupResult> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (!(await verifyLimiter.limit(ip)).success) return { status: 'RATE_LIMITED' };
  const code = normaliseCode(raw);
  if (!code) return { status: 'INVALID_CODE' };

  await db();
  const v = await Verification.findOneAndUpdate({ code }, { $inc: { lookups: 1 } }, { returnDocument: 'after' }).lean();
  await audit(null, 'verify.lookup', 'Verification', v?._id.toString(), undefined, { code, found: !!v });
  if (!v || !hmacValid(v)) return { status: 'NOT_FOUND' };

  const r = await GraduandRecord.findById(v.record)
    .populate('student', 'surname otherNames').populate('session', 'label').lean<Populated>();
  if (!r) return { status: 'NOT_FOUND' };

  const status = v.revoked ? 'REVOKED' : r.version !== v.recordVersion ? 'SUPERSEDED' : v.expiresAt < new Date() ? 'EXPIRED' : 'VALID';
  return {
    status, code, kind: v.kind === 'TRANSCRIPT' ? 'Academic transcript' : 'Statement of result',
    name: `${r.student.surname.toUpperCase()}, ${r.student.otherNames}`, degree: r.degree,
    classOfDegree: r.classOfDegree ? CLASS_LABELS[r.classOfDegree as ClassOfDegree] : '—',
    session: r.session.label, senateApprovalDate: r.senateApprovalDate ?? null,
    issuedAt: v.createdAt, expiresAt: v.expiresAt, revokedAt: v.revokedAt ?? null,
  };
}
