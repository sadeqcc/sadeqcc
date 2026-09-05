import { fail, guard, ok, readJson } from '@/lib/api';
import { findUser, setSession, verifyPassword } from '@/lib/auth';
import { credentialsSchema } from '@/lib/schemas';
import type { Role } from '@/lib/types';

export async function POST(req: Request) {
  const limited = guard(req, 'login', 20, 60_000);
  if (limited) return limited;

  const parsed = credentialsSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_credentials', 401);

  const user = await findUser(parsed.data.username);
  // Same response either way, so a wrong username cannot be told from a wrong password.
  if (!user || user.status !== 'active' || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return fail('invalid_credentials', 401);
  }
  await setSession({ uid: user.id, ownerId: user.ownerId, username: user.username, role: user.role as Role });
  return ok({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
}
