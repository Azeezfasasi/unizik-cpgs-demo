'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { esc } from '@/lib/format';
import { sendMail } from '@/lib/mail';
import { issueVerification, verificationUrl } from '@/lib/verify';
import { documentLink } from '@/lib/documents';
import type { ActionState } from '@/lib/action-state';
import { GraduandRecord, Verification } from '@/models';

const Issue = z.object({
  kind: z.enum(['STATEMENT_OF_RESULT', 'TRANSCRIPT']),
  issuedTo: z.string().trim().min(3, 'Say who the document is for').max(200),
  email: z.email().optional().or(z.literal('').transform(() => undefined)),
  validDays: z.coerce.number().int().min(30).max(3650),
});

export async function issueDocument(recordId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('transcript:issue');
    const data = Issue.parse(Object.fromEntries(fd));
    await db();
    const rec = await GraduandRecord.findById(recordId).populate<{ student: { surname: string; otherNames: string } }>('student', 'surname otherNames');
    if (!rec) missing('Record not found');
    if (!rec!.locked) fail('Only locked (final) records can be issued');
    if (rec!.illegible) fail('This record is flagged illegible; resolve it first');

    const v = await issueVerification({
      recordId, recordVersion: rec!.version, kind: data.kind, issuedTo: data.issuedTo, userId: user.id, validDays: data.validDays,
    });
    await audit(user, 'document.issue', 'Verification', v.id, undefined, { record: recordId, kind: data.kind, code: v.code, issuedTo: data.issuedTo });

    if (data.email) {
      const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
      const link = appUrl + documentLink(v.id, 7);
      await sendMail({
        to: [{ email: data.email }],
        subject: `Your ${data.kind === 'TRANSCRIPT' ? 'academic transcript' : 'statement of result'} from UNIZIK CPGS`,
        html: `<p>The College of Postgraduate Studies has issued a ${data.kind === 'TRANSCRIPT' ? 'transcript' : 'statement of result'} for <b>${esc(rec!.student.surname)} ${esc(rec!.student.otherNames)}</b>.</p>
<p><a href="${link}" style="color:#009689;font-weight:bold">Download the document (link valid 7 days)</a></p>
<p>Verification code: <b>${esc(v.code)}</b><br/>Anyone can confirm it at <a href="${verificationUrl(v.code)}">${verificationUrl(v.code)}</a>.</p>`,
      });
      await audit(user, 'document.email', 'Verification', v.id, undefined, { to: data.email });
    }
    return { ok: true, message: `Issued with verification code ${v.code}.`, data: { code: v.code, id: v.id } };
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
