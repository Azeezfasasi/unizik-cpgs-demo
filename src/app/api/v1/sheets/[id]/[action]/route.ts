import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import {
  decideSheet, importLegacyRows, lockSheet, markIndexed, qaDecision, returnFromRecords, submitSheet, uploadWorkbook,
} from '@/app/(portal)/sheets/actions';
import { GET as signingSheet } from '@/app/api/sheets/[id]/signing-sheet/route';
import { GET as template } from '@/app/api/templates/result-sheet/route';
import { ResultSheet } from '@/models';

async function sheetId(ctx: RouteCtx) {
  const id = await param(ctx);
  assertId(id, 'Sheet');
  await db();
  return (await ResultSheet.exists({ _id: id })) ? id : null;
}

/**
 * POST /sheets/{id}/workbook   multipart: file           (online: replace rows from the template)
 * POST /sheets/{id}/import     multipart: file, sourceFile (legacy: add/update rows from the template)
 * POST /sheets/{id}/submit     { attest: true }
 * POST /sheets/{id}/decision   { decision: approve|return, comment?, senateDate? }
 * POST /sheets/{id}/send-to-qa
 * POST /sheets/{id}/qa         { decision: pass|return, comment?, attest? }
 * POST /sheets/{id}/lock       { comment?, acceptIllegible? }
 * POST /sheets/{id}/return     { comment }   (Head of Records returns a QA-passed legacy sheet)
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission();
  const id = await sheetId(ctx);
  if (!id) return apiError(404, 'Sheet not found');
  const action = await param(ctx, 'action');

  if (action === 'workbook' || action === 'import') {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return apiError(400, 'Send the template as multipart/form-data with a "file" field');
    if (action === 'workbook') {
      const fd = new FormData();
      fd.append('workbook', file);
      return fromAction(await uploadWorkbook(id, {}, fd));
    }
    const fd = new FormData();
    fd.append('file', file);
    if (form?.get('sourceFile')) fd.append('sourceFile', String(form.get('sourceFile')));
    return fromAction(await importLegacyRows(id, {}, fd));
  }

  const body = await readJson(req);
  switch (action) {
    case 'submit': return fromAction(await submitSheet(id, {}, toForm(body)));
    case 'decision': return fromAction(await decideSheet(id, {}, toForm(body)));
    case 'send-to-qa': return fromAction(await markIndexed(id));
    case 'qa': return fromAction(await qaDecision(id, {}, toForm(body)));
    case 'lock': return fromAction(await lockSheet(id, {}, toForm(body)));
    case 'return': return fromAction(await returnFromRecords(id, {}, toForm(body)));
    default: return apiError(404, 'Unknown sheet action');
  }
});

/**
 * GET /sheets/{id}/signing-sheet   PDF for signing (online) or certified transcription (legacy)
 * GET /sheets/{id}/template        result template for this sheet; ?format=csv for CSV
 */
export const GET = v1(async (req: Request, ctx: RouteCtx) => {
  const id = await param(ctx);
  const action = await param(ctx, 'action');
  if (action === 'signing-sheet') return signingSheet(req, { params: Promise.resolve({ id }) });
  if (action === 'template') {
    const url = new URL(req.url);
    const target = new URL(`/api/templates/result-sheet?sheet=${encodeURIComponent(id)}${url.searchParams.get('format') === 'csv' ? '&format=csv' : ''}`, url);
    return template(new Request(target, { headers: req.headers }));
  }
  return apiError(404, 'Unknown sheet resource');
});
