import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { handle, uploadTarget } from '@/lib/api';
import { fail } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { ALLOWED_FORMATS, confirmCloudinaryAsset, storageDriver } from '@/lib/storage';
import { StoredFile } from '@/models';

const Body = z.object({
  publicId: z.string().min(3).max(300),
  resourceType: z.enum(['image', 'raw']),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  originalName: z.string().max(255),
  purpose: z.enum(['LEGACY_SCAN', 'SUBMISSION_SCAN', 'AMENDMENT_EVIDENCE']),
  sheetId: z.string().optional(),
  recordId: z.string().optional(),
});

/** Registers a file after a direct Cloudinary upload, once the Admin API confirms it. */
export const POST = handle(async (req: Request) => {
  if (storageDriver() !== 'cloudinary') fail('Cloudinary is not configured');
  const user = await requirePermission('legacy:upload', 'submission:create', 'amendment:request');
  const body = Body.parse(await req.json());
  await db();
  const target = await uploadTarget(user, body.purpose, body);
  if (!body.publicId.startsWith(target.folder + '/')) fail('File was uploaded to the wrong folder');

  const asset = await confirmCloudinaryAsset(body.publicId, body.resourceType, body.bytes);
  if (!ALLOWED_FORMATS.includes(asset.format)) fail('Only PDF, JPG and PNG files are accepted');

  const doc = await StoredFile.create({
    storage: 'cloudinary', publicId: body.publicId, resourceType: body.resourceType, format: asset.format,
    originalName: body.originalName, bytes: body.bytes, pages: asset.pages, sha256: body.sha256,
    department: target.departmentId, purpose: body.purpose, uploadedBy: user.id,
  });
  await audit(user, 'file.upload', 'StoredFile', doc.id, undefined, { name: body.originalName, sha256: body.sha256, bytes: body.bytes, purpose: body.purpose });
  return Response.json({ id: doc.id });
});
