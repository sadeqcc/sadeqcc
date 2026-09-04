type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Small in-process limiter. Enough to blunt brute force on a single-owner app. */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

export function clientKey(req: Request, tag: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'local';
  return `${tag}:${ip}`;
}
