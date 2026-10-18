import 'server-only';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { Department, GraduandRecord, Programme, ResultSheet, Student, User } from '@/models';
import type { ResultSheetDoc } from '@/models/ResultSheet';
import { classConsistency, expectedClass, semesterGpaWarnings, type ClassOfDegree } from './grading';
import { getGradingBands } from './settings';
import type { GraduandRow } from './validators';
import { FLOW, STATUS_LABELS, type FlowStage } from './workflow';
import { sendMail, link } from './mail';
import { esc } from './format';
import { UserError } from './errors';

type SheetLike = Pick<ResultSheetDoc, '_id' | 'department' | 'programme' | 'session' | 'origin'>;

/**
 * Lookups shared by all rows of one import, so a 100-row upload reads the department rules,
 * programme and grading bands once instead of once per row. With skipCount, the caller updates
 * each sheet's row count once at the end (refreshCount).
 */
export type RowCache = {
  dept: Map<string, Promise<{ matricPattern?: string | null } | null>>;
  programme: Map<string, Promise<{ name: string; degreeType: string } | null>>;
  bands?: Promise<Awaited<ReturnType<typeof getGradingBands>>>;
  skipCount: boolean;
};
export const rowCache = (): RowCache => ({ dept: new Map(), programme: new Map(), skipCount: true });

/** Shares one lookup between rows. load must return a real Promise (a Mongoose query needs .exec(): a query can run only once). */
function cached<T>(map: Map<string, Promise<T>> | undefined, key: string, load: () => Promise<T>) {
  if (!map) return load();
  if (!map.has(key)) map.set(key, load());
  return map.get(key)!;
}
const bandsOf = (cache?: RowCache) => (cache ? (cache.bands ??= getGradingBands()) : getGradingBands());

/** Runs fn over items, `size` at a time (independent rows: different students). */
export async function inChunks<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map((x, j) => fn(x, i + j))));
  }
  return out;
}

/** Checks a row against department rules and existing records. Returns errors (blocking) and warnings. */
export async function checkRow(sheet: SheetLike, row: GraduandRow, degreeType?: string, cache?: RowCache) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dept = await cached(cache?.dept, String(sheet.department), () => Department.findById(sheet.department).select('matricPattern').lean().exec());
  if (dept?.matricPattern) {
    try {
      if (!new RegExp(dept.matricPattern).test(row.matricNo)) {
        errors.push(`Matric number ${row.matricNo} does not match the department format`);
      }
    } catch { /* bad pattern configured: skip */ }
  }

  const student = await Student.findOne({ matricNo: row.matricNo }).lean();
  if (student && !student.department.equals(sheet.department)) {
    errors.push(`Matric number ${row.matricNo} belongs to a student in another department`);
  }
  if (student) {
    const dup = await GraduandRecord.findOne({
      student: student._id, programme: sheet.programme, sheet: { $ne: sheet._id },
    }).populate<{ sheet: { reference: string } }>('sheet', 'reference').lean();
    if (dup) errors.push(`${row.matricNo} already has a record for this programme (sheet ${dup.sheet?.reference})`);
  }

  const { bands } = await bandsOf(cache);
  const c = classConsistency(row.cgpa, row.classOfDegree, degreeType, bands);
  if (c) warnings.push(c);
  if (row.courses.some((x) => x.score != null && x.grade && gradeMismatch(x.score, x.grade))) {
    warnings.push('One or more course grades do not match their scores');
  }
  warnings.push(...semesterGpaWarnings(row.courses, row.semesterGpas));
  return { errors, warnings };
}

function gradeMismatch(score: number, grade: string) {
  const g = score >= 70 ? 'A' : score >= 60 ? 'B' : score >= 50 ? 'C' : 'F';
  return g !== grade && !(grade === 'D' || grade === 'E');
}

/** Creates or updates the student and their graduand record on this sheet. */
export async function upsertGraduand(sheet: SheetLike, row: GraduandRow, extra: { sourceFile?: string } = {}, cache?: RowCache) {
  const programme = await cached(cache?.programme, String(sheet.programme), () => Programme.findById(sheet.programme).select('name degreeType').lean().exec());
  if (!programme) throw new UserError('Programme not found');

  const student = await Student.findOneAndUpdate(
    { matricNo: row.matricNo },
    {
      $set: { surname: row.surname, otherNames: row.otherNames, sex: row.sex, programme: sheet.programme },
      $setOnInsert: { department: sheet.department },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const existing = await GraduandRecord.findOne({ student: student._id, programme: sheet.programme, session: sheet.session });
  if (existing?.locked) throw new UserError(`${row.matricNo} is locked; use an amendment`);
  if (existing && !existing.sheet.equals(sheet._id)) {
    throw new UserError(`${row.matricNo} already has a record for this programme and session on another sheet`);
  }

  const data = {
    ...await rowFields(row, programme.degreeType, cache),
    student: student._id, sheet: sheet._id, department: sheet.department, programme: sheet.programme,
    session: sheet.session, origin: sheet.origin, degree: programme.name,
    courses: row.courses, sourcePage: row.sourcePage, illegible: !!row.illegible, remarks: row.remarks,
    ...(extra.sourceFile ? { sourceFile: new Types.ObjectId(extra.sourceFile) } : {}),
  };
  const rec = existing
    ? await GraduandRecord.findByIdAndUpdate(existing._id, { $set: data }, { returnDocument: 'after' })
    : await GraduandRecord.create(data);
  if (!cache?.skipCount) await refreshCount(sheet._id);
  return rec!;
}

/** Result fields of a row, with the class of degree worked out from the CGPA when it was left out. */
async function rowFields(row: GraduandRow, degreeType: string, cache?: RowCache) {
  let cls: ClassOfDegree | undefined = row.classOfDegree;
  if (!cls) cls = degreeType === 'PhD' ? 'NOT_APPLICABLE' : expectedClass(row.cgpa!, (await bandsOf(cache)).bands);
  return {
    cgpa: row.cgpa, classOfDegree: cls, thesisTitle: row.thesisTitle, supervisor: row.supervisor,
    semesterGpas: row.semesterGpas.length ? row.semesterGpas : undefined, projectGrade: row.projectGrade,
    effectiveDate: row.effectiveDate, boardMeeting: row.boardMeeting,
  };
}

export async function refreshCount(sheetId: Types.ObjectId) {
  const n = await GraduandRecord.countDocuments({ sheet: sheetId });
  await ResultSheet.updateOne({ _id: sheetId }, { $set: { recordCount: n } });
}

/** Plain snapshot of a sheet's rows, used to show approvers what changed on resubmission. */
export async function snapshotRows(sheetId: Types.ObjectId) {
  const recs = await GraduandRecord.find({ sheet: sheetId })
    .populate<{ student: { matricNo: string; surname: string; otherNames: string } }>('student', 'matricNo surname otherNames')
    .lean();
  return recs.map((r) => ({
    matricNo: r.student.matricNo, name: `${r.student.surname} ${r.student.otherNames}`,
    cgpa: r.cgpa ?? null, classOfDegree: r.classOfDegree ?? null, thesisTitle: r.thesisTitle ?? null,
    // PG Board list fields, folded into one value so they appear in diffs and the fingerprint only when present.
    board: boardSummary(r),
    // The semester is appended only when set, so courses recorded before it existed keep the same fingerprint.
    courses: (r.courses ?? []).map((c) => `${c.code}:${c.units}:${c.score ?? ''}:${c.grade ?? ''}${c.semester ? `:s${c.semester}` : ''}`).join('|'),
  }));
}

function boardSummary(r: { semesterGpas?: number[] | null; projectGrade?: number | null; effectiveDate?: Date | null; boardMeeting?: string | null }) {
  const parts = [
    r.semesterGpas?.length ? `sem:${r.semesterGpas.map((g) => g.toFixed(2)).join('/')}` : '',
    r.projectGrade != null ? `proj:${r.projectGrade.toFixed(2)}` : '',
    r.effectiveDate ? `wef:${r.effectiveDate.toISOString().slice(0, 10)}` : '',
    r.boardMeeting ? `board:${r.boardMeeting}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(';') : null;
}

export type RowSnapshot = Awaited<ReturnType<typeof snapshotRows>>[number];

/**
 * Short code derived from a sheet's rows (e.g. 7F3A-91C2), printed on the sheet for signing.
 * Any change to a matric number, name, CGPA, class, thesis title or course after printing
 * produces a different code, so approvers can tell whether the signed scan matches the data.
 */
export function rowFingerprint(rows: RowSnapshot[]) {
  const canonical = [...rows].sort((a, b) => a.matricNo.localeCompare(b.matricNo))
    // Board fields are appended only when present, so sheets printed before they existed keep their code.
    .map((r) => [r.matricNo, r.name, r.cgpa, r.classOfDegree, r.thesisTitle, r.courses, ...(r.board ? [r.board] : [])]);
  const hex = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function diffSnapshots(prev: RowSnapshot[] | undefined, next: RowSnapshot[] | undefined) {
  if (!prev || !next) return null;
  const p = new Map(prev.map((r) => [r.matricNo, r]));
  const n = new Map(next.map((r) => [r.matricNo, r]));
  const added = next.filter((r) => !p.has(r.matricNo)).map((r) => r.matricNo);
  const removed = prev.filter((r) => !n.has(r.matricNo)).map((r) => r.matricNo);
  const changed: { matricNo: string; fields: string[] }[] = [];
  for (const r of next) {
    const o = p.get(r.matricNo);
    if (!o) continue;
    // Older snapshots have no board field: treat missing as empty.
    const fields = (['name', 'cgpa', 'classOfDegree', 'thesisTitle', 'courses', 'board'] as const)
      .filter((f) => (o[f] ?? null) !== (r[f] ?? null));
    if (fields.length) changed.push({ matricNo: r.matricNo, fields });
  }
  return { added, removed, changed };
}

// ---------- notifications ----------

async function recipientsForStage(stage: FlowStage, departmentId: Types.ObjectId) {
  const role = FLOW[stage].role;
  const q: Record<string, unknown> = { role, isActive: true };
  if (role === 'HOD') q.department = departmentId;
  if (role === 'FACULTY_PG') {
    const d = await Department.findById(departmentId).select('faculty').lean();
    q.faculty = d?.faculty;
  }
  return User.find(q).select('name email').lean();
}

export async function notifySheet(sheetId: Types.ObjectId | string, comment?: string) {
  const sheet = await ResultSheet.findById(sheetId).lean();
  if (!sheet) return;
  const path = `/sheets/${sheet._id}`;
  if (sheet.status in FLOW) {
    const to = await recipientsForStage(sheet.status as FlowStage, sheet.department);
    await sendMail({
      to: to.map((u) => ({ email: u.email, name: u.name })),
      subject: `Result sheet ${sheet.reference} awaits your action`,
      html: `<p>Result sheet <b>${esc(sheet.reference)}</b> is now at <b>${STATUS_LABELS[sheet.status as FlowStage]}</b> and is in your approvals inbox.</p>${link(path, 'Open sheet')}`,
    });
  } else if (sheet.status === 'RETURNED') {
    const to = await User.find({
      isActive: true,
      $or: [{ _id: sheet.createdBy }, ...(sheet.origin === 'ONLINE' ? [{ role: 'DEPT_OFFICER' as const, department: sheet.department }] : [])],
    }).select('name email').lean();
    await sendMail({
      to: to.map((u) => ({ email: u.email, name: u.name })),
      subject: `Result sheet ${sheet.reference} was returned`,
      html: `<p>Result sheet <b>${esc(sheet.reference)}</b> was returned for correction.</p><p><b>Reason:</b> ${esc(comment)}</p>${link(path, 'Review and correct')}`,
    });
  } else if (sheet.status === 'SENATE_APPROVED') {
    const to = await User.find({ isActive: true, role: 'DEPT_OFFICER', department: sheet.department }).select('name email').lean();
    await sendMail({
      to: to.map((u) => ({ email: u.email, name: u.name })),
      subject: `Result sheet ${sheet.reference} is Senate approved and archived`,
      html: `<p>All records on <b>${esc(sheet.reference)}</b> are now locked in the CPGS Results Repository.</p>${link(path, 'View sheet')}`,
    });
  }
}
