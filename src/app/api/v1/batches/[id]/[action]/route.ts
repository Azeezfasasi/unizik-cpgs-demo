import { requirePermission } from '@/lib/auth';
import { apiError, assertId, fromAction, param, readJson, toForm, v1, type RouteCtx } from '@/lib/v1';
import { assignBatch, setBatchStatus } from '@/app/(portal)/digitization/actions';
import { importBoardList } from '@/app/(portal)/sheets/actions';

/**
 * PUT /batches/{id}/assignments  { indexer?, reviewer? }  (must be different people)
 * PUT /batches/{id}/status       { status: INVENTORIED | IN_PROGRESS | COMPLETED }
 */
export const PUT = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('batch:assign');
  const id = await param(ctx);
  assertId(id, 'Box');
  const body = await readJson(req);
  switch (await param(ctx, 'action')) {
    case 'assignments': return fromAction(await assignBatch(id, {}, toForm(body)));
    case 'status': return fromAction(await setBatchStatus(id, {}, toForm(body)));
    default: return apiError(404, 'Unknown box action. Use assignments or status.');
  }
});

/**
 * POST /batches/{id}/board-list  multipart: file (.xlsx, .xls or .csv), session (id), mode=check|import
 * Imports a PG Board result list: one legacy sheet per programme, filled with its graduands.
 */
export const POST = v1(async (req: Request, ctx: RouteCtx) => {
  await requirePermission('legacy:upload');
  const id = await param(ctx);
  assertId(id, 'Box');
  if ((await param(ctx, 'action')) !== 'board-list') return apiError(404, 'Unknown box action. Use board-list.');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return apiError(400, 'Send the board list as multipart/form-data with a "file" field');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('session', String(form?.get('session') ?? ''));
  const mode = form?.get('mode') === 'check' ? 'check' : 'import';
  fd.append('mode', mode);
  const res = await importBoardList(id, {}, fd);
  return fromAction(res, mode === 'import' && res.ok ? 201 : 200);
});
