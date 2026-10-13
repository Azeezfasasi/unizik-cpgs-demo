import { Types } from 'mongoose';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { isLinked, linksFor } from '@/lib/files';
import { storeUpload } from '@/lib/uploads';
import { FILE_PURPOSES } from '@/models/StoredFile';
import { apiError, json, out, pageMeta, paging, requireRead, v1 } from '@/lib/v1';
import { Amendment, GraduandRecord, ResultSheet, StoredFile } from '@/models';

/** The file register. Query: q (name, path or checksum prefix), purpose, department, linked (yes|no), page, limit. */
export const GET = v1(async (req: Request) => {
  await requireRead('files:read');
  await db();
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const filter: Record<string, unknown> = {};
  if (sp.q) {
    const rx = { $regex: sp.q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [{ originalName: rx }, { publicId: rx }, ...(/^[a-f0-9]{6,64}$/i.test(sp.q) ? [{ sha256: { $regex: `^${sp.q.toLowerCase()}` } }] : [])];
  }
  if (sp.purpose && (FILE_PURPOSES as readonly string[]).includes(sp.purpose)) filter.purpose = sp.purpose;
  if (sp.department && Types.ObjectId.isValid(sp.department)) filter.department = sp.department;
  if (sp.linked === 'yes' || sp.linked === 'no') {
    const ids = [...new Set([...(await ResultSheet.distinct('files')), ...(await GraduandRecord.distinct('sourceFile')), ...(await Amendment.distinct('evidence'))].filter(Boolean).map(String))];
    filter._id = sp.linked === 'yes' ? { $in: ids } : { $nin: ids };
  }
  const { page, limit, skip } = paging(url);
  const [total, rows] = await Promise.all([
    StoredFile.countDocuments(filter),
    StoredFile.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('uploadedBy', 'name').populate('department', 'name code').lean(),
  ]);
  const links = await linksFor(rows.map((r) => r._id));
  return json({
    data: rows.map((r) => {
      const l = links.get(String(r._id))!;
      return { ...out(r), attachedTo: l, linked: isLinked(l) };
    }),
    meta: pageMeta(page, limit, total),
  });
});

/**
 * Upload a file without attaching it: multipart/form-data with file, purpose
 * (LEGACY_SCAN | SUBMISSION_SCAN | AMENDMENT_EVIDENCE) and sheetId or recordId.
 * Use the returned id as amendment evidence, or attach it to a sheet.
 */
export const POST = v1(async (req: Request) => {
  const user = await requirePermission('legacy:upload', 'submission:create', 'amendment:request');
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const purpose = String(form?.get('purpose') ?? '');
  if (!(file instanceof File)) return apiError(400, 'Send multipart/form-data with a "file" field');
  if (!(FILE_PURPOSES as readonly string[]).includes(purpose)) return apiError(422, `purpose must be one of ${FILE_PURPOSES.join(', ')}`);
  await db();
  const stored = await storeUpload(user, file, purpose as (typeof FILE_PURPOSES)[number], {
    sheetId: form?.get('sheetId')?.toString(), recordId: form?.get('recordId')?.toString(),
  });
  return json({ ok: true, data: out(stored.toObject()) }, 201);
});
