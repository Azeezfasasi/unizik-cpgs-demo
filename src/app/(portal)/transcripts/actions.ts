'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission, type CurrentUser } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { esc } from '@/lib/format';
import { sendMail } from '@/lib/mail';
import { issueVerification, verificationUrl } from '@/lib/verify';
import { buildDocumentPdf, documentLink } from '@/lib/documents';
import type { ActionState } from '@/lib/action-state';
import { GraduandRecord, Verification } from '@/models';

/** At most this many addresses per send, so the form cannot be used for bulk mail. */
const MAX_RECIPIENTS = 10;

const Issue = z.object({
  kind: z.enum(['STATEMENT_OF_RESULT', 'TRANSCRIPT']),
  issuedTo: z.string().trim().min(3, 'Say who the document is for').max(200),
  email: z.string().optional(),
  recipients: z.string().optional(),
  validDays: z.coerce.number().int().min(30).max(3650),
});

/**
 * Email addresses from free text: separated by commas, semicolons, spaces or new lines.
 * Lower-cased and de-duplicated; any invalid address stops the action and is named.
 */
function parseRecipients(...texts: (string | undefined)[]) {
  const list = [...new Set(texts.join(' ').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const bad = list.filter((e) => !z.email().safeParse(e).success);
  if (bad.length) fail(`Not a valid email address: ${bad.join(', ')}`);
  if (list.length > MAX_RECIPIENTS) fail(`Send to at most ${MAX_RECIPIENTS} addresses at a time`);
  return list;
}

const kindLabel = (kind: string) => (kind === 'TRANSCRIPT' ? 'academic transcript' : 'statement of result');

/**
 * Emails an issued document to each recipient separately (recipients never see each other's
 * addresses). The PDF is attached, with a download link that ends no later than the document.
 */
async function emailDocument(user: CurrentUser, verificationId: string, recipients: string[]) {
  const doc = await buildDocumentPdf(verificationId);
  if ('error' in doc) fail(doc.error ?? 'Document not found');
  const { bytes, filename, v } = doc as Exclude<typeof doc, { error: string }>;
  const rec = await GraduandRecord.findById(v.record).populate<{ student: { surname: string; otherNames: string } }>('student', 'surname otherNames').lean();
  const name = rec ? `${rec.student.surname.toUpperCase()}, ${rec.student.otherNames}` : 'the graduand';
  const daysLeft = Math.max(1, Math.min(7, Math.floor((v.expiresAt.getTime() - Date.now()) / 864e5)));
  const href = (process.env.APP_URL ?? 'http://localhost:3000') + documentLink(verificationId, daysLeft);

  const sent: string[] = [];
  const failed: { email: string; reason: string }[] = [];
  for (const email of recipients) {
    const res = await sendMail({
      to: [{ email }],
      subject: `${kindLabel(v.kind).replace(/^./, (c) => c.toUpperCase())} for ${name} from UNIZIK CPGS`,
      html: `<p>The College of Postgraduate Studies, Nnamdi Azikiwe University, has issued a ${kindLabel(v.kind)} for <b>${esc(name)}</b> (issued to ${esc(v.issuedTo)}).</p>
<p>The document is attached as a PDF. You can also <a href="${href}" style="color:#009689;font-weight:bold">download it here</a> (link valid ${daysLeft} day${daysLeft === 1 ? '' : 's'}).</p>
<p>Verification code: <b>${esc(v.code)}</b><br/>Anyone can confirm the document is genuine at <a href="${verificationUrl(v.code)}">${verificationUrl(v.code)}</a>.</p>`,
      attachments: [{ name: filename, content: bytes }],
    });
    if (res.sent) sent.push(email);
    else failed.push({ email, reason: res.reason });
  }
  await audit(user, 'document.email', 'Verification', verificationId, undefined, { code: v.code, to: sent, failed });
  return { sent, failed };
}

/** "Emailed to a, b. Not sent to c: reason." with failures grouped by reason. */
function emailSummary({ sent, failed }: { sent: string[]; failed: { email: string; reason: string }[] }) {
  const byReason = new Map<string, string[]>();
  for (const f of failed) byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.email]);
  return [
    sent.length ? `Emailed to ${sent.join(', ')}.` : '',
    ...[...byReason].map(([reason, emails]) => `Not sent to ${emails.join(', ')}: ${reason}.`),
  ].filter(Boolean).join(' ');
}

const pdfLinks = (id: string) => ({ download: `/api/documents/${id}?download=1`, view: `/api/documents/${id}` });

export async function issueDocument(recordId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('transcript:issue');
    const data = Issue.parse(Object.fromEntries(fd));
    const recipients = parseRecipients(data.email, data.recipients);
    await db();
    const rec = await GraduandRecord.findById(recordId).populate<{ student: { surname: string; otherNames: string } }>('student', 'surname otherNames');
    if (!rec) missing('Record not found');
    if (!rec!.locked) fail('Only locked (final) records can be issued');
    if (rec!.illegible) fail('This record is flagged illegible; resolve it first');

    const v = await issueVerification({
      recordId, recordVersion: rec!.version, kind: data.kind, issuedTo: data.issuedTo, userId: user.id, validDays: data.validDays,
    });
    await audit(user, 'document.issue', 'Verification', v.id, undefined, { record: recordId, kind: data.kind, code: v.code, issuedTo: data.issuedTo });

    const mail = recipients.length ? await emailDocument(user, v.id, recipients) : null;
    return {
      ok: true,
      message: `Issued with verification code ${v.code}.${mail ? ` ${emailSummary(mail)}` : ''}`,
      data: { code: v.code, id: v.id, ...pdfLinks(v.id) },
    };
  });
}

/** Sends an already issued (valid) document to one or more addresses. */
export async function sendDocument(verificationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('transcript:issue');
    const recipients = parseRecipients(String(fd.get('recipients') ?? ''));
    if (!recipients.length) fail('Enter at least one email address');
    await db();
    const v = await Verification.findById(verificationId).lean();
    if (!v) missing('Document not found');
    if (v!.revoked) fail('This document has been revoked');
    if (v!.expiresAt < new Date()) fail('This document has expired; issue a new one');

    const mail = await emailDocument(user, verificationId, recipients);
    return {
      ok: mail.sent.length > 0,
      message: emailSummary(mail),
      status: mail.sent.length ? undefined : 502,
    };
  });
}

export async function revokeDocument(verificationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('transcript:issue');
    const reason = String(fd.get('reason') ?? '').trim();
    if (reason.length < 5) fail('Give a reason for revoking');
    await db();
    const v = await Verification.findById(verificationId);
    if (!v) missing('Document not found');
    if (v!.revoked) fail('Already revoked');
    v!.set({ revoked: true, revokedAt: new Date(), revokedReason: reason });
    await v!.save();
    await audit(user, 'document.revoke', 'Verification', verificationId, { revoked: false }, { revoked: true, reason, code: v!.code });
    return { ok: true, message: `Code ${v!.code} revoked. The verification page now shows it as revoked.` };
  });
}
