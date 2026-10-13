import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { cloudinaryDownloadUrl, readLocal, verifyViewToken } from '@/lib/storage';
import { StoredFile } from '@/models';

const TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

function message(status: number, text: string) {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

/**
 * Serves a stored scan to holders of a valid, unexpired signed link (issued by the audited
 * /api/files/[id]/url). Cloudinary assets are fetched server-side and streamed through.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/files/[id]/raw'>) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (!Types.ObjectId.isValid(id) || !verifyViewToken(id, Number(url.searchParams.get('exp')), url.searchParams.get('token') ?? '')) {
    return message(403, 'This secure link has expired. Close and reopen the scan.');
  }
  await db();
  const file = await StoredFile.findById(id).lean();
  if (!file) return message(404, 'Scan not found.');

  const headers = {
    'content-type': TYPES[file.format ?? 'pdf'] ?? 'application/octet-stream',
    'content-disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${(file.originalName ?? 'scan').replace(/[^\w.\- ]/g, '_')}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  };

  if (file.storage === 'cloudinary') {
    const upstream = await fetch(cloudinaryDownloadUrl(file, 60));
    if (!upstream.ok || !upstream.body) {
      console.error('[files] cloudinary download failed', upstream.status, file.publicId);
      return message(502, 'The scan could not be fetched from storage. Please try again shortly.');
    }
    // Streamed, so large scans are not held in memory or limited by the buffered response size.
    return new Response(upstream.body, {
      headers: { ...headers, ...(upstream.headers.get('content-length') ? { 'content-length': upstream.headers.get('content-length')! } : {}) },
    });
  }

  try {
    return new Response(new Uint8Array(await readLocal(file.publicId)), { headers });
  } catch {
    return message(410,
      'This scan is no longer available: it was saved to temporary server storage before file storage was configured. ' +
      'Please re-upload it.');
  }
}
