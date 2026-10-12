import 'server-only';
import { Types } from 'mongoose';
import { Department, GraduandRecord, Programme, ResultSheet, Student, User } from '@/models';
import type { ResultSheetDoc } from '@/models/ResultSheet';
import { classConsistency } from './grading';
import type { GraduandRow } from './validators';
import { FLOW, STATUS_LABELS, type FlowStage } from './workflow';
import { sendMail, link } from './mail';
import { esc } from './format';
import { UserError } from './errors';

type SheetLike = Pick<ResultSheetDoc, '_id' | 'department' | 'programme' | 'session' | 'origin'>;

/** Checks a row against department rules and existing records. Returns errors (blocking) and warnings. */
export async function checkRow(sheet: SheetLike, row: GraduandRow, degreeType?: string) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dept = await Department.findById(sheet.department).select('matricPattern').lean();
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

  const c = classConsistency(row.cgpa, row.classOfDegree, degreeType);
  if (c) warnings.push(c);
  if (row.courses.some((x) => x.score != null && x.grade && gradeMismatch(x.score, x.grade))) {
    warnings.push('One or more course grades do not match their scores');
  }
  return { errors, warnings };
}

function gradeMismatch(score: number, grade: string) {
  const g = score >= 70 ? 'A' : score >= 60 ? 'B' : score >= 50 ? 'C' : 'F';
  return g !== grade && !(grade === 'D' || grade === 'E');
}

/** Creates or updates the student and their graduand record on this sheet. */
export async function upsertGraduand(sheet: SheetLike, row: GraduandRow, extra: { sourceFile?: string } = {}) {
  const programme = await Programme.findById(sheet.programme).lean();
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
    student: student._id, sheet: sheet._id, department: sheet.department, programme: sheet.programme,
    session: sheet.session, origin: sheet.origin, degree: programme.name,
    cgpa: row.cgpa, classOfDegree: row.classOfDegree, thesisTitle: row.thesisTitle, supervisor: row.supervisor,
    courses: row.courses, sourcePage: row.sourcePage, illegible: !!row.illegible, remarks: row.remarks,
    ...(extra.sourceFile ? { sourceFile: new Types.ObjectId(extra.sourceFile) } : {}),
  };
  const rec = existing
    ? await GraduandRecord.findByIdAndUpdate(existing._id, { $set: data }, { returnDocument: 'after' })
    : await GraduandRecord.create(data);
  await refreshCount(sheet._id);
  return rec!;
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
    courses: (r.courses ?? []).map((c) => `${c.code}:${c.units}:${c.score ?? ''}:${c.grade ?? ''}`).join('|'),
  }));
}

export type RowSnapshot = Awaited<ReturnType<typeof snapshotRows>>[number];

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
    const fields = (['name', 'cgpa', 'classOfDegree', 'thesisTitle', 'courses'] as const).filter((f) => o[f] !== r[f]);
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
