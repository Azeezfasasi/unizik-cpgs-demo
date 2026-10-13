import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle, uploadTarget } from '@/lib/api';
import { signCloudinaryUpload, STORAGE_NOT_CONFIGURED, storageDriver } from '@/lib/storage';
import { fail } from '@/lib/errors';

const Body = z.object({
  purpose: z.enum(['LEGACY_SCAN', 'SUBMISSION_SCAN', 'AMENDMENT_EVIDENCE']),
  sheetId: z.string().optional(),
  recordId: z.string().optional(),
});

export const POST = handle(async (req: Request) => {
  const user = await requirePermission('legacy:upload', 'submission:create', 'amendment:request');
  const body = Body.parse(await req.json());
  await db();
  const { folder } = await uploadTarget(user, body.purpose, body);
  const driver = storageDriver();
  if (driver === 'unconfigured') fail(STORAGE_NOT_CONFIGURED);
  if (driver === 'local') return Response.json({ driver: 'local' });
  return Response.json({ driver: 'cloudinary', ...signCloudinaryUpload(folder, user.id) });
});
