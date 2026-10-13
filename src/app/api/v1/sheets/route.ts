import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { listSheets } from '@/lib/queries';
import { viewableSheetsFilter } from '@/lib/sheet-access';
import { SHEET_STATUS } from '@/models/ResultSheet';
import { fromAction, json, pageMeta, paging, readJson, toForm, v1 } from '@/lib/v1';
import { createLegacySheet, createOnlineSheet } from '@/app/(portal)/sheets/actions';
import { ResultSheet } from '@/models';

/** Result sheets the caller may see. Query: origin, status, department, session, programme, batch, page, limit. */
export const GET = v1(async (req: Request) => {
  const user = await requirePermission();
  await db();
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const filter: Record<string, unknown> = { ...(await viewableSheetsFilter(user)) };
  if (sp.origin === 'LEGACY' || sp.origin === 'ONLINE') filter.origin = sp.origin;
  if (sp.status && (SHEET_STATUS as readonly string[]).includes(sp.status)) filter.status = sp.status;
  for (const k of ['session', 'programme', 'batch'] as const) if (sp[k] && Types.ObjectId.isValid(sp[k])) filter[k] = sp[k];
  if (sp.department && Types.ObjectId.isValid(sp.department)) {
    filter.$and = [{ department: sp.department }, ...(filter.department ? [{ department: filter.department }] : [])];
    delete filter.department;
  }
  const { page, limit, skip } = paging(url);
  const [total, rows] = await Promise.all([ResultSheet.countDocuments(filter), listSheets(filter, skip + limit)]);
  return json({ data: rows.slice(skip), meta: pageMeta(page, limit, total) });
});

/**
 * Create a result sheet.
 * Online (Department PG Coordinator): { origin: "ONLINE", programme, session }.
 * Legacy (Indexer / Taskforce Lead): { origin: "LEGACY", batch, programme, session }.
 */
export const POST = v1(async (req: Request) => {
  await requirePermission();
  const body = await readJson(req);
  const fd = toForm(body, { __api: '1' });
  const res = body.origin === 'LEGACY' ? await createLegacySheet({}, fd) : await createOnlineSheet({}, fd);
  if (!res.ok) return fromAction(res);
  await db();
  const sheet = await ResultSheet.findById(res.data?.id).select('reference status origin').lean();
  return json({ ok: true, data: { id: res.data?.id, reference: sheet?.reference, status: sheet?.status, origin: sheet?.origin } }, 201);
});
