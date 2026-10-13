import { lookupCode } from '@/lib/lookup';
import { apiError, json, param, v1, type RouteCtx } from '@/lib/v1';

/** Public verification of an issued statement or transcript. No API key needed; rate-limited per IP. */
export const GET = v1(async (_req: Request, ctx: RouteCtx) => {
  const r = await lookupCode(await param(ctx, 'code'));
  if (r.status === 'RATE_LIMITED') return apiError(429, 'Too many verification requests; try again in a minute');
  if (r.status === 'INVALID_CODE') return apiError(400, 'Codes have 8 characters, for example ABCD-2345');
  if (r.status === 'NOT_FOUND') return apiError(404, 'No document with this code was issued by CPGS');
  return json({ data: r });
});
