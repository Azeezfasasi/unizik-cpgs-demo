import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { Types } from 'mongoose';
import { db } from './db';
import { readSession } from './session';
import { can, DEPARTMENT_ROLES, FACULTY_ROLES, type Permission, type Role } from './rbac';
import { User, Department } from '@/models';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  faculty?: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  /** Second factor satisfied in this session. */
  mfaPassed: boolean;
};

export const mfaRequired = () => process.env.REQUIRE_MFA !== 'false';

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403 = 403) {
    super(message);
  }
}

/**
 * Reads the session cookie and re-loads the user from the database on every request,
 * so a deactivated account or a role change takes effect immediately. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await readSession();
  if (!s) return null;
  await db();
  const u = await User.findById(s.uid).lean();
  if (!u || !u.isActive) return null;
  return {
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role as Role,
    department: u.department?.toString(),
    faculty: u.faculty?.toString(),
    mfaEnabled: !!u.mfaEnabled,
    mustChangePassword: !!u.mustChangePassword,
    mfaPassed: s.mfa,
  };
});

/** For pages: redirects to login or the pending account-setup step. */
export async function requireUser(opts: { allowSetup?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!opts.allowSetup) {
    if (user.mustChangePassword) redirect('/setup/password');
    if (mfaRequired() && !user.mfaPassed) redirect('/mfa');
  }
  return user;
}

/** For pages: requires one of the permissions, otherwise back to the dashboard. */
export async function requirePage(...perms: Permission[]) {
  const user = await requireUser();
  if (perms.length && !perms.some((p) => can(user.role, p))) redirect('/dashboard?denied=1');
  return user;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requirePermission(...perms: Permission[]) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('You are not signed in', 401);
  if (user.mustChangePassword || (mfaRequired() && !user.mfaPassed)) {
    throw new AuthError('Complete account setup first', 401);
  }
  if (perms.length && !perms.some((p) => can(user.role, p))) {
    throw new AuthError('You do not have permission to do this');
  }
  return user;
}

/** Departments a scoped user may see; null means no restriction. */
export async function scopedDepartmentIds(user: CurrentUser): Promise<Types.ObjectId[] | null> {
  if (DEPARTMENT_ROLES.includes(user.role)) {
    return user.department ? [new Types.ObjectId(user.department)] : [];
  }
  if (FACULTY_ROLES.includes(user.role)) {
    if (!user.faculty) return [];
    const depts = await Department.find({ faculty: user.faculty }).select('_id').lean();
    return depts.map((d) => d._id);
  }
  return null;
}

/** Mongo filter on `department` for queries made by this user. */
export async function scopeFilter(user: CurrentUser) {
  const ids = await scopedDepartmentIds(user);
  return ids ? { department: { $in: ids } } : {};
}

export async function assertInScope(user: CurrentUser, departmentId: Types.ObjectId | string) {
  const ids = await scopedDepartmentIds(user);
  if (ids && !ids.some((id) => id.equals(departmentId))) {
    throw new AuthError('This record is outside your department or faculty');
  }
}
