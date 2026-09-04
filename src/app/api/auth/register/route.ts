import { NextResponse } from 'next/server';
import { countUsers, createUser, findUser, setSession } from '@/lib/auth';
import { fail, guard, ok, readJson } from '@/lib/api';
import { loginSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** First run only: creates the single owner account. */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'register', 5, 60_000);
  if (limited) return limited;

  const parsed = loginSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => i.message) });

  if ((await countUsers()) > 0) return fail('registration_closed', 403);
  if (await findUser(parsed.data.username)) return fail('username_taken', 409);

  const user = await createUser(parsed.data.username, parsed.data.password, parsed.data.displayName || '');
  await setSession({ uid: user.id, ownerId: user.ownerId, username: user.username });
  return ok({ id: user.id, username: user.username, displayName: user.displayName });
}

export async function GET(): Promise<NextResponse> {
  return ok({ needsSetup: (await countUsers()) === 0 });
}
