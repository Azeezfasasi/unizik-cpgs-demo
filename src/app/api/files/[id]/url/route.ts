import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { AuthError, requirePermission } from '@/lib/auth';
import { canOpenFile, handle } from '@/lib/api';
import { audit } from '@/lib/audit';
import { signedViewUrl } from '@/lib/storage';
import { StoredFile } from '@/models';

/** Returns a 5-minute signed link to a scan after checking access; every call is audited. */
export const GET = handle(async (_req: Request, ctx: RouteContext<'/api/files/[id]/url'>) => {
  const user = await requirePermission();
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) return Response.json({ error: 'Not found' }, { status: 404 });
  await db();
  const file = await StoredFile.findById(id).lean();
  if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!(await canOpenFile(user, file))) throw new AuthError('You cannot open this file');
  await audit(user, 'file.view', 'StoredFile', id, undefined, { name: file.originalName });
  return Response.json({ url: signedViewUrl(file), format: file.format ?? 'pdf', expiresIn: 300 },
    { headers: { 'cache-control': 'no-store' } });
});
