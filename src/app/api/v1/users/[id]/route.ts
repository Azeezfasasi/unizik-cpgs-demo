import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, json, param, readJson, toForm, userOut, v1, type RouteCtx } from '@/lib/v1';
import { updateUser } from '@/app/(portal)/admin/actions';
import { User } from '@/models';

const load = (id: string) => User.findById(id).populate('department', 'name code').populate('faculty', 'name code').lean();

export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  await requirePermission('user:manage');
  const id = await param(ctx);
  assertId(id, 'User');
  await db();
  const u = await load(id);
  return u ? json({ data: userOut(u as never) }) : apiError(404, 'User not found');
});

/** Change role and unit. Body: { role, department?, faculty? }; unspecified fields keep current values. */
export const PATCH = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('user:manage');
  const id = await param(ctx);
  assertId(id, 'User');
  await db();
  const u = await User.findById(id).lean();
  if (!u) return apiError(404, 'User not found');
  const body = await readJson(req);
  const merged = {
    role: body.role ?? u.role,
    department: 'department' in body ? body.department ?? '' : u.department?.toString() ?? '',
    faculty: 'faculty' in body ? body.faculty ?? '' : u.faculty?.toString() ?? '',
  };
  const res = await updateUser(id, {}, toForm(merged));
  if (!res.ok) return fromAction(res);
  return json({ ok: true, message: res.message, data: userOut((await load(id)) as never) });
});
