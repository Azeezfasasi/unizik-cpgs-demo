/**
 * Where to go after sign-in: a same-site path from the `next` parameter, otherwise the dashboard.
 * Rejects other sites ("//host", "/\host", which browsers read as "//host") and the sign-in page itself.
 */
export function safeNext(next: unknown) {
  const n = typeof next === 'string' ? next : '';
  if (!n.startsWith('/') || n.startsWith('//') || n.startsWith('/\\') || /^\/login(?:[/?#]|$)/.test(n)) return '/dashboard';
  return n;
}
