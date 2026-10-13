import 'server-only';
import crypto from 'crypto';
import type { CurrentUser } from './auth';
import { uploadTarget } from './api';
import { audit } from './audit';
import { fail } from './errors';
import { MAX_UPLOAD_BYTES, saveLocal, STORAGE_NOT_CONFIGURED, storageDriver, uploadToCloudinary } from './storage';
import { StoredFile } from '@/models';
import { FILE_PURPOSES } from '@/models/StoredFile';

export type FilePurpose = (typeof FILE_PURPOSES)[number];

/** Detects the real file type from its first bytes rather than trusting the name. */
export function sniffFormat(buf: Buffer) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/**
 * Stores a file received by the server (REST API) and registers it, with the same checks as a
 * portal upload: permission on the target sheet or record, real file type, size and checksum.
 */
export async function storeUpload(user: CurrentUser, file: File, purpose: FilePurpose, scope: { sheetId?: string; recordId?: string }) {
  const driver = storageDriver();
  if (driver === 'unconfigured') fail(STORAGE_NOT_CONFIGURED);
  if (!file.size) fail('The file is empty');
  if (file.size > MAX_UPLOAD_BYTES) fail('File is larger than 50 MB');
  const target = await uploadTarget(user, purpose, scope);

  const buf = Buffer.from(await file.arrayBuffer());
  const format = sniffFormat(buf);
  if (!format) fail('Only PDF, JPG and PNG files are accepted');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  let stored: { publicId: string; resourceType: string; format: string; bytes: number; pages?: number };
  if (driver === 'cloudinary') {
    stored = await uploadToCloudinary(buf, target.folder);
  } else {
    const publicId = `${target.folder}/${crypto.randomUUID()}.${format}`;
    await saveLocal(publicId, buf);
    const pages = format === 'pdf' ? (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? undefined) : 1;
    stored = { publicId, resourceType: 'image', format: format!, bytes: buf.length, pages };
  }

  const doc = await StoredFile.create({
    storage: driver, publicId: stored.publicId, resourceType: stored.resourceType, format: stored.format,
    originalName: file.name, bytes: stored.bytes, pages: stored.pages, sha256,
    department: target.departmentId, purpose, uploadedBy: user.id,
  });
  await audit(user, 'file.upload', 'StoredFile', doc.id, undefined, { name: file.name, sha256, bytes: stored.bytes, purpose, via: 'api' });
  return doc;
}
