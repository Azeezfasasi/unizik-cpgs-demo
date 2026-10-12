import crypto from 'crypto';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle, uploadTarget } from '@/lib/api';
import { fail } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { MAX_UPLOAD_BYTES, saveLocal, storageDriver } from '@/lib/storage';
import { StoredFile } from '@/models';
import { FILE_PURPOSES } from '@/models/StoredFile';
import { z } from 'zod';

/** Detects the real file type from its first bytes rather than trusting the name. */
function sniff(buf: Buffer) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}

/** Local-disk storage used when Cloudinary is not configured (development). */
export const POST = handle(async (req: Request) => {
  if (storageDriver() !== 'local') fail('Local uploads are disabled');
  const user = await requirePermission('legacy:upload', 'submission:create', 'amendment:request');
  const fd = await req.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) fail('No file received');
  const f = file as File;
  if (f.size > MAX_UPLOAD_BYTES) fail('File is larger than 50 MB');

  const purpose = z.enum(FILE_PURPOSES).parse(fd.get('purpose'));
  await db();
  const target = await uploadTarget(user, purpose, {
    sheetId: fd.get('sheetId')?.toString(), recordId: fd.get('recordId')?.toString(),
  });

  const buf = Buffer.from(await f.arrayBuffer());
  const format = sniff(buf);
  if (!format) fail('Only PDF, JPG and PNG files are accepted');
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha256 !== String(fd.get('sha256'))) fail('Checksum mismatch: the file changed in transit, upload again');

  const publicId = `${target.folder}/${crypto.randomUUID()}.${format}`;
  await saveLocal(publicId, buf);
  const pages = format === 'pdf' ? (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? undefined) : 1;

  const doc = await StoredFile.create({
    storage: 'local', publicId, resourceType: 'image', format, originalName: f.name,
    bytes: f.size, pages, sha256, department: target.departmentId, purpose, uploadedBy: user.id,
  });
  await audit(user, 'file.upload', 'StoredFile', doc.id, undefined, { name: f.name, sha256, bytes: f.size, purpose });
  return Response.json({ id: doc.id });
});
