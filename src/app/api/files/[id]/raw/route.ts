import { db } from '@/lib/db';
import { readLocal, verifyLocalToken } from '@/lib/storage';
import { StoredFile } from '@/models';

const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** Serves a locally stored scan to holders of a valid, unexpired signed link. */
export async function GET(req: Request, ctx: RouteContext<'/api/files/[id]/raw'>) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (!verifyLocalToken(id, Number(url.searchParams.get('exp')), url.searchParams.get('token') ?? '')) {
    return new Response('Link expired', { status: 403 });
  }
  await db();
  const file = await StoredFile.findById(id).lean();
  if (!file || file.storage !== 'local') return new Response('Not found', { status: 404 });
  const data = await readLocal(file.publicId);
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': TYPES[file.format ?? 'pdf'] ?? 'application/octet-stream',
      'content-disposition': `inline; filename="${(file.originalName ?? 'scan').replace(/[^\w.\- ]/g, '_')}"`,
      'cache-control': 'private, no-store',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': "frame-ancestors 'self'",
    },
  });
}
