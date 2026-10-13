import { db } from '@/lib/db';
import { normaliseCode, verificationUrl } from '@/lib/verify';
import { json, out, pageMeta, paging, requireRead, v1 } from '@/lib/v1';
import { Verification } from '@/models';

/** Register of issued statements and transcripts. Query: code, status (valid|revoked|expired), page, limit. */
export const GET = v1(async (req: Request) => {
  await requireRead('transcript:issue', 'audit:read');
  await db();
  const url = new URL(req.url);
  const filter: Record<string, unknown> = {};
  const code = url.searchParams.get('code');
  if (code) filter.code = normaliseCode(code) ?? '__none__';
  const status = url.searchParams.get('status');
  if (status === 'revoked') filter.revoked = true;
  if (status === 'valid') Object.assign(filter, { revoked: false, expiresAt: { $gt: new Date() } });
  if (status === 'expired') Object.assign(filter, { revoked: false, expiresAt: { $lte: new Date() } });
  const { page, limit, skip } = paging(url);
  const [total, rows] = await Promise.all([
    Verification.countDocuments(filter),
    Verification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-hmac').populate('issuedBy', 'name')
      .populate({ path: 'record', select: 'degree student', populate: { path: 'student', select: 'matricNo surname otherNames' } }).lean(),
  ]);
  return json({
    data: rows.map((v) => ({ ...out(v), verifyUrl: verificationUrl(v.code), pdfUrl: `/api/v1/documents/${v._id}/pdf` })),
    meta: pageMeta(page, limit, total),
  });
});
