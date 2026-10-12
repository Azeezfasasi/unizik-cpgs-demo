'use server';

import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail } from '@/lib/errors';
import { withTxn } from '@/lib/txn';
import { CLASS_OF_DEGREE } from '@/lib/grading';
import { sendMail, link } from '@/lib/mail';
import type { ActionState } from '@/lib/action-state';
import { Amendment, GraduandRecord, StoredFile, User, Verification } from '@/models';

/** Fields of a locked record that may be corrected through an amendment. */
type AmendableField = 'cgpa' | 'classOfDegree' | 'thesisTitle' | 'supervisor' | 'senateApprovalDate' | 'remarks';
const FIELDS: AmendableField[] = ['cgpa', 'classOfDegree', 'thesisTitle', 'supervisor', 'senateApprovalDate', 'remarks'];

function normalise(field: AmendableField, raw: string) {
  const v = raw.trim();
  if (!v) return null;
  if (field === 'cgpa') {
    const n = Number(v);
    if (isNaN(n) || n < 0 || n > 5) fail('CGPA must be between 0 and 5');
    return Math.round(n * 100) / 100;
  }
  if (field === 'classOfDegree' && !(CLASS_OF_DEGREE as readonly string[]).includes(v)) fail('Invalid class of degree');
  if (field === 'senateApprovalDate') {
    const d = new Date(v);
    if (isNaN(d.getTime())) fail('Invalid Senate date');
    return d.toISOString().slice(0, 10);
  }
  return v.slice(0, 500);
}

function current(rec: Record<string, unknown>, field: AmendableField) {
  const v = rec[field];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v ?? null;
}

export async function requestAmendment(recordId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('amendment:request');
    await db();
    const rec = await GraduandRecord.findById(recordId).lean();
    if (!rec) fail('Record not found');
    if (!rec!.locked) fail('Unlocked records are corrected on their sheet, not by amendment');
    if (await Amendment.exists({ record: recordId, status: 'PENDING' })) fail('This record already has a pending amendment');

    const changes = FIELDS.flatMap((f) => {
      if (!fd.has(f)) return [];
      const to = normalise(f, String(fd.get(f)));
      const from = current(rec as unknown as Record<string, unknown>, f);
      return String(to ?? '') === String(from ?? '') ? [] : [{ field: f, from, to }];
    });
    if (!changes.length) fail('Change at least one value');
    const reason = String(fd.get('reason') ?? '').trim();
    if (reason.length < 10) fail('Explain the reason for the correction (at least 10 characters)');
    const evidence = String(fd.get('evidence') ?? '');
    if (!evidence) fail('Upload the evidence (e.g. Senate extract or corrected signed sheet)');
    const file = await StoredFile.findOne({ _id: evidence, purpose: 'AMENDMENT_EVIDENCE', uploadedBy: user.id }).lean();
    if (!file) fail('Evidence file not found');

    const a = await Amendment.create({ record: recordId, changes, reason, evidence, requestedBy: user.id });
    await audit(user, 'amendment.request', 'Amendment', a.id, undefined, { record: recordId, changes, reason });

    const provosts = await User.find({ role: 'PROVOST', isActive: true }).select('name email').lean();
    await sendMail({
      to: provosts.map((p) => ({ email: p.email, name: p.name })),
      subject: 'Amendment to a locked result awaits your approval',
      html: `<p>The Head of Records has requested a correction to a locked graduand record.</p>${link('/amendments', 'Review amendments')}`,
    });
    return { ok: true, message: 'Amendment sent to the Provost for approval.' };
  });
}

export async function decideAmendment(amendmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('amendment:approve');
    const approve = fd.get('decision') === 'approve';
    const comment = String(fd.get('comment') ?? '').trim();
    if (!approve && comment.length < 5) fail('Give a reason for rejecting');

    let revoked = 0;
    await withTxn(async (session) => {
      const a = await Amendment.findById(amendmentId).session(session);
      if (!a || a.status !== 'PENDING') fail('Amendment is not pending');
      if (a!.requestedBy.equals(user.id)) fail('You cannot approve your own request');
      a!.set({ status: approve ? 'APPROVED' : 'REJECTED', decidedBy: user.id, decidedAt: new Date(), decisionComment: comment || undefined });
      await a!.save({ session });
      if (!approve) return;

      const rec = await GraduandRecord.findById(a!.record).session(session);
      if (!rec) fail('Record not found');
      const snapshot = Object.fromEntries(FIELDS.map((f) => [f, current(rec!.toObject(), f)]));
      rec!.history.push({ version: rec!.version, data: snapshot, amendment: a!._id, at: new Date() });
      for (const c of a!.changes) {
        const f = c.field as AmendableField;
        rec!.set(f, f === 'senateApprovalDate' && c.to ? new Date(c.to as string) : c.to ?? undefined);
      }
      rec!.version += 1;
      await rec!.save({ session });

      // Documents issued against the old version no longer match the record.
      const res = await Verification.updateMany(
        { record: rec!._id, revoked: false },
        { $set: { revoked: true, revokedAt: new Date(), revokedReason: `Superseded by amendment (record version ${rec!.version})` } },
        { session: session ?? undefined },
      );
      revoked = res.modifiedCount;
    });

    await audit(user, approve ? 'amendment.approve' : 'amendment.reject', 'Amendment', amendmentId, { status: 'PENDING' },
      { status: approve ? 'APPROVED' : 'REJECTED', comment, documentsRevoked: revoked });
    return { ok: true, message: approve ? `Amendment applied.${revoked ? ` ${revoked} issued document(s) revoked automatically.` : ''}` : 'Amendment rejected.' };
  });
}

