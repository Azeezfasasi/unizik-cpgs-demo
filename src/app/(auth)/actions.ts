'use server';

import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { safeNext } from '@/lib/safe-next';
import { db } from '@/lib/db';
import { User } from '@/models';
import { clearMfaPrompt, createSession, setMfaPrompt } from '@/lib/session';
import { getCurrentUser, loadCurrentUser, mfaRequired } from '@/lib/auth';
import { loginLimiter } from '@/lib/ratelimit';
import { audit } from '@/lib/audit';
import { generateSecret, keyUri, verifyTotp } from '@/lib/totp';
import { PasswordSchema } from '@/lib/validators';
import type { ActionState } from '@/lib/action-state';
import type { Role } from '@/lib/rbac';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function login(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  const otp = String(fd.get('otp') ?? '').trim();
  if (!email || !password) return { ok: false, message: 'Enter your email and password' };

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0] ?? 'local';
  const { success } = await loginLimiter.limit(`${email}:${ip}`);
  if (!success) return { ok: false, message: 'Too many attempts. Wait 15 minutes and try again.' };

  try {
    await db();
  } catch (e) {
    console.error('[login] database unreachable:', (e as Error).message);
    return { ok: false, message: 'The records database cannot be reached right now. Please try again shortly or contact the ICT unit.' };
  }
  const u = await User.findOne({ email, isActive: true }).select('+passwordHash +mfaSecret');
  const generic = { ok: false, message: 'Email, password or code is incorrect' };

  if (u?.lockedUntil && u.lockedUntil > new Date()) {
    return { ok: false, message: `Account locked after repeated failed attempts. Try again after ${u.lockedUntil.toLocaleTimeString('en-GB')}.` };
  }

  const recordFailure = async (reason: string) => {
    if (u) {
      u.failedLogins = (u.failedLogins ?? 0) + 1;
      if (u.failedLogins >= MAX_FAILED) {
        u.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        u.failedLogins = 0;
      }
      await u.save();
    }
    await audit(u ? { id: u.id, name: u.name } : null, 'auth.login_failed', 'User', u?.id, undefined, { email, reason });
  };

  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    await recordFailure('password');
    return generic;
  }

  if (u.mfaEnabled && u.mfaSecret) {
    if (!otp) return { ok: false, data: { step: 'otp' } };
    if (!verifyTotp(otp, u.mfaSecret)) {
      await recordFailure('otp');
      return { ok: false, message: 'The authenticator code is incorrect or expired', data: { step: 'otp' } };
    }
  }

  u.failedLogins = 0;
  u.lockedUntil = undefined;
  u.lastLoginAt = new Date();
  await u.save();
  await createSession({ uid: u.id, role: u.role as Role, mfa: !!u.mfaEnabled || !mfaRequired() });
  // Remind accounts without two-step verification once per sign-in (a closable modal in the portal).
  if (!u.mfaEnabled) await setMfaPrompt(u.id);
  await audit({ id: u.id, name: u.name }, 'auth.login', 'User', u.id);
  // Go straight to any pending set-up step rather than via a portal page, so the browser never
  // caches a portal page as "redirect to set-up" (that cached hop would replay after set-up).
  if (u.mustChangePassword) redirect('/setup/password');
  if (mfaRequired() && !u.mfaEnabled) redirect('/mfa');
  redirect(safeNext(fd.get('next')));
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  const current = String(fd.get('current') ?? '');
  const next = String(fd.get('password') ?? '');
  if (next !== String(fd.get('confirm') ?? '')) return { ok: false, message: 'The new passwords do not match' };
  const parsed = PasswordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db();
  const u = await User.findById(user.id).select('+passwordHash');
  if (!u) redirect('/login');
  // A forced first change follows a sign-in with the temporary password in this session,
  // so only a voluntary change re-asks for the current password.
  if (!user.mustChangePassword && !(await bcrypt.compare(current, u.passwordHash))) {
    return { ok: false, message: 'Current password is incorrect' };
  }
  if (await bcrypt.compare(next, u.passwordHash)) {
    return { ok: false, message: 'Choose a password different from the current one' };
  }
  u.passwordHash = await bcrypt.hash(next, 12);
  u.mustChangePassword = false;
  await u.save();
  await audit(user, 'auth.password_changed', 'User', user.id, undefined, { forced: user.mustChangePassword });
  return { ok: true, data: { redirect: mfaRequired() && !user.mfaPassed ? '/mfa' : '/dashboard' } };
}

export async function startMfaEnrolment(): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  await db();
  const secret = generateSecret();
  await User.updateOne({ _id: user.id }, { $set: { mfaPendingSecret: secret } });
  const uri = keyUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#0f172a' } });
  return { ok: true, data: { qr, secret: secret.match(/.{1,4}/g)!.join(' ') } };
}

export async function confirmMfa(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await loadCurrentUser();
  if (!user) redirect('/login');
  await db();
  const u = await User.findById(user.id).select('+mfaPendingSecret');
  if (!u?.mfaPendingSecret) return { ok: false, message: 'Start the set-up again' };
  if (!verifyTotp(String(fd.get('otp') ?? ''), u.mfaPendingSecret)) {
    return { ok: false, message: 'That code did not match. Check your phone clock and try the newest code.' };
  }
  await User.updateOne({ _id: u._id }, { $set: { mfaSecret: u.mfaPendingSecret, mfaEnabled: true }, $unset: { mfaPendingSecret: 1 } });
  await createSession({ uid: user.id, role: user.role, mfa: true });
  await clearMfaPrompt();
  await audit(user, 'auth.mfa_enrolled', 'User', user.id);
  return { ok: true, data: { redirect: user.mustChangePassword ? '/setup/password' : '/dashboard' } };
}

/** Closes the two-step verification reminder until the next sign-in. */
export async function dismissMfaPrompt() {
  await clearMfaPrompt();
}
