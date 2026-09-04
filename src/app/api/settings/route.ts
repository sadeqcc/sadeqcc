import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { getSettings, saveSettings } from '@/lib/repo';
import { settingsSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  return ok({ settings: await getSettings(g.ctx.ownerId) });
}

export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'settings', 120, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const parsed = settingsSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => i.message) });
  return ok({ settings: await saveSettings(g.ctx, parsed.data) });
}
