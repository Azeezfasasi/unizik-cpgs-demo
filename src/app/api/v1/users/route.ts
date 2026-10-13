import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { ROLES } from '@/lib/rbac';
import { fromAction, json, pageMeta, paging, readJson, toForm, userOut, v1 } from '@/lib/v1';
import { createUser } from '@/app/(portal)/admin/actions';
import { Department, User } from '@/models';

const SECURITY: Record<string, Record<string, unknown>> = {
  mfa_on: { mfaEnabled: true }, mfa_off: { mfaEnabled: { $ne: true } }, temp_password: { mustChangePassword: true },
  locked: { lockedUntil: { $gt: new Date(0) } }, never: { lastLoginAt: null },
};

/** Staff accounts, with the same search and filters as the Users page. */
export const GET = v1(async (req: Request) => {
  await requirePermission('user:manage');
  await db();
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const and: Record<string, unknown>[] = [];
  if (sp.q) {
    const rx = { $regex: sp.q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    and.push({ $or: [{ name: rx }, { email: rx }] });
  }
  if (sp.role && (ROLES as readonly string[]).includes(sp.role)) and.push({ role: sp.role });
  if (sp.department && Types.ObjectId.isValid(sp.department)) and.push({ department: sp.department });
  if (sp.faculty && Types.ObjectId.isValid(sp.faculty)) {
    const depts = await Department.find({ faculty: sp.faculty }).select('_id').lean();
    and.push({ $or: [{ faculty: sp.faculty }, { department: { $in: depts.map((d) => d._id) } }] });
  }
  if (sp.status === 'active') and.push({ isActive: true });
  if (sp.status === 'inactive') and.push({ isActive: false });
  if (sp.security === 'locked') and.push({ lockedUntil: { $gt: new Date() } });
  else if (sp.security && SECURITY[sp.security]) and.push(SECURITY[sp.security]);
  const filter = and.length ? { $and: and } : {};
  const { page, limit, skip } = paging(url);
  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ isActive: -1, role: 1, name: 1 }).skip(skip).limit(limit)
      .populate('department', 'name code').populate('faculty', 'name code').lean(),
  ]);
  return json({ data: users.map((u) => userOut(u as never)), meta: pageMeta(page, limit, total) });
});

/** Create a staff account. The temporary password is returned once and emailed to the user. */
export const POST = v1(async (req: Request) => {
  await requirePermission('user:manage');
  const body = await readJson(req);
  const res = await createUser({}, toForm(body));
  if (!res.ok) return fromAction(res);
  await db();
  const u = await User.findOne({ email: String(body.email).trim().toLowerCase() })
    .populate('department', 'name code').populate('faculty', 'name code').lean();
  return json({ ok: true, message: res.message, data: { user: u ? userOut(u as never) : null, temporaryPassword: res.data?.tempPassword } }, 201);
});
