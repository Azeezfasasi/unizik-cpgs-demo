import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Limiter = { limit: (key: string) => Promise<{ success: boolean }> };

/** In-memory fallback for local development when Upstash is not configured. */
function memoryLimiter(max: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    async limit(key) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      recent.push(now);
      hits.set(key, recent);
      return { success: recent.length <= max };
    },
  };
}

function make(prefix: string, max: number, window: `${number} m`): Limiter {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(max, window),
      prefix: `crr:${prefix}`,
    });
  }
  return memoryLimiter(max, parseInt(window) * 60_000);
}

export const loginLimiter = make('login', 10, '15 m');
export const verifyLimiter = make('verify', 30, '1 m');
