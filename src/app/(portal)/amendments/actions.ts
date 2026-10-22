'use server';

import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { withTxn } from '@/lib/txn';
import { z } from 'zod';
import { CLASS_OF_DEGREE } from '@/lib/grading';
import { CourseSchema } from '@/lib/validators';
import { sendMail, link } from '@/lib/mail';
import type { ActionState } from '@/lib/action-state';
import { Amendment, GraduandRecord, StoredFile, User, Verification } from '@/models';

/** Fields of a locked record that may be corrected through an amendment. */
type AmendableField = 'cgpa' | 'classOfDegree' | 'thesisTitle' | 'supervisor' | 'senateApprovalDate' | 'remarks'
  | 'projectGrade' | 'effectiveDate' | 'boardMeeting';
const FIELDS: AmendableField[] = ['cgpa', 'classOfDegree', 'thesisTitle', 'supervisor', 'senateApprovalDate', 'remarks',
  'projectGrade', 'effectiveDate', 'boardMeeting'];
const DATE_FIELDS: AmendableField[] = ['senateApprovalDate', 'effectiveDate'];

function normalise(field: AmendableField, raw: string) {
  const v = raw.trim();
  if (!v) return null;
  if (field === 'cgpa' || field === 'projectGrade') {
    const n = Number(v);
    if (isNaN(n) || n < 0 || n > 5) fail(`${field === 'cgpa' ? 'CGPA' : 'Project grade'} must be between 0 and 5`);
    if (field === 'projectGrade' && !Number.isInteger(n)) fail('Project grade must be a whole grade point: 5 = A, 4 = B, 3 = C, 2 = D, 1 = E');
    return Math.round(n * 100) / 100;
  }
  if (field === 'classOfDegree' && !(CLASS_OF_DEGREE as readonly string[]).includes(v)) fail('Invalid class of degree');
  if (DATE_FIELDS.includes(field)) {
    const d = new Date(v);
    if (isNaN(d.getTime())) fail(field === 'effectiveDate' ? 'Invalid effective date' : 'Invalid Board approval date');
    if (d > new Date()) fail('The date cannot be in the future');
    return d.toISOString().slice(0, 10);
  }
  return v.slice(0, 500);
}

function current(rec: Record<string, unknown>, field: AmendableField) {
  const v = rec[field];
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v ?? null;
}

type Change = { field: string; from: unknown; to: unknown };

/** Checks the record and evidence, then files the amendment and tells the Provost. */
async function fileAmendment(recordId: string, fd: FormData, build: (rec: Record<string, unknown>) => Change[] | Promise<Change[]>,
  { subject, intro }: { subject: string; intro: string }) {
  const user = await requirePermission('amendment:request');
  await db();
  const rec = await GraduandRecord.findById(recordId).lean();
  if (!rec) missing('Record not found');
  if (!rec!.locked) fail('Unlocked records are corrected on their sheet, not by amendment');
  if (await Amendment.exists({ record: recordId, status: 'PENDING' })) fail('This record already has a pending amendment');

  const changes = await build(rec as unknown as Record<string, unknown>);
  if (!changes.length) fail('Change at least one value');
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 10) fail('Explain the reason for the correction (at least 10 characters)');
  const evidence = String(fd.get('evidence') ?? '');
  if (!evidence) fail('Upload the evidence (e.g. Board extract or corrected signed sheet)');
  const file = await StoredFile.findOne({ _id: evidence, purpose: 'AMENDMENT_EVIDENCE', uploadedBy: user.id }).lean();
  if (!file) missing('Evidence file not found');

  const a = await Amendment.create({ record: recordId, changes, reason, evidence, requestedBy: user.id });
  await audit(user, 'amendment.request', 'Amendment', a.id, undefined, { record: recordId, changes, reason });

  const provosts = await User.find({ role: 'PROVOST', isActive: true }).select('name email').lean();
  await sendMail({
    to: provosts.map((p) => ({ email: p.email, name: p.name })),
    subject,
    html: `<p>${intro}</p>${link('/amendments', 'Review amendments')}`,
  });
}

export async function requestAmendment(recordId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await fileAmendment(recordId, fd, (rec) => FIELDS.flatMap((f) => {
      if (!fd.has(f)) return [];
      const to = normalise(f, String(fd.get(f)));
      const from = current(rec, f);
      return String(to ?? '') === String(from ?? '') ? [] : [{ field: f, from, to }];
    }), {
      subject: 'Amendment to a locked result awaits your approval',
      intro: 'The Head of Records has requested a correction to a locked graduand record.',
    });
    return { ok: true, message: 'Amendment sent to the Provost for approval.' };
  });
}

const CourseList = z.array(CourseSchema).max(80, 'At most 80 courses');
type Course = z.infer<typeof CourseSchema>;
const courseKey = (c: Partial<Course>) => [c.code, c.title ?? '', c.units, c.grade ?? '', c.semester ?? ''].join('|');

/**
 * Course results for a locked record, semester by semester, from the Student's Final Result sheet
 * (rows without a semester are the project / thesis / dissertation). Goes to the Provost like any
 * amendment; on approval they replace the record's courses and print on the transcript.
 */
export async function requestCourseResults(recordId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(fd.get('courses') ?? '[]'));
    } catch {
      fail('The course list could not be read; reload the page and try again');
    }
    const res = CourseList.safeParse(parsed);
    if (!res.success) {
      const iss = res.error.issues[0];
      const row = typeof iss.path[0] === 'number' ? ` (course ${iss.path[0] + 1})` : '';
      fail(`${iss.path[1] === 'code' ? 'Each course needs a code' : iss.path[1] === 'units' ? 'Credit must be a whole number from 0 to 30' : iss.message}${row}`);
    }
    const courses = res.data!.map((c) => ({ code: c.code, title: c.title, units: c.units, grade: c.grade, ...(c.semester ? { semester: c.semester } : {}) }));
    const dup = courses.find((c, i) => courses.findIndex((x) => x.code === c.code && x.semester === c.semester) !== i);
    if (dup) fail(`${dup.code} is listed twice in the same semester`);

    await fileAmendment(recordId, fd, (rec) => {
      const from = ((rec.courses as Course[] | undefined) ?? []).map((c) => ({ code: c.code, title: c.title, units: c.units, grade: c.grade, ...(c.semester ? { semester: c.semester } : {}) }));
      const same = from.length === courses.length && from.map(courseKey).sort().join() === courses.map(courseKey).sort().join();
      return same ? [] : [{ field: 'courses', from, to: courses }];
    }, {
      subject: 'Course results for a locked record await your approval',
      intro: 'The Head of Records has entered course results for a locked graduand record, with the signed result sheet as evidence.',
    });
    return { ok: true, message: `${courses.length} course result(s) sent to the Provost for approval.` };
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
      if (!rec) missing('Record not found');
      const snapshot: Record<string, unknown> = Object.fromEntries(FIELDS.map((f) => [f, current(rec!.toObject(), f)]));
      if (a!.changes.some((c) => c.field === 'courses')) snapshot.courses = rec!.toObject().courses ?? [];
      rec!.history.push({ version: rec!.version, data: snapshot, amendment: a!._id, at: new Date() });
      for (const c of a!.changes) {
        if (c.field === 'courses') {
          rec!.set('courses', Array.isArray(c.to) ? c.to : []);
          continue;
        }
        const f = c.field as AmendableField;
        rec!.set(f, DATE_FIELDS.includes(f) && c.to ? new Date(c.to as string) : c.to ?? undefined);
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

