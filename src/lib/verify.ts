import 'server-only';
import crypto from 'crypto';
import { Verification } from '@/models';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I

function newCode() {
  const bytes = crypto.randomBytes(8);
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normaliseCode(input: string) {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

function sign(code: string, recordId: string, version: number) {
  const secret = process.env.VERIFY_HMAC_SECRET;
  if (!secret) throw new Error('VERIFY_HMAC_SECRET is not set');
  return crypto.createHmac('sha256', secret).update(`${code}:${recordId}:${version}`).digest('hex');
}

export function verificationUrl(code: string) {
  return `${process.env.APP_URL ?? 'http://localhost:3000'}/verify/${code}`;
}

export async function issueVerification(opts: {
  recordId: string; recordVersion: number; kind: 'STATEMENT_OF_RESULT' | 'TRANSCRIPT';
  issuedTo: string; userId: string; validDays?: number; issuedToAddress?: string; reference?: string; letterhead?: unknown;
}) {
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      const v = await Verification.create({
        record: opts.recordId, kind: opts.kind, code,
        hmac: sign(code, opts.recordId, opts.recordVersion), recordVersion: opts.recordVersion,
        issuedTo: opts.issuedTo, issuedBy: opts.userId, issuedToAddress: opts.issuedToAddress, reference: opts.reference, letterhead: opts.letterhead,
        expiresAt: new Date(Date.now() + (opts.validDays ?? 365) * 864e5),
      });
      return v;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error('Could not allocate a verification code');
}

/** True when the stored HMAC still matches, i.e. the verification row was not tampered with. */
export function hmacValid(v: { code: string; record: unknown; recordVersion: number; hmac: string }) {
  const expected = Buffer.from(sign(v.code, String(v.record), v.recordVersion));
  const given = Buffer.from(v.hmac);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
