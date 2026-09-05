import { ok } from '@/lib/api';
import { countUsers, getSession, getUserById } from '@/lib/auth';
import { ROLE_PERMISSIONS, type Role } from '@/lib/types';

export async function GET() {
  const s = await getSession();
  if (!s) return ok({ user: null, needsSetup: (await countUsers()) === 0 });
  const u = await getUserById(s.uid);
  if (!u) return ok({ user: null, needsSetup: false });
  return ok({
    user: {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      hasPin: !!u.pinHash,
      permissions: ROLE_PERMISSIONS[(u.role as Role) ?? 'employee'] ?? [],
    },
    needsSetup: false,
  });
}
