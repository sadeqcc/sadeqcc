import { NextResponse } from 'next/server';
import { countUsers, getSession, getUserById } from '@/lib/auth';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const s = await getSession();
  if (!s) return ok({ user: null, needsSetup: (await countUsers()) === 0 });
  const u = await getUserById(s.uid);
  if (!u) return ok({ user: null, needsSetup: false });
  return ok({
    user: { id: u.id, username: u.username, displayName: u.displayName, hasPin: !!u.pinHash },
    needsSetup: false,
  });
}
