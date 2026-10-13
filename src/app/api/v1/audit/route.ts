import { db } from '@/lib/db';
import { json, out, pageMeta, paging, requireRead, v1 } from '@/lib/v1';
import { AuditLog } from '@/models';

/** The hash-chained audit log, newest first. Query: action (prefix), actor (name), entityId, from, to (YYYY-MM-DD), page, limit. */
export const GET = v1(async (req: Request) => {
  await requireRead('audit:read');
  await db();
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const filter: Record<string, unknown> = {};
  if (sp.action) filter.action = { $regex: `^${sp.action.replace(/[^\w.]/g, '')}` };
  if (sp.actor) filter.actorName = { $regex: sp.actor.replace(/[^\w\s.-]/g, ''), $options: 'i' };
  if (sp.entityId) filter.entityId = sp.entityId.trim();
  if (sp.from || sp.to) {
    filter.at = { ...(sp.from ? { $gte: new Date(sp.from) } : {}), ...(sp.to ? { $lte: new Date(`${sp.to}T23:59:59`) } : {}) };
  }
  const { page, limit, skip } = paging(url, 200);
  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ seq: -1 }).skip(skip).limit(limit).lean(),
  ]);
  return json({ data: rows.map((e) => out(e)), meta: pageMeta(page, limit, total) });
});
