import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { getSettings, upsertGoldRow } from '@/lib/repo';
import { getDb } from '@/lib/db';
import { goldRowSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'gold-write', 300, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = goldRowSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => i.message) });

  const settings = await getSettings(g.ctx.ownerId);
  if (!settings.karats.includes(parsed.data.karat)) return fail('unknown_karat', 422);

  const db = await getDb();
  const day = await db.get<{ status: string }>('SELECT status FROM daily_reconciliations WHERE id = ? AND ownerId = ?', [
    parsed.data.dayId,
    g.ctx.ownerId,
  ]);
  if (!day) return fail('not_found', 404);
  if (day.status === 'finalized' || day.status === 'locked') return fail('day_locked', 423);

  const row = await upsertGoldRow(g.ctx, parsed.data.dayId, parsed.data.karat, {
    systemMg: parsed.data.systemMg,
    drawerMg: parsed.data.drawerMg,
  });
  return ok({ row });
}
