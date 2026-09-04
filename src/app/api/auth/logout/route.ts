import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';
import { ok } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  await clearSession();
  return ok({ loggedOut: true });
}
