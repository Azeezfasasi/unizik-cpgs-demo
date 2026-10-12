import { getCurrentUser } from '@/lib/auth';
import { destroySession } from '@/lib/session';
import { audit } from '@/lib/audit';

export async function POST(req: Request) {
  const user = await getCurrentUser().catch(() => null);
  if (user) await audit(user, 'auth.logout', 'User', user.id);
  await destroySession();
  return Response.redirect(new URL('/login', req.url), 303);
}
