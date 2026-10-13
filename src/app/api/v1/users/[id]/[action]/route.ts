import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, json, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { resetCredentials, setUserActive } from '@/app/(portal)/admin/actions';
import { User } from '@/models';

/**
 * POST /users/{id}/activate | deactivate | reset-password | reset-mfa.
 * reset-password returns a new temporary password once.
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('user:manage');
  const id = await param(ctx);
  const action = await param(ctx, 'action');
  assertId(id, 'User');
  await db();
  if (!(await User.exists({ _id: id }))) return apiError(404, 'User not found');
  await readJson(req).catch(() => ({}));

  switch (action) {
    case 'activate':
    case 'deactivate':
      return fromAction(await setUserActive(id, {}, toForm({ active: action === 'activate' ? 'true' : 'false' })));
    case 'reset-password': {
      const res = await resetCredentials(id, {}, toForm({ what: 'password' }));
      if (!res.ok) return fromAction(res);
      return json({ ok: true, message: res.message, data: { temporaryPassword: res.data?.tempPassword } });
    }
    case 'reset-mfa':
      return fromAction(await resetCredentials(id, {}, toForm({ what: 'mfa' })));
    default:
      return apiError(404, 'Unknown action. Use activate, deactivate, reset-password or reset-mfa.');
  }
});
