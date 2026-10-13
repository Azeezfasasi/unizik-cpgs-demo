import 'server-only';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { Types } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryDownloadUrl, readLocal, storageDriver } from './storage';
import { Amendment, GraduandRecord, ResultSheet, StoredFile } from '@/models';

/** What a stored file belongs to. A file with no links can be deleted; a linked one is a legal source. */
export type FileLinks = {
  sheets: { id: string; reference: string; status: string }[];
  records: number;
  amendments: { id: string; status: string; record: string }[];
};

export const isLinked = (l: FileLinks) => l.sheets.length > 0 || l.records > 0 || l.amendments.length > 0;

/** Links for many files at once (one query per collection). */
export async function linksFor(ids: Types.ObjectId[]) {
  const [sheets, records, amendments] = await Promise.all([
    ResultSheet.find({ files: { $in: ids } }).select('reference status files').lean(),
    GraduandRecord.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { sourceFile: { $in: ids } } },
      { $group: { _id: '$sourceFile', n: { $sum: 1 } } },
    ]),
    Amendment.find({ evidence: { $in: ids } }).select('status record evidence').lean(),
  ]);
  const map = new Map<string, FileLinks>(ids.map((id) => [String(id), { sheets: [], records: 0, amendments: [] }]));
  for (const s of sheets) {
    for (const f of s.files) map.get(String(f))?.sheets.push({ id: String(s._id), reference: s.reference, status: s.status });
  }
  for (const r of records) { const l = map.get(String(r._id)); if (l) l.records = r.n; }
  for (const a of amendments) map.get(String(a.evidence))?.amendments.push({ id: String(a._id), status: a.status, record: String(a.record) });
  return map;
}

type FileDoc = { _id: unknown; storage: string; publicId: string; resourceType?: string | null; format?: string | null; sha256: string };

/** Re-downloads a file and compares its SHA-256 with the checksum recorded at upload. */
export async function verifyIntegrity(file: FileDoc): Promise<{ status: 'OK' | 'MISMATCH' | 'MISSING'; detail?: string }> {
  try {
    let buf: Buffer;
    if (file.storage === 'local') {
      buf = await readLocal(file.publicId);
    } else {
      const res = await fetch(cloudinaryDownloadUrl(file, 120));
      if (res.status === 404) return { status: 'MISSING', detail: 'Not found in Cloudinary' };
      if (!res.ok) return { status: 'MISSING', detail: `Cloudinary responded ${res.status}` };
      buf = Buffer.from(await res.arrayBuffer());
    }
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    return sha === file.sha256 ? { status: 'OK' } : { status: 'MISMATCH', detail: `Stored file hashes to ${sha.slice(0, 12)}…` };
  } catch (e) {
    return { status: 'MISSING', detail: (e as Error).message };
  }
}

/** Removes the stored bytes (Cloudinary asset or local file). */
export async function destroyAsset(file: Pick<FileDoc, 'storage' | 'publicId' | 'resourceType'>) {
  if (file.storage === 'cloudinary') {
    const r = await cld().uploader.destroy(file.publicId, { type: 'authenticated', resource_type: file.resourceType ?? 'image', invalidate: true });
    if (r.result !== 'ok' && r.result !== 'not found') throw new Error(`Cloudinary refused the delete (${r.result})`);
    return;
  }
  await fs.unlink(path.join(process.cwd(), 'storage', file.publicId)).catch(() => undefined);
}

// ---------- Cloudinary account view ----------

let configured = false;
function cld() {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET, secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export type StorageUsage = { usedBytes: number; limitBytes?: number; storagePercent?: number; creditsPercent?: number; plan?: string; resources?: number };

export async function cloudinaryUsage(): Promise<StorageUsage | null> {
  if (storageDriver() !== 'cloudinary') return null;
  try {
    const u = await cld().api.usage();
    const used = u.storage?.usage ?? 0;
    const limit = u.storage?.limit;
    return {
      usedBytes: used, limitBytes: limit, plan: u.plan, resources: u.resources,
      storagePercent: limit ? Math.round((used / limit) * 1000) / 10 : undefined,
      creditsPercent: u.credits?.used_percent,
    };
  } catch {
    return null;
  }
}

export type OrphanAsset = { publicId: string; resourceType: string; format: string; bytes: number; createdAt: string };

/**
 * Compares the private assets under the crr/ folder in Cloudinary with the file register.
 * Orphans are assets with no record (e.g. an upload interrupted before registration).
 */
export async function reconcileWithCloudinary(): Promise<{ orphans: OrphanAsset[]; scanned: number; truncated: boolean }> {
  const assets: OrphanAsset[] = [];
  let truncated = false;
  for (const resource_type of ['image', 'raw'] as const) {
    let next_cursor: string | undefined;
    let pages = 0;
    do {
      const res = await cld().api.resources({ type: 'authenticated', resource_type, prefix: 'crr/', max_results: 500, next_cursor });
      for (const r of res.resources) {
        assets.push({ publicId: r.public_id, resourceType: resource_type, format: r.format, bytes: r.bytes, createdAt: r.created_at });
      }
      next_cursor = res.next_cursor;
      if (++pages >= 10 && next_cursor) { truncated = true; break; }
    } while (next_cursor);
  }
  const known = new Set((await StoredFile.find({ storage: 'cloudinary', publicId: { $in: assets.map((a) => a.publicId) } })
    .select('publicId').lean()).map((f) => f.publicId));
  return { orphans: assets.filter((a) => !known.has(a.publicId)), scanned: assets.length, truncated };
}
