import { NextResponse } from 'next/server';
import { findUser, setSession, verifyPassword } from '@/lib/auth';
import { fail, guard, ok, readJson } from '@/lib/api';
import { loginSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'login', 10, 60_000);
  if (limited) return limited;

  const parsed = loginSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);

  const user = await findUser(parsed.data.username);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return fail('bad_credentials', 401);
  }
  await setSession({ uid: user.id, ownerId: user.ownerId, username: user.username });
  return ok({ id: user.id, username: user.username, displayName: user.displayName });
}
