import 'server-only';
import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { AuthError } from './auth';
import { NotFoundError, UserError } from './errors';
import { firstError } from './validators';
import type { ActionState } from './action-state';

/**
 * Runs a server action body: refreshes the page on success and turns expected failures
 * into a message for the form. Unexpected errors are logged and shown generically.
 */
export async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    const result = await fn();
    // refresh() only applies inside a server action; the same actions also back the REST API.
    try { refresh(); } catch { /* called from a route handler */ }
    return result ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AuthError) return { ok: false, message: e.message, status: e.status };
    if (e instanceof NotFoundError) return { ok: false, message: e.message, status: 404 };
    if (e instanceof UserError) return { ok: false, message: e.message, status: 422 };
    if (e instanceof ZodError) return { ok: false, message: firstError(e), status: 422 };
    if ((e as { code?: number }).code === 11000) return { ok: false, message: 'A record with these details already exists', status: 409 };
    console.error('[action]', e);
    return { ok: false, message: 'Something went wrong. Please try again or contact the ICT unit.', status: 500 };
  }
}
