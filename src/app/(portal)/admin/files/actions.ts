'use server';

import { Types } from 'mongoose';
import { z } from 'zod';
import { db } from '@/lib/db';
import { run } from '@/lib/action';
import { requirePermission } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { fail } from '@/lib/errors';
import { destroyAsset, isLinked, linksFor, verifyIntegrity } from '@/lib/files';
import { storageDriver } from '@/lib/storage';
import type { ActionState } from '@/lib/action-state';
import { StoredFile } from '@/models';

export async function verifyFile(fileId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('files:manage');
    if (!Types.ObjectId.isValid(fileId)) fail('File not found');
    await db();
    const file = await StoredFile.findById(fileId).lean();
    if (!file) fail('File not found');
    const r = await verifyIntegrity(file);
    await audit(user, 'file.verify', 'StoredFile', fileId, undefined, { result: r.status, detail: r.detail });
    const text = {
      OK: 'Checksum matches the upload. The file is intact.',
      MISMATCH: `Checksum does NOT match the upload. ${r.detail ?? ''} Report this to Internal Audit.`,
      MISSING: `The stored file could not be read. ${r.detail ?? ''}`,
    }[r.status];
    return { ok: r.status === 'OK', message: text };
  });
}

export async function deleteFile(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('files:delete');
    if (!Types.ObjectId.isValid(fileId)) fail('File not found');
    const reason = z.string().trim().min(5, 'Give a reason for deleting (at least 5 characters)').parse(fd.get('reason') ?? '');
    await db();
    const file = await StoredFile.findById(fileId).lean();
    if (!file) fail('File not found');
    const links = (await linksFor([file._id])).get(String(file._id))!;
    if (isLinked(links)) fail('This file is attached to a sheet, record or amendment and is a legal source; it cannot be deleted.');
    if (file.storage === 'cloudinary' && storageDriver() !== 'cloudinary') fail('Cloudinary is not configured on this server.');
    await destroyAsset(file);
    await StoredFile.deleteOne({ _id: file._id });
    await audit(user, 'file.delete', 'StoredFile', fileId,
      { name: file.originalName, publicId: file.publicId, sha256: file.sha256, bytes: file.bytes, purpose: file.purpose }, { reason });
    return { ok: true, message: `${file.originalName ?? 'File'} deleted.` };
  });
}

/** Deletes a Cloudinary asset that has no record in the file register (found by the storage check). */
export async function deleteOrphanAsset(publicId: string, resourceType: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission('files:delete');
    const reason = z.string().trim().min(5, 'Give a reason for deleting (at least 5 characters)').parse(fd.get('reason') ?? '');
    if (!publicId.startsWith('crr/')) fail('Only assets in the crr/ folder can be managed here');
    if (!['image', 'raw'].includes(resourceType)) fail('Unknown asset type');
    await db();
    if (await StoredFile.exists({ publicId })) fail('This asset is registered; manage it from the file list instead');
    await destroyAsset({ storage: 'cloudinary', publicId, resourceType });
    await audit(user, 'file.orphan_delete', 'Cloudinary', publicId, { publicId, resourceType }, { reason });
    return { ok: true, message: 'Unregistered asset deleted from Cloudinary.' };
  });
}
