import 'server-only';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { AuthError } from './auth';
import { UserError } from './errors';
import { firstError } from './validators';
import type { ActionState } from './action-state';

/**
 * Runs a server action body: refreshes the page on success and turns expected failures
 * into a message for the form. Unexpected errors are logged and shown generically.
 */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const result = await fn();
    refresh();
    return result ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof UserError || e instanceof AuthError) return { ok: false, message: e.message };
    if (e instanceof ZodError) return { ok: false, message: firstError(e) };
    if ((e as { code?: number }).code === 11000) return { ok: false, message: 'A record with these details already exists' };
    console.error('[action]', e);
    return { ok: false, message: 'Something went wrong. Please try again or contact the ICT unit.' };
  }
}
