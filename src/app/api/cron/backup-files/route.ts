import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { cronAuthorized } from '@/lib/cron';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { readLocal, signedViewUrl } from '@/lib/storage';
import { StoredFile } from '@/models';

export const maxDuration = 300;
const BATCH = 100;

async function fetchBytes(file: Parameters<typeof signedViewUrl>[0] & { storage: string; publicId: string }) {
  if (file.storage === 'local') return readLocal(file.publicId);
  const res = await fetch(signedViewUrl(file));
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Nightly: re-verifies the SHA-256 of files not yet backed up and copies them to the second store.
 * The second store is BACKUP_DIR (a mounted university server path). Until it is configured,
 * files are integrity-checked but not marked as backed up.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response('Unauthorized', { status: 401 });
  await db();
  const target = process.env.BACKUP_DIR;
  const files = await StoredFile.find({ backedUpAt: null }).limit(BATCH).lean();
  const report = { checked: 0, copied: 0, mismatched: [] as string[], failed: [] as string[], secondStore: !!target };

  for (const f of files) {
    try {
      const buf = await fetchBytes(f);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      report.checked++;
      if (sha !== f.sha256) { report.mismatched.push(f._id.toString()); continue; }
      if (target) {
        const dest = path.join(target, f.publicId);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, buf);
        await StoredFile.updateOne({ _id: f._id }, { $set: { backedUpAt: new Date() } });
        report.copied++;
      }
    } catch {
      report.failed.push(f._id.toString());
    }
  }
  await audit(null, 'cron.backup_files', 'StoredFile', undefined, undefined, report);
  return Response.json(report, { status: report.mismatched.length ? 500 : 200 });
}
