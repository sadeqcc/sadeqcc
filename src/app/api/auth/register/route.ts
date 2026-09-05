import { fail, guard, ok, readJson } from '@/lib/api';
import { countUsers, createUser, findUser, setSession } from '@/lib/auth';
import { registerSchema } from '@/lib/schemas';

/** The first account created owns the shop. Staff are added from Settings. */
export async function POST(req: Request) {
  const limited = guard(req, 'register', 10, 60_000);
  if (limited) return limited;

  const parsed = registerSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('validation_failed', 422, { issues: parsed.error.issues.map((i) => i.message) });

  if ((await countUsers()) > 0) return fail('registration_closed', 403);
  if (await findUser(parsed.data.username)) return fail('username_taken', 409);

  const user = await createUser({
    username: parsed.data.username,
    password: parsed.data.password,
    displayName: parsed.data.displayName || parsed.data.username,
    role: 'owner',
  });
  await setSession({ uid: user.id, ownerId: user.ownerId, username: user.username, role: 'owner' });
  return ok({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
}
