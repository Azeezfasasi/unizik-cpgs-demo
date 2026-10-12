'use server';

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail } from '@/lib/errors';
import { sendMail, link } from '@/lib/mail';
import { esc } from '@/lib/format';
import { ROLE_LABELS, type Role } from '@/lib/rbac';
import { UserCreateSchema, objectId } from '@/lib/validators';
import type { ActionState } from '@/lib/action-state';
import { AcademicSession, Department, Faculty, Programme, User } from '@/models';
import { DEGREE_TYPES } from '@/models/Programme';

function tempPassword() {
  // 16 chars, guaranteed upper, lower and digit.
  const base = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x');
  return `${base}A7a`.slice(0, 16);
}

async function resolveUnit(role: Role, department?: string, faculty?: string) {
  if (role === 'DEPT_OFFICER' || role === 'HOD') {
    if (!department) fail('Pick the department for this role');
    const d = await Department.findById(department).lean();
    if (!d) fail('Department not found');
    return { department: d!._id, faculty: d!.faculty };
  }
  if (role === 'FACULTY_PG') {
    if (!faculty) fail('Pick the faculty for this role');
    if (!(await Faculty.exists({ _id: faculty }))) fail('Faculty not found');
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
    if (!u) fail('User not found');
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
    if (!u) fail('User not found');
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

export async function createProgramme(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('structure:manage');
    await db();
    const d = z.object({
      name: z.string().trim().min(3), code: z.string().trim().min(2).max(20),
      degreeType: z.enum(DEGREE_TYPES), department: objectId,
    }).parse(Object.fromEntries(fd));
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
