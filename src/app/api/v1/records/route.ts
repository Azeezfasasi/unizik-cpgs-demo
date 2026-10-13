import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { findRecords, recordFilter, type RecordRow, type SearchParams } from '@/lib/search';
import { GraduandRecord } from '@/models';
import { json, out, pageMeta, paging, requireRead, v1 } from '@/lib/v1';

/**
 * Search graduand records. Query: q (matric, name or thesis words), faculty, department, programme,
 * session, cls, origin (LEGACY|ONLINE), locked (1|0), page, limit. Scoped to the caller's department/faculty.
 */
export const GET = v1(async (req: Request) => {
  const user = await requireRead('record:read');
  await db();
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams) as SearchParams;
  const { page, limit, skip } = paging(url);
  const filter = await recordFilter(user, sp);
  const [total, rows] = await Promise.all([
    GraduandRecord.countDocuments(filter),
    findRecords(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('programme', 'name code degreeType').lean<RecordRow[]>(),
  ]);
  await audit(user, 'record.search', 'GraduandRecord', undefined, undefined, { ...sp, results: total, via: 'api' });
  return json({
    data: rows.map((r) => {
      const o = out(r);
      delete o.history;
      delete o.courses;
      return o;
    }),
    meta: pageMeta(page, limit, total),
  });
});
