import { fail, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getUserById, hashPassword } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { nowIso } from '@/lib/date';
import { audit } from '@/lib/repo';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const g = await requireCtx('user.manage');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const target = await getUserById(id);
  if (!target || target.ownerId !== g.ctx.ownerId) return fail('not_found', 404);
  if (target.role === 'owner') return fail('cannot_modify_owner', 403);

  const body = (await readJson(req)) as { role?: string; status?: string; password?: string; displayName?: string } | null;
  const patch: Record<string, unknown> = {};
  if (body?.role === 'manager' || body?.role === 'employee') patch.role = body.role;
  if (body?.status === 'active' || body?.status === 'suspended') patch.status = body.status;
  if (body?.displayName) patch.displayName = body.displayName.slice(0, 80);
  if (body?.password && body.password.length >= 6) patch.passwordHash = hashPassword(body.password);
  if (!Object.keys(patch).length) return fail('nothing_to_update', 422);

  const db = await getDb();
  const keys = Object.keys(patch);
  await db.run(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')}, updatedAt = ? WHERE id = ?`, [
    ...keys.map((k) => patch[k]),
    nowIso(),
    id,
  ]);
  await audit(g.ctx, 'users', id, 'update', { role: target.role, status: target.status }, { ...patch, passwordHash: undefined });
  const updated = await getUserById(id);
  return ok({ user: { id, username: updated?.username, displayName: updated?.displayName, role: updated?.role, status: updated?.status } });
}
