'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { sendMail, link } from '@/lib/mail';
import { esc } from '@/lib/format';
import { ROLE_LABELS, type Role } from '@/lib/rbac';
import { UserCreateSchema, objectId } from '@/lib/validators';
import type { ActionState } from '@/lib/action-state';
import { AcademicSession, Department, Faculty, Programme, User } from '@/models';
import Degree from '@/models/Degree';
import { findDegree, getDegrees } from '@/lib/degree-list';
import Setting from '@/models/Setting';
import { describeUsage, usageOf, type StructureKind } from '@/lib/structure';
import { getGradingBands, GRADING_KEY } from '@/lib/settings';
import type { Band } from '@/lib/grading';
import { withTxn } from '@/lib/txn';
import { applyStructurePlan, parseStructureFile, planStructureImport } from '@/lib/structure-import';

function tempPassword() {
  // 16 chars, guaranteed upper, lower and digit.
  const base = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  return `${base}A7a`.slice(0, 16);
}

async function resolveUnit(role: Role, department?: string, faculty?: string) {
  if (role === 'DEPT_OFFICER' || role === 'HOD') {
    if (!department) fail('Pick the department for this role');
    const d = await Department.findById(department).lean();
    if (!d) missing('Department not found');
    return { department: d!._id, faculty: d!.faculty };
  }
  if (role === 'FACULTY_PG') {
    if (!faculty) fail('Pick the faculty for this role');
    if (!(await Faculty.exists({ _id: faculty }))) missing('Faculty not found');
    return { faculty, department: undefined };
  }
  return { department: undefined, faculty: undefined };
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('user:manage');
    await db();
    const data = UserCreateSchema.parse(Object.fromEntries(fd));
    const unit = await resolveUnit(data.role, data.department, data.faculty);
    const pwd = tempPassword();
    const u = await User.create({
      name: data.name, email: data.email, role: data.role, ...unit,
      passwordHash: await bcrypt.hash(pwd, 12), mustChangePassword: true,
    });
    await audit(admin, 'user.create', 'User', u.id, undefined, { email: u.email, role: u.role, ...unit });
    await sendMail({
      to: [{ email: u.email, name: u.name }],
      subject: 'Your CPGS Results Repository account',
      html: `<p>Dear ${esc(u.name)},</p><p>An account has been created for you as <b>${esc(ROLE_LABELS[data.role])}</b>.</p>
<p>Temporary password: <code style="font-size:16px">${esc(pwd)}</code></p>
<p>You will be asked to choose a new password and set up an authenticator app when you first sign in.</p>${link('/login', 'Sign in')}`,
    });
    return { ok: true, message: `Account created for ${u.email}.`, data: { tempPassword: pwd } };
  });
}

const UpdateUser = z.object({
  role: z.enum(Object.keys(ROLE_LABELS) as [Role, ...Role[]]),
  department: objectId.optional().or(z.literal('').transform(() => undefined)),
  faculty: objectId.optional().or(z.literal('').transform(() => undefined)),
});

export async function updateUser(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('user:manage');
    await db();
    const data = UpdateUser.parse(Object.fromEntries(fd));
    const u = await User.findById(userId);
    if (!u) missing('User not found');
    if (u!.id === admin.id && data.role !== 'SUPER_ADMIN') fail('You cannot remove your own administrator role');
    const unit = await resolveUnit(data.role, data.department, data.faculty);
    const before = { role: u!.role, department: u!.department?.toString(), faculty: u!.faculty?.toString() };
    u!.set({ role: data.role, department: unit.department ?? null, faculty: unit.faculty ?? null });
    await u!.save();
    await audit(admin, 'user.update', 'User', userId, before, { role: data.role, ...unit });
    return { ok: true, message: 'Saved.' };
  });
}

export async function setUserActive(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('user:manage');
    if (userId === admin.id) fail('You cannot deactivate your own account');
    await db();
    const active = fd.get('active') === 'true';
    await User.updateOne({ _id: userId }, { $set: { isActive: active } });
    await audit(admin, active ? 'user.activate' : 'user.deactivate', 'User', userId);
  });
}

export async function resetCredentials(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('user:manage');
    await db();
    const what = String(fd.get('what'));
    const u = await User.findById(userId);
    if (!u) missing('User not found');
    if (what === 'mfa') {
      await User.updateOne({ _id: userId }, { $set: { mfaEnabled: false }, $unset: { mfaSecret: 1, mfaPendingSecret: 1 } });
      await audit(admin, 'user.mfa_reset', 'User', userId);
      return { ok: true, message: 'Authenticator removed. The user will set up a new one at next sign-in.' };
    }
    const pwd = tempPassword();
    u!.set({ passwordHash: await bcrypt.hash(pwd, 12), mustChangePassword: true, failedLogins: 0, lockedUntil: undefined });
    await u!.save();
    await audit(admin, 'user.password_reset', 'User', userId);
    return { ok: true, message: 'Temporary password generated. Give it to the user in person; it is shown only once.', data: { tempPassword: pwd } };
  });
}

// ---------------------------------------------------------------- academic structure

/**
 * Bulk-adds faculties, departments and programmes from the structure template (Excel or CSV).
 * Every row is checked first; nothing is saved unless all rows are valid. With mode=check it
 * only reports what would be added.
 */
export async function importStructure(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) fail('Choose the filled structure template (.xlsx or .csv)');
    const f = file as File;
    if (!/\.(xlsx|csv)$/i.test(f.name)) fail('Upload the template as an Excel (.xlsx) or CSV (.csv) file');
    if (f.size > 5 * 1024 * 1024) fail('File is larger than 5 MB');
    const checkOnly = fd.get('mode') === 'check';

    const { rows, errors } = parseStructureFile(await f.arrayBuffer(), f.name);
    if (errors.length) return { ok: false, message: `${errors.length} problem(s) found. Nothing was saved.`, errors };
    await db();
    const planned = await planStructureImport(rows);
    if (planned.errors.length) {
      return { ok: false, message: `${planned.errors.length} problem(s) found. Nothing was saved.`, errors: planned.errors, warnings: planned.warnings };
    }
    const { plan } = planned;
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const summary = (c: { faculties: number; departments: number; programmes: number }) =>
      `${count(c.faculties, 'faculty', 'faculties')}, ${count(c.departments, 'department', 'departments')} and ${count(c.programmes, 'programme', 'programmes')}`;
    const adds = summary({ faculties: plan.faculties.length, departments: plan.departments.length, programmes: plan.programmes.length });
    const kept = plan.existing.faculties + plan.existing.departments + plan.existing.programmes;
    const keptNote = kept ? ` ${count(kept, 'item already exists and is left as it is', 'items already exist and are left as they are')}.` : '';
    if (checkOnly) {
      return { ok: true, message: `Check passed for ${count(rows.length, 'row', 'rows')}: would add ${adds}.${keptNote} Nothing was saved yet.`, warnings: planned.warnings };
    }
    if (!plan.faculties.length && !plan.departments.length && !plan.programmes.length) {
      return { ok: true, message: `Nothing new to add: everything in ${f.name} already exists.`, warnings: planned.warnings };
    }
    const created = await withTxn((session) => applyStructurePlan(plan, session));
    await audit(admin, 'structure.bulk_import', 'Structure', undefined, undefined, {
      file: f.name, rows: rows.length, ...created,
      codes: { faculties: plan.faculties.map((x) => x.code), departments: plan.departments.map((x) => x.code), programmes: plan.programmes.map((x) => x.code) },
    });
    return {
      ok: true,
      message: `Added ${summary(created)} from ${f.name}.${keptNote}`,
      warnings: planned.warnings,
    };
  });
}

export async function createFaculty(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({ name: z.string().trim().min(3), code: z.string().trim().min(2).max(10) }).parse(Object.fromEntries(fd));
    const f = await Faculty.create(d);
    await audit(admin, 'structure.faculty_create', 'Faculty', f.id, undefined, d);
    return { ok: true, message: `${f.name} added.` };
  });
}

export async function createDepartment(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({
      name: z.string().trim().min(3), code: z.string().trim().min(2).max(10), faculty: objectId,
      matricPattern: z.string().trim().max(100).optional().transform((v) => v || undefined),
    }).parse(Object.fromEntries(fd));
    if (d.matricPattern) { try { new RegExp(d.matricPattern); } catch { fail('Matric pattern is not a valid regular expression'); } }
    const dep = await Department.create(d);
    await audit(admin, 'structure.department_create', 'Department', dep.id, undefined, d);
    return { ok: true, message: `${dep.name} added.` };
  });
}

/** The managed degree's code for a code or spelling ("m.sc" → MSc); fails on an unknown degree. */
async function degreeCode(text: string) {
  const d = findDegree(text, await getDegrees());
  if (!d) fail(`Unknown degree "${text}". Add it under Degrees first.`);
  return d!.code;
}

export async function createProgramme(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({
      name: z.string().trim().min(3), code: z.string().trim().min(2).max(20),
      degreeType: z.string().trim().min(1, 'Choose the degree'), department: objectId,
    }).parse(Object.fromEntries(fd));
    d.degreeType = await degreeCode(d.degreeType);
    const p = await Programme.create(d);
    await audit(admin, 'structure.programme_create', 'Programme', p.id, undefined, d);
    return { ok: true, message: `${p.name} added.` };
  });
}

export async function createSession(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const startYear = z.coerce.number().int().min(1960).max(2100).parse(fd.get('startYear'));
    const s = await AcademicSession.create({ label: `${startYear}/${startYear + 1}`, startYear });
    await audit(admin, 'structure.session_create', 'AcademicSession', s.id, undefined, { label: s.label });
    return { ok: true, message: `Session ${s.label} added.` };
  });
}

// ---------------------------------------------------------------- edit and delete

const optPattern = z.string().trim().max(100).optional().transform((v) => v || undefined);

function checkPattern(p?: string) {
  if (!p) return;
  try { new RegExp(p); } catch { fail('Matric pattern is not a valid regular expression'); }
}

async function assertUnused(kind: StructureKind, id: string, what: string) {
  const usage = await usageOf(kind, id);
  if (Object.keys(usage).length) fail(`${what} cannot be deleted while it is in use (${describeUsage(usage)}).`);
}

export async function updateFaculty(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({ name: z.string().trim().min(3), code: z.string().trim().min(2).max(10) }).parse(Object.fromEntries(fd));
    const f = await Faculty.findById(id);
    if (!f) missing('Faculty not found');
    const before = { name: f.name, code: f.code };
    f.set(d);
    await f.save();
    await audit(admin, 'structure.faculty_update', 'Faculty', id, before, d);
    return { ok: true, message: 'Faculty updated.' };
  });
}

export async function deleteFaculty(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const f = await Faculty.findById(id).lean();
    if (!f) missing('Faculty not found');
    await assertUnused('faculty', id, f.name);
    await Faculty.deleteOne({ _id: id });
    await audit(admin, 'structure.faculty_delete', 'Faculty', id, { name: f.name, code: f.code });
    return { ok: true, message: `${f.name} deleted.` };
  });
}

export async function updateDepartment(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({
      name: z.string().trim().min(3), code: z.string().trim().min(2).max(10), faculty: objectId, matricPattern: optPattern,
    }).parse(Object.fromEntries(fd));
    checkPattern(d.matricPattern);
    if (!(await Faculty.exists({ _id: d.faculty }))) missing('Faculty not found');
    const dep = await Department.findById(id);
    if (!dep) missing('Department not found');
    const before = { name: dep.name, code: dep.code, faculty: dep.faculty.toString(), matricPattern: dep.matricPattern };
    const moved = before.faculty !== d.faculty;
    dep.set({ ...d, matricPattern: d.matricPattern ?? null });
    await dep.save();
    // Department staff carry their faculty for scoping, so they follow a move.
    const staffMoved = moved ? (await User.updateMany({ department: id }, { $set: { faculty: d.faculty } })).modifiedCount : 0;
    await audit(admin, 'structure.department_update', 'Department', id, before, { ...d, staffMoved });
    return { ok: true, message: `Department updated.${moved ? ` Moved with ${staffMoved} staff account(s).` : ''}` };
  });
}

export async function deleteDepartment(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const dep = await Department.findById(id).lean();
    if (!dep) missing('Department not found');
    await assertUnused('department', id, dep.name);
    await Department.deleteOne({ _id: id });
    await audit(admin, 'structure.department_delete', 'Department', id, { name: dep.name, code: dep.code });
    return { ok: true, message: `${dep.name} deleted.` };
  });
}

export async function updateProgramme(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({
      name: z.string().trim().min(3), code: z.string().trim().min(2).max(20), degreeType: z.string().trim().min(1, 'Choose the degree'), department: objectId,
    }).parse(Object.fromEntries(fd));
    d.degreeType = await degreeCode(d.degreeType);
    const p = await Programme.findById(id);
    if (!p) missing('Programme not found');
    if (!(await Department.exists({ _id: d.department }))) missing('Department not found');
    const before = { name: p.name, code: p.code, degreeType: p.degreeType, department: p.department.toString() };
    if (before.department !== d.department) {
      const usage = await usageOf('programme', id);
      if (Object.keys(usage).length) fail(`This programme already has results (${describeUsage(usage)}), so it cannot move to another department.`);
    }
    p.set(d);
    await p.save();
    await audit(admin, 'structure.programme_update', 'Programme', id, before, d);
    return { ok: true, message: 'Programme updated. Existing records keep the degree title they were issued with.' };
  });
}

export async function deleteProgramme(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const p = await Programme.findById(id).lean();
    if (!p) missing('Programme not found');
    await assertUnused('programme', id, p.name);
    await Programme.deleteOne({ _id: id });
    await audit(admin, 'structure.programme_delete', 'Programme', id, { name: p.name, code: p.code });
    return { ok: true, message: `${p.name} deleted.` };
  });
}

export async function updateSession(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const startYear = z.coerce.number().int().min(1960).max(2100).parse(fd.get('startYear'));
    const s = await AcademicSession.findById(id);
    if (!s) missing('Session not found');
    const usage = await usageOf('session', id);
    if (Object.keys(usage).length) fail(`Session ${s.label} is in use (${describeUsage(usage)}), so its year cannot change.`);
    const before = { label: s.label };
    s.set({ label: `${startYear}/${startYear + 1}`, startYear });
    await s.save();
    await audit(admin, 'structure.session_update', 'AcademicSession', id, before, { label: s.label });
    return { ok: true, message: `Session changed to ${s.label}.` };
  });
}

export async function deleteSession(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const s = await AcademicSession.findById(id).lean();
    if (!s) missing('Session not found');
    await assertUnused('session', id, `Session ${s.label}`);
    await AcademicSession.deleteOne({ _id: id });
    await audit(admin, 'structure.session_delete', 'AcademicSession', id, { label: s.label });
    return { ok: true, message: `Session ${s.label} deleted.` };
  });
}

// ---------------------------------------------------------------- grading bands

const BAND_CLASSES = ['DISTINCTION', 'CREDIT', 'MERIT', 'PASS'] as const;

export async function saveGradingBands(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const cgpa = z.coerce.number().min(0, 'CGPA must be 0–5').max(5, 'CGPA must be 0–5');
    const min = Object.fromEntries(BAND_CLASSES.map((c) => [c, Math.round(cgpa.parse(fd.get(c)) * 100) / 100]));
    if (!(min.DISTINCTION > min.CREDIT && min.CREDIT > min.MERIT && min.MERIT > min.PASS && min.PASS > 0)) {
      fail('Each class must start above the one below it: Distinction > Credit > Merit > Pass > 0.');
    }
    const bands: Band[] = [...BAND_CLASSES.map((cls) => ({ cls, min: min[cls] })), { cls: 'FAIL', min: 0 }];
    const { bands: before } = await getGradingBands();
    await Setting.findByIdAndUpdate(GRADING_KEY, { $set: { value: bands, updatedBy: admin.id } }, { upsert: true });
    await audit(admin, 'structure.grading_update', 'Setting', GRADING_KEY, before, bands);
    return { ok: true, message: 'Grading bands saved. Indexing and submission checks use them from now on.' };
  });
}

// ---------------------------------------------------------------- degrees

const DegreeForm = z.object({
  code: z.string().trim().regex(/^[A-Za-z][A-Za-z.]{1,11}$/, 'Code: 2–12 letters, e.g. MEng'),
  name: z.string().trim().min(5, 'Enter the full name, e.g. Master of Engineering').max(120),
  aliases: z.string().trim().max(300).optional(),
  classified: z.string().optional(),
  order: z.coerce.number().int().min(0).max(999).optional(),
});

/** Code, full name, other spellings and class-of-degree setting; spellings may not clash with another degree. */
async function readDegree(fd: FormData, selfId?: string) {
  const d = DegreeForm.parse(Object.fromEntries(fd));
  const code = d.code.replace(/\./g, '');
  const aliases = [...new Set((d.aliases ?? '').split(',').map((a) => a.trim()).filter(Boolean))].slice(0, 12);
  const others = (await getDegrees()).filter((x) => x.id !== selfId);
  for (const s of [code, ...aliases]) {
    const clash = findDegree(s, others);
    if (clash) fail(`"${s}" is already used by ${clash.code} (${clash.name})`);
  }
  return { code, name: d.name, aliases, classified: d.classified === 'on', order: d.order };
}

export async function createDegree(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = await readDegree(fd);
    const last = await Degree.findOne().sort({ order: -1 }).select('order').lean();
    const created = await Degree.create({ ...d, order: d.order ?? (last?.order ?? 0) + 1 });
    await audit(admin, 'structure.degree_create', 'Degree', created.id, undefined, d);
    return { ok: true, message: `${d.code} (${d.name}) added. It can now be chosen for programmes.` };
  });
}

export async function updateDegree(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const deg = await Degree.findById(id);
    if (!deg) missing('Degree not found');
    const d = await readDegree(fd, id);
    const used = await Programme.countDocuments({ degreeType: deg!.code });
    if (d.code !== deg!.code && used) fail(`${used} programme(s) use ${deg!.code}, so its code cannot change. Edit the name or spellings instead.`);
    const before = { code: deg!.code, name: deg!.name, aliases: deg!.aliases, classified: deg!.classified, order: deg!.order };
    deg!.set({ ...d, order: d.order ?? deg!.order });
    await deg!.save();
    await audit(admin, 'structure.degree_update', 'Degree', id, before, d);
    return { ok: true, message: `${d.code} updated. Documents issued from now on use the new name.` };
  });
}

export async function deleteDegree(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const deg = await Degree.findById(id).lean();
    if (!deg) missing('Degree not found');
    const used = await Programme.countDocuments({ degreeType: deg!.code });
    if (used) fail(`${deg!.code} cannot be deleted while ${used} programme(s) use it.`);
    await Degree.deleteOne({ _id: id });
    await audit(admin, 'structure.degree_delete', 'Degree', id, { code: deg!.code, name: deg!.name });
    return { ok: true, message: `${deg!.code} deleted.` };
  });
}
