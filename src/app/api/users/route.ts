import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { createUser, findUser, listUsers } from '@/lib/auth';
import { audit } from '@/lib/repo';
import { createStaffSchema } from '@/lib/schemas';

export async function GET() {
  const g = await requireCtx('user.manage');
  if (isDenied(g)) return g.response;
  const users = await listUsers(g.ctx.ownerId);
  return ok({
    users: users.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, status: u.status, createdAt: u.createdAt })),
  });
}

/** Staff accounts sit under the owner and share the shop's data. */
export async function POST(req: Request) {
  const g = await requireCtx('user.manage');
  if (isDenied(g)) return g.response;

  const parsed = createStaffSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);
  if (await findUser(parsed.data.username)) return fail('username_taken', 409);

  const user = await createUser({
    username: parsed.data.username,
    password: parsed.data.password,
    displayName: parsed.data.displayName || parsed.data.username,
    role: parsed.data.role,
    ownerId: g.ctx.ownerId,
    createdBy: g.ctx.userId,
  });
  await audit(g.ctx, 'users', user.id, 'create', null, { username: user.username, role: user.role });
  return ok({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, status: user.status } });
}
