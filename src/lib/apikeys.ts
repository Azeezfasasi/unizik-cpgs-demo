import 'server-only';
import crypto from 'crypto';
import ApiKey from '@/models/ApiKey';
import { User } from '@/models';

/** Key format: crr_<keyId 10>_<secret 40>. Only the SHA-256 of the whole key is stored. */
const KEY_RE = /^crr_([A-Za-z0-9]{10})_([A-Za-z0-9]{40})$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomString(n: number): string {
  const bytes = crypto.randomBytes(n * 2);
  let out = '';
  for (let i = 0; out.length < n && i < bytes.length; i++) {
    if (bytes[i] < 248) out += ALPHABET[bytes[i] % 62]; // rejection sampling: no modulo bias
  }
  return out.length === n ? out : randomString(n);
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function generateApiKey() {
  const keyId = randomString(10);
  const key = `crr_${keyId}_${randomString(40)}`;
  return { key, keyId, hash: sha256(key) };
}

/** Reads the key from `Authorization: Bearer crr_…` or `X-API-Key: crr_…`. */
export function apiKeyFromHeaders(h: Headers) {
  const auth = h.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t.startsWith('crr_')) return t;
  }
  const x = h.get('x-api-key')?.trim();
  return x?.startsWith('crr_') ? x : null;
}

/** Validates a key and returns it with its active owner, or null. Records usage. */
export async function authenticateApiKey(token: string, ip?: string | null) {
  const m = KEY_RE.exec(token);
  if (!m) return null;
  const key = await ApiKey.findOne({ keyId: m[1] }).select('+hash').lean();
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < new Date())) return null;
  const a = Buffer.from(key.hash), b = Buffer.from(sha256(token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const owner = await User.findById(key.owner).lean();
  if (!owner || !owner.isActive) return null;
  void ApiKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: ip ?? undefined }, $inc: { useCount: 1 } }).exec();
  return { key, owner };
}
