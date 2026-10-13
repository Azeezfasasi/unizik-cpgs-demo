import { buildOpenApi } from '@/lib/openapi';

/** The OpenAPI 3.1 description, with this deployment as the server. Public. */
export async function GET(req: Request) {
  const origin = process.env.APP_URL?.startsWith('http') && !process.env.APP_URL.includes('localhost')
    ? process.env.APP_URL.replace(/\/$/, '')
    : new URL(req.url).origin;
  return Response.json(buildOpenApi(origin), { headers: { 'cache-control': 'public, max-age=300' } });
}
