import 'server-only';
import { Types } from 'mongoose';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { AuthError, requirePermission, type CurrentUser } from './auth';
import { NotFoundError, UserError } from './errors';
import { firstError } from './validators';
import { canSee, ROLE_LABELS, type Permission, type Role } from './rbac';
import { apiKeyFromHeaders } from './apikeys';
import { apiLimiter } from './ratelimit';
import type { ActionState } from './action-state';

/** Error body used by every /api/v1 endpoint. */
export type ApiError = { error: { message: string; status: number; errors?: unknown; warnings?: string[] } };

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });

export const apiError = (status: number, message: string, extra: Partial<ApiError['error']> = {}) =>
  json({ error: { message, status, ...extra } } satisfies ApiError, status);

/**
 * Wraps a /api/v1 route: per-key rate limiting, then turns auth, validation and business
 * errors into the standard error body.
 */
export function v1<A extends [Request, ...unknown[]]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      const token = apiKeyFromHeaders(args[0].headers);
      if (token && !(await apiLimiter.limit(token.slice(0, 15))).success) {
        return apiError(429, 'Rate limit exceeded: at most 120 requests per minute per key');
      }
      return await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof AuthError) return apiError(e.status, e.message);
      if (e instanceof NotFoundError) return apiError(404, e.message);
      if (e instanceof UserError) return apiError(422, e.message);
      if (e instanceof ZodError) return apiError(422, firstError(e));
      if (e instanceof SyntaxError) return apiError(400, 'Request body is not valid JSON');
      console.error('[api v1]', e);
      return apiError(500, 'Server error');
    }
  };
}

/** Authenticated caller; reads use page visibility (the System Administrator may read everything). */
export async function requireRead(...perms: Permission[]): Promise<CurrentUser> {
  const user = await requirePermission();
  if (perms.length && !perms.some((p) => canSee(user.role, p))) throw new AuthError('Your role cannot read this resource');
  return user;
}

/** Maps a portal action result onto an HTTP response. */
export function fromAction(state: ActionState, okStatus = 200) {
  if (state.ok) {
    return json({
      ok: true, message: state.message ?? null, data: state.data ?? null, warnings: state.warnings ?? [],
    }, okStatus);
  }
  return apiError(state.status ?? 422, state.message ?? 'Request failed', { errors: state.errors, warnings: state.warnings });
}

/** JSON body → FormData in the shape the portal's actions read (booleans become checkbox "on"). */
export function toForm(body: Record<string, unknown>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...body, ...extra })) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x)));
    else if (typeof v === 'boolean') { if (v) fd.append(k, 'on'); }
    else fd.append(k, String(v));
  }
  return fd;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  const v = JSON.parse(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new UserError('Request body must be a JSON object');
  return v as Record<string, unknown>;
}

export function paging(url: URL, max = 100) {
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1') || 1);
  const limit = Math.min(max, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25') || 25));
  return { page, limit, skip: (page - 1) * limit };
}

export const pageMeta = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.ceil(total / limit) });

export function assertId(id: string, what = 'Resource') {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError(`${what} not found`);
}

/** Plain JSON: ObjectIds and Dates to strings, internal fields removed. */
export function clean<T>(doc: T): unknown {
  return JSON.parse(JSON.stringify(doc, (k, v) => (k === '__v' ? undefined : v)));
}

/** Plain JSON with `_id` renamed to `id`, recursively. */
export function out<T>(doc: T): Record<string, unknown> {
  const rename = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(rename);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const res: Record<string, unknown> = {};
      if ('_id' in o) res.id = o._id;
      for (const [k, x] of Object.entries(o)) if (k !== '_id' && k !== '__v') res[k] = rename(x);
      return res;
    }
    return v;
  };
  return rename(clean(doc)) as Record<string, unknown>;
}

export type RouteCtx = { params: Promise<Record<string, string>> };
export const param = async (ctx: RouteCtx, name = 'id') => (await ctx.params)[name];

/** A staff account as returned by the API (never includes password or MFA secrets). */
export function userOut(u: Record<string, unknown>) {
  const o = out(u);
  return { ...o, roleLabel: ROLE_LABELS[o.role as Role], lockedOut: !!(o.lockedUntil && new Date(o.lockedUntil as string) > new Date()) };
}
