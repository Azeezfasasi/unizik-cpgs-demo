import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from './rbac';

export const SESSION_COOKIE = 'crr_session';
const MAX_AGE = 60 * 60 * 8; // 8-hour working session

export type SessionPayload = {
  uid: string;
  role: Role;
  /** True once the second factor was checked in this session (or MFA is not enforced). */
  mfa: boolean;
};

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be set (32+ characters)');
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, key(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(MFA_PROMPT_COOKIE);
}

/**
 * Two-step verification reminder: set at sign-in for an account without it, cleared when the
 * user closes the reminder or signs out. Holds the user id so it never applies to another account.
 */
export const MFA_PROMPT_COOKIE = 'crr_mfa_prompt';

export async function setMfaPrompt(uid: string) {
  (await cookies()).set(MFA_PROMPT_COOKIE, uid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function mfaPromptPending(uid: string) {
  return (await cookies()).get(MFA_PROMPT_COOKIE)?.value === uid;
}

export async function clearMfaPrompt() {
  (await cookies()).delete(MFA_PROMPT_COOKIE);
}
