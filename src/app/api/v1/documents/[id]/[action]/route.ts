import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { revokeDocument, sendDocument } from '@/app/(portal)/transcripts/actions';
import { GET as documentPdf } from '@/app/api/documents/[id]/route';

/** GET /documents/{id}/pdf  the issued statement or transcript as PDF (?download=1 for an attachment). */
export const GET = v1(async (req: Request, ctx: RouteCtx) => {
  const id = await param(ctx);
  if ((await param(ctx, 'action')) !== 'pdf') return apiError(404, 'Unknown document resource');
  await requirePermission('transcript:issue');
  return documentPdf(req, { params: Promise.resolve({ id }) });
});

/**
 * POST /documents/{id}/revoke  { reason }  withdraws the document; verification shows it as revoked.
 * POST /documents/{id}/email   { recipients }  emails the PDF to each address (array or comma-separated).
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('transcript:issue');
  const id = await param(ctx);
  assertId(id, 'Document');
  const action = await param(ctx, 'action');
  const body = await readJson(req);
  if (action === 'revoke') return fromAction(await revokeDocument(id, {}, toForm(body)));
  if (action === 'email') {
    const recipients = Array.isArray(body.recipients) ? body.recipients.join(',') : String(body.recipients ?? '');
    return fromAction(await sendDocument(id, {}, toForm({ recipients })));
  }
  return apiError(404, 'Unknown document action');
});
