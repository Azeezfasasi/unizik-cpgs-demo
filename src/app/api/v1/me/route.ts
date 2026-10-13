import { requirePermission } from '@/lib/auth';
import { db } from '@/lib/db';
import { PERMISSIONS, ROLE_LABELS, canSee, type Permission } from '@/lib/rbac';
import { json, v1 } from '@/lib/v1';
import { Department, Faculty } from '@/models';
import ApiKey from '@/models/ApiKey';

/** The account the API key acts as, with what it may do. */
export const GET = v1(async () => {
  const user = await requirePermission();
  await db();
  const [dept, fac, key] = await Promise.all([
    user.department ? Department.findById(user.department).select('name code').lean() : null,
    user.faculty ? Faculty.findById(user.faculty).select('name code').lean() : null,
    user.apiKeyId ? ApiKey.findById(user.apiKeyId).select('name keyId expiresAt createdAt').lean() : null,
  ]);
  const permissions = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => (PERMISSIONS[p] as readonly string[]).includes(user.role));
  const readable = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => canSee(user.role, p));
  return json({
    data: {
      id: user.id, name: user.name.replace(/ \[API: .*\]$/, ''), email: user.email,
      role: user.role, roleLabel: ROLE_LABELS[user.role],
      department: dept ? { id: String(dept._id), name: dept.name, code: dept.code } : null,
      faculty: fac ? { id: String(fac._id), name: fac.name, code: fac.code } : null,
      permissions, readable,
      apiKey: key ? { name: key.name, keyId: key.keyId, expiresAt: key.expiresAt ?? null, createdAt: key.createdAt } : null,
    },
  });
});
