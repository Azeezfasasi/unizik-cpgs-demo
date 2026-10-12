import { lookupCode } from '@/lib/lookup';

/** Public, rate-limited JSON verification for institutions that integrate programmatically. */
export async function GET(_req: Request, ctx: RouteContext<'/api/verify/[code]'>) {
  const { code } = await ctx.params;
  const r = await lookupCode(code);
  const status = r.status === 'RATE_LIMITED' ? 429 : r.status === 'INVALID_CODE' ? 400 : r.status === 'NOT_FOUND' ? 404 : 200;
  return Response.json(r, { status, headers: { 'cache-control': 'no-store' } });
}
