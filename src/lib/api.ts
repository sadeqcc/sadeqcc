import 'server-only';
import { NextResponse } from 'next/server';
import { getSession } from './auth';
import type { Ctx } from './repo';
import { rateLimit, clientKey } from './ratelimit';
import { can, type Permission } from './types';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, { status: 200, ...init });
}

export function fail(code: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: code, ...extra }, { status });
}

export type Guarded = { ctx: Ctx } | { response: NextResponse };
export const isDenied = (g: Guarded): g is { response: NextResponse } => 'response' in g;

/** Every API route calls this before touching data. */
export async function requireCtx(permission?: Permission): Promise<Guarded> {
  const s = await getSession();
  if (!s) return { response: fail('unauthorized', 401) };
  if (permission && !can(s.role, permission)) return { response: fail('forbidden', 403, { permission }) };
  return { ctx: { ownerId: s.ownerId, userId: s.uid, actor: s.username, role: s.role } };
}

export function guard(req: Request, tag: string, limit = 240, windowMs = 60_000) {
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

/** Turns a zod failure into the shape the client renders under each field. */
export function invalid(issues: { path: (string | number)[]; message: string }[]) {
  return fail('validation_failed', 422, {
    issues: issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`),
    fields: Object.fromEntries(issues.map((i) => [String(i.path[0] ?? 'value'), i.message])),
  });
}

/** Customer and financial values must never reach the server logs. */
export function logSafe(message: string, meta: Record<string, string | number> = {}) {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([k]) => !/amount|fils|mg|weight|total|balance|phone|name|email/i.test(k)),
  );
  console.log(`[gold-orders] ${message}`, clean);
}
