import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { audit, hydrateDay } from '@/lib/repo';
import { getDb } from '@/lib/db';
import { verifyPin } from '@/lib/auth';
import { unlockSchema } from '@/lib/schemas';
import { nowIso } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Reopen a finalized day. Requires the PIN and a written reason; the snapshot is kept. */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'unlock', 10, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = unlockSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);
  if (!(await verifyPin(g.ctx.userId, parsed.data.pin))) return fail('bad_pin', 403);

  const db = await getDb();
  const row = await db.get('SELECT * FROM daily_reconciliations WHERE id = ? AND ownerId = ?', [
    parsed.data.dayId,
    g.ctx.ownerId,
  ]);
  if (!row) return fail('not_found', 404);

  const t = nowIso();
  await db.run(
    `UPDATE daily_reconciliations SET status = 'draft', finalizedAt = NULL, updatedAt = ? WHERE id = ? AND ownerId = ?`,
    [t, parsed.data.dayId, g.ctx.ownerId],
  );
  await audit(g.ctx, 'daily_reconciliations', parsed.data.dayId, 'reopen', { status: 'finalized' }, { status: 'draft' }, parsed.data.reason);
  const fresh = await db.get('SELECT * FROM daily_reconciliations WHERE id = ?', [parsed.data.dayId]);
  return ok({ day: hydrateDay(fresh as never) });
}
