'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail, missing } from '@/lib/errors';
import { generateApiKey } from '@/lib/apikeys';
import type { ActionState } from '@/lib/action-state';
import ApiKey from '@/models/ApiKey';
import { User } from '@/models';

const Create = z.object({
  name: z.string().trim().min(3, 'Name the application (at least 3 characters)').max(80),
  owner: z.string().refine((v) => Types.ObjectId.isValid(v), 'Choose the account the key acts as'),
  expiresInDays: z.coerce.number().int().min(0).max(1825),
});

/** Creates a key that acts as the chosen staff account. The key is returned once and never stored. */
export async function createApiKey(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    // API calls cannot create keys: a key must not be able to mint more keys.
    const admin = await requirePermission('apikeys:manage');
    if (admin.apiKeyId) fail('API keys can only be created in the portal');
    await db();
    const d = Create.parse(Object.fromEntries(fd));
    const owner = await User.findOne({ _id: d.owner, isActive: true }).lean();
    if (!owner) fail('Choose an active account');
    const { key, keyId, hash } = generateApiKey();
    const expiresAt = d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 864e5) : undefined;
    const doc = await ApiKey.create({ name: d.name, keyId, hash, owner: owner!._id, createdBy: admin.id, expiresAt });
    await audit(admin, 'apikey.create', 'ApiKey', doc.id, undefined, { name: d.name, keyId, owner: owner!.email, role: owner!.role, expiresAt });
    return { ok: true, message: `Key created for "${d.name}". Copy it now: it will not be shown again.`, data: { apiKey: key } };
  });
}

export async function revokeApiKey(id: string): Promise<ActionState> {
  return run(async () => {
    const admin = await requirePermission('apikeys:manage');
    if (admin.apiKeyId) fail('API keys can only be revoked in the portal');
    if (!Types.ObjectId.isValid(id)) missing('Key not found');
    await db();
    const k = await ApiKey.findById(id);
    if (!k) missing('Key not found');
    if (k!.revokedAt) fail('Already revoked');
    k!.revokedAt = new Date();
    await k!.save();
    await audit(admin, 'apikey.revoke', 'ApiKey', id, { active: true }, { active: false, name: k!.name, keyId: k!.keyId });
    return { ok: true, message: `"${k!.name}" revoked. Applications using it are refused immediately.` };
  });
}
