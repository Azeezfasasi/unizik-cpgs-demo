'use server';

import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission, type CurrentUser } from '@/lib/auth';
import { MAX_STUDENTS, parseCourseResults, planCourseResults } from '@/lib/course-results-import';
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

/**
 * Checks the record and evidence and files one amendment (no email). Throws a user error saying
 * why it cannot be filed.
 */
async function createAmendment(user: CurrentUser, recordId: string, reason: string, evidence: string,
  build: (rec: Record<string, unknown>) => Change[] | Promise<Change[]>) {
  if (!Types.ObjectId.isValid(recordId)) missing('Record not found');
  const rec = await GraduandRecord.findById(recordId).lean();
  if (!rec) missing('Record not found');
  if (!rec!.locked) fail('Unlocked records are corrected on their sheet, not by amendment');
  if (await Amendment.exists({ record: recordId, status: 'PENDING' })) fail('This record already has a pending amendment');

  const changes = await build(rec as unknown as Record<string, unknown>);
  if (!changes.length) fail('Change at least one value');
  if (reason.length < 10) fail('Explain the reason for the correction (at least 10 characters)');
  if (!evidence || !Types.ObjectId.isValid(evidence)) fail('Upload the evidence (e.g. Board extract or corrected signed sheet)');
  const file = await StoredFile.findOne({ _id: evidence, purpose: 'AMENDMENT_EVIDENCE', uploadedBy: user.id }).lean();
  if (!file) missing('Evidence file not found');

  const a = await Amendment.create({ record: recordId, changes, reason, evidence, requestedBy: user.id });
  await audit(user, 'amendment.request', 'Amendment', a.id, undefined, { record: recordId, changes, reason });
  return a;
}

async function notifyProvosts(subject: string, intro: string) {
  const provosts = await User.find({ role: 'PROVOST', isActive: true }).select('name email').lean();
  await sendMail({
    to: provosts.map((p) => ({ email: p.email, name: p.name })),
    subject,
    html: `<p>${intro}</p>${link('/amendments', 'Review amendments')}`,
  });
}

/** Files one amendment from a form and tells the Provost. */
async function fileAmendment(recordId: string, fd: FormData, build: (rec: Record<string, unknown>) => Change[] | Promise<Change[]>,
  { subject, intro }: { subject: string; intro: string }) {
  const user = await requirePermission('amendment:request');
  await db();
  await createAmendment(user, recordId, String(fd.get('reason') ?? '').trim(), String(fd.get('evidence') ?? ''), build);
  await notifyProvosts(subject, intro);
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
const plain = (c: Partial<Course>) => ({ code: c.code, title: c.title, units: c.units, grade: c.grade, ...(c.semester ? { semester: c.semester } : {}) });

/** Validates a course list (throws a user error naming the course); project rows have no semester. */
function checkCourses(raw: unknown) {
  const res = CourseList.safeParse(raw);
  if (!res.success) {
    const iss = res.error.issues[0];
    const row = typeof iss.path[0] === 'number' ? ` (course ${iss.path[0] + 1})` : '';
    fail(`${iss.path[1] === 'code' ? 'Each course needs a code' : iss.path[1] === 'units' ? 'Credit must be a whole number from 0 to 30' : iss.message}${row}`);
  }
  const courses = res.data!.map(plain);
  const dup = courses.find((c, i) => courses.findIndex((x) => x.code === c.code && x.semester === c.semester) !== i);
  if (dup) fail(`${dup.code} is listed twice in the same semester`);
  return courses;
}

/** The change replacing a record's courses, or none when they are the same. */
const coursesChange = (courses: ReturnType<typeof plain>[]) => (rec: Record<string, unknown>): Change[] => {
  const from = ((rec.courses as Course[] | undefined) ?? []).map(plain);
  const same = from.length === courses.length && from.map(courseKey).sort().join() === courses.map(courseKey).sort().join();
  return same ? [] : [{ field: 'courses', from, to: courses }];
};

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
    const courses = checkCourses(parsed);
    await fileAmendment(recordId, fd, coursesChange(courses), {
      subject: 'Course results for a locked record await your approval',
      intro: 'The Head of Records has entered course results for a locked graduand record, with the signed result sheet as evidence.',
    });
    return { ok: true, message: `${courses.length} course result(s) sent to the Provost for approval.` };
  });
}

/** Bulk course results, step 1: reads the spreadsheet and matches each student to their locked record. */
export async function checkCourseResults(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await requirePermission('amendment:request');
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) fail('Choose the filled spreadsheet');
    if (file!.size > 5 * 1024 * 1024) fail('The spreadsheet is larger than 5 MB; split it into smaller files');
    const { students, errors } = parseCourseResults(await file!.arrayBuffer(), file!.name);
    if (errors.length) {
      return { ok: false, message: `The spreadsheet has ${errors.length} problem(s). Fix them and check again; nothing was sent.`, errors: errors.slice(0, 100) };
    }
    if (!students.size) fail('The spreadsheet has no course rows');
    await db();
    const plan = await planCourseResults(students);
    const ready = plan.filter((p) => !p.problem).length;
    return {
      ok: true,
      message: `${students.size} student(s) found: ${ready} ready to send${ready < plan.length ? `, ${plan.length - ready} cannot be sent (see below)` : ''}. Attach their scanned sheets, then send.`,
      data: { plan: JSON.stringify(plan) },
    };
  });
}

const BulkItems = z.array(z.object({ recordId: z.string(), evidence: z.string(), courses: z.unknown() })).min(1).max(MAX_STUDENTS);

/**
 * Bulk course results, step 2: one amendment per student, each with that student's scanned sheet.
 * Students that cannot be filed are skipped with the reason; the Provost gets one email.
 */
export async function sendCourseResults(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('amendment:request');
    let items: z.infer<typeof BulkItems>;
    try {
      items = BulkItems.parse(JSON.parse(String(fd.get('items') ?? '[]')));
    } catch {
      fail('Nothing to send: check the spreadsheet and attach the scans first');
    }
    const reason = String(fd.get('reason') ?? '').trim();
    if (reason.length < 10) fail('Explain the reason (at least 10 characters)');
    await db();

    let sent = 0;
    const skipped: string[] = [];
    for (const it of items!) {
      try {
        await createAmendment(user, it.recordId, reason, it.evidence, coursesChange(checkCourses(it.courses)));
        sent++;
      } catch (e) {
        const rec = Types.ObjectId.isValid(it.recordId)
          ? await GraduandRecord.findById(it.recordId).populate<{ student: { matricNo: string } }>('student', 'matricNo').lean() : null;
        skipped.push(`${rec?.student.matricNo ?? it.recordId}: ${e instanceof Error ? e.message : 'could not be sent'}`);
      }
    }
    if (sent) {
      await notifyProvosts(`Course results for ${sent} locked record(s) await your approval`,
        `The Head of Records has entered course results for ${sent} graduand record(s), each with the signed result sheet as evidence.`);
    }
    return {
      ok: sent > 0,
      message: `${sent} student(s) sent to the Provost for approval.${skipped.length ? ` ${skipped.length} skipped.` : ''}`,
      warnings: skipped.slice(0, 50),
    };
  });
}

/** Applies or rejects one pending amendment; returns how many issued documents were revoked. */
async function decideOne(user: CurrentUser, amendmentId: string, approve: boolean, comment: string) {
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
  return revoked;
}

export async function decideAmendment(amendmentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('amendment:approve');
    const approve = fd.get('decision') === 'approve';
    const comment = String(fd.get('comment') ?? '').trim();
    if (!approve && comment.length < 5) fail('Give a reason for rejecting');
    const revoked = await decideOne(user, amendmentId, approve, comment);
    return { ok: true, message: approve ? `Amendment applied.${revoked ? ` ${revoked} issued document(s) revoked automatically.` : ''}` : 'Amendment rejected.' };
  });
}

/** Approves the selected pending amendments (each on its own); ones that cannot be approved are listed. */
export async function approveSelectedAmendments(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('amendment:approve');
    const ids = [...new Set(fd.getAll('ids').map(String).filter((id) => Types.ObjectId.isValid(id)))];
    if (!ids.length) fail('Select at least one amendment');
    if (ids.length > 200) fail('Approve at most 200 at a time');
    await db();
    let approved = 0, revoked = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      try {
        revoked += await decideOne(user, id, true, '');
        approved++;
      } catch (e) {
        skipped.push(e instanceof Error ? e.message : 'Could not be approved');
      }
    }
    const reasons = [...new Set(skipped)].map((r) => `${skipped.filter((s) => s === r).length} not approved: ${r}`);
    return {
      ok: approved > 0,
      message: `${approved} amendment(s) approved.${revoked ? ` ${revoked} issued document(s) revoked automatically.` : ''}`,
      warnings: reasons,
    };
  });
}
