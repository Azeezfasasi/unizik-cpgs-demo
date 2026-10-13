import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { verificationUrl } from '@/lib/verify';
import { apiError, assertId, fromAction, json, out, param, readJson, requireRead, toForm, v1, type RouteCtx } from '@/lib/v1';
import { issueDocument } from '@/app/(portal)/transcripts/actions';
import { GraduandRecord, Verification } from '@/models';

const docOut = (v: Record<string, unknown>) => ({ ...out(v), verifyUrl: verificationUrl(String(v.code)), pdfUrl: `/api/v1/documents/${v._id}/pdf` });

/** Statements and transcripts issued for this record. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  await requireRead('transcript:issue', 'audit:read');
  const id = await param(ctx);
  assertId(id, 'Record');
  await db();
  const docs = await Verification.find({ record: id }).sort({ createdAt: -1 }).populate('issuedBy', 'name').lean();
  return json({ data: docs.map((d) => docOut(d as never)) });
});

/** Issue a statement of result or transcript. Body: { kind, issuedTo, validDays, email? }. */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('transcript:issue');
  const id = await param(ctx);
  assertId(id, 'Record');
  await db();
  if (!(await GraduandRecord.exists({ _id: id }))) return apiError(404, 'Record not found');
  const res = await issueDocument(id, {}, toForm(await readJson(req)));
  if (!res.ok) return fromAction(res);
  const v = await Verification.findById(res.data?.id).populate('issuedBy', 'name').lean();
  return json({ ok: true, message: res.message, data: v ? docOut(v as never) : null }, 201);
});
