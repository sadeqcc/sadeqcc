import { NextResponse } from 'next/server';
import { getUserById, setPin, verifyPassword } from '@/lib/auth';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { audit } from '@/lib/repo';
import { pinSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'pin', 10, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = pinSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);

  const user = await getUserById(g.ctx.userId);
  if (!user) return fail('unauthorized', 401);
  if (user.pinHash) {
    const current = parsed.data.currentPin ?? '';
    if (!verifyPassword(current, user.pinHash)) return fail('bad_pin', 403);
  }
  await setPin(user.id, parsed.data.pin);
  await audit(g.ctx, 'users', user.id, parsed.data.pin ? 'set_pin' : 'clear_pin', null, null);
  return ok({ hasPin: !!parsed.data.pin });
}
