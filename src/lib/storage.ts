import 'server-only';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { v2 as cloudinary } from 'cloudinary';

/**
 * File storage. Production uses Cloudinary `authenticated` assets (no public URL ever exists),
 * uploaded straight from the browser. Local disk (./storage) is a development fallback only:
 * on Vercel the disk is temporary and per-instance, and request bodies are capped at 4.5 MB,
 * so without Cloudinary the driver is 'unconfigured' and uploads are refused.
 */
export type StorageDriver = 'cloudinary' | 'local' | 'unconfigured';

const hasCloudinary = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

export const storageDriver = (): StorageDriver =>
  hasCloudinary() ? 'cloudinary' : process.env.VERCEL ? 'unconfigured' : 'local';

export const STORAGE_NOT_CONFIGURED =
  'File storage is not configured on this server. Ask the ICT unit to add the Cloudinary keys (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).';

let configured = false;
function cld() {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export const ALLOWED_FORMATS = ['pdf', 'jpg', 'jpeg', 'png'];
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const VIEW_TTL_SECONDS = 300;

export function signCloudinaryUpload(folder: string, uploaderId: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp, folder, type: 'authenticated', context: `uploader=${uploaderId}`,
    allowed_formats: ALLOWED_FORMATS.join(','),
  };
  const signature = cld().utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);
  return { ...params, signature, apiKey: process.env.CLOUDINARY_API_KEY!, cloudName: process.env.CLOUDINARY_CLOUD_NAME! };
}

/** Confirms with the Admin API that an uploaded asset exists, is private and matches the reported size. */
export async function confirmCloudinaryAsset(publicId: string, resourceType: string, bytes: number) {
  const r = await cld().api.resource(publicId, { type: 'authenticated', resource_type: resourceType });
  if (r.type !== 'authenticated') throw new Error('Asset is not private');
  if (r.bytes !== bytes) throw new Error('Uploaded size does not match');
  return { format: r.format as string, pages: r.pages as number | undefined };
}

/** Server-side upload of a private asset (used by the REST API; the portal uploads from the browser). */
export function uploadToCloudinary(data: Buffer, folder: string): Promise<{ publicId: string; resourceType: string; format: string; bytes: number; pages?: number }> {
  return new Promise((resolve, reject) => {
    const stream = cld().uploader.upload_stream(
      { folder, type: 'authenticated', resource_type: 'image', allowed_formats: ALLOWED_FORMATS },
      (err, r) => (err || !r ? reject(err ?? new Error('Upload failed'))
        : resolve({ publicId: r.public_id, resourceType: r.resource_type, format: r.format, bytes: r.bytes, pages: r.pages })),
    );
    stream.end(data);
  });
}

type FileRef = { _id: unknown; storage: string; publicId: string; resourceType?: string | null; format?: string | null };

/** Server-side signed download link for a private Cloudinary asset (never sent to the browser). */
export function cloudinaryDownloadUrl(file: FileRef, ttlSeconds = VIEW_TTL_SECONDS) {
  return cld().utils.private_download_url(file.publicId, file.format ?? 'pdf', {
    type: 'authenticated', resource_type: file.resourceType ?? 'image',
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
}

// ---------- local driver ----------

const LOCAL_ROOT = path.join(process.cwd(), 'storage');

function localPath(publicId: string) {
  const p = path.join(LOCAL_ROOT, publicId);
  if (!p.startsWith(LOCAL_ROOT + path.sep)) throw new Error('Invalid path');
  return p;
}

export async function saveLocal(publicId: string, data: Buffer) {
  const p = localPath(publicId);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data, { flag: 'wx' });
}

export const readLocal = (publicId: string) => fs.readFile(localPath(publicId));

// ---------- signed same-origin view links ----------

function viewToken(fileId: string, exp: number) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET!).update(`${fileId}:${exp}`).digest('base64url');
}

export function verifyViewToken(fileId: string, exp: number, token: string) {
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(viewToken(fileId, exp));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/**
 * Signed link valid for five minutes, always on this site (`/api/files/[id]/raw`), whatever the
 * storage. The server streams the file, so the in-app viewer is never blocked by a third party's
 * framing or download headers, and Cloudinary credentials never reach the browser.
 */
export function signedViewUrl(file: FileRef) {
  const exp = Math.floor(Date.now() / 1000) + VIEW_TTL_SECONDS;
  const id = String(file._id);
  return `/api/files/${id}/raw?exp=${exp}&token=${viewToken(id, exp)}`;
}

export function folderFor(origin: 'legacy' | 'online' | 'amendments', deptCode: string, session?: string) {
  return ['crr', origin, deptCode, session?.replace('/', '-')].filter(Boolean).join('/');
}
