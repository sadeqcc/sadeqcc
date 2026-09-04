import 'server-only';
import { NextResponse } from 'next/server';
import { getSession } from './auth';
import type { Ctx } from './repo';
import { rateLimit, clientKey } from './ratelimit';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(code: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: code, ...extra }, { status });
}

/** Owner-only guard. Every API route calls this before touching data. */
export async function requireCtx(): Promise<{ ctx: Ctx } | { response: NextResponse }> {
  const s = await getSession();
  if (!s) return { response: fail('unauthorized', 401) };
  return { ctx: { ownerId: s.ownerId, userId: s.uid, actor: s.username } };
}

export function guard(req: Request, tag: string, limit = 120, windowMs = 60_000) {
  const r = rateLimit(clientKey(req, tag), limit, windowMs);
  if (!r.ok) return fail('rate_limited', 429, { retryAfter: r.retryAfter });
  return null;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Financial values must never reach the server logs. */
export function logSafe(message: string, meta: Record<string, string | number> = {}) {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([k]) => !/amount|cash|fils|mg|weight|total|balance/i.test(k)),
  );
  console.log(`[sadeq] ${message}`, clean);
}
