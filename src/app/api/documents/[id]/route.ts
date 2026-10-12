import { db } from '@/lib/db';
import { getCurrentUser, mfaRequired } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { audit } from '@/lib/audit';
import { buildDocumentPdf, documentLinkValid } from '@/lib/documents';

/**
 * Downloads an issued statement or transcript. Records staff download when signed in;
 * recipients use the time-limited signed link sent by email.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/documents/[id]'>) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  const user = await getCurrentUser();
  const staffOk = !!user && can(user.role, 'transcript:issue') && !user.mustChangePassword && (!mfaRequired() || user.mfaPassed);
  const linkOk = !!token && documentLinkValid(id, Number(url.searchParams.get('exp')), token);
  if (!staffOk && !linkOk) return new Response('This link has expired or is not valid.', { status: 403 });

  await db();
  const doc = await buildDocumentPdf(id);
  if ('error' in doc) return new Response(doc.error, { status: doc.error === 'Not found' ? 404 : 410 });

  await audit(staffOk ? user : null, staffOk ? 'document.download' : 'document.download_link', 'Verification', id, undefined, { code: doc.v.code });
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
