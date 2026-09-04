import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { audit, getSettings, hydrateDay, listDayData, listMovements } from '@/lib/repo';
import { getDb } from '@/lib/db';
import { finalizeSchema } from '@/lib/schemas';
import { nowIso } from '@/lib/date';
import { ENGINE_VERSION, summarizeDay } from '@/lib/calc';
import type { CashEntry, CashAdjustment, GoldMovement, GoldRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Closes the day: recomputes from the raw inputs on the server, stores an
 * immutable snapshot (inputs + results + engine version + tolerances) and locks it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'finalize', 30, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = finalizeSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);

  const db = await getDb();
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM daily_reconciliations WHERE id = ? AND ownerId = ? AND deletedAt IS NULL',
    [parsed.data.dayId, g.ctx.ownerId],
  );
  if (!row) return fail('not_found', 404);
  const day = hydrateDay(row as never);
  if (day.status === 'finalized' || day.status === 'locked') return fail('already_finalized', 409);
  if (day.systemCashFils === null) return fail('system_cash_required', 422);

  const settings = await getSettings(g.ctx.ownerId);
  const { entries, adjustments, goldRows } = await listDayData(g.ctx.ownerId, day.id);
  const movements = await listMovements(g.ctx.ownerId, { onDate: day.date });

  const summary = summarizeDay({
    physicalCashFils: day.physicalCashFils,
    systemCashFils: day.systemCashFils,
    entries: entries as unknown as CashEntry[],
    adjustments: adjustments as unknown as CashAdjustment[],
    karats: settings.karats,
    goldRows: goldRows as unknown as GoldRow[],
    movements: movements as unknown as GoldMovement[],
    tolerances: settings.tolerances,
    cashTolerance: settings.cashTolerance,
  });

  const hasDiff = summary.hasDifferences;
  const reason = parsed.data.reasonText?.trim() || day.reasonText || '';
  if (hasDiff && reason.length < 3) return fail('reason_required', 422);

  const snapshot = {
    engineVersion: ENGINE_VERSION,
    finalizedAt: nowIso(),
    timezone: settings.timezone,
    precision: { cashDecimals: settings.cashDecimals, goldDecimals: settings.goldDecimals, goldPrecision: settings.goldPrecision },
    tolerances: { gold: settings.tolerances, cash: settings.cashTolerance },
    inputs: { day, entries, adjustments, goldRows, movements },
    results: summary,
  };

  const t = nowIso();
  await db.run(
    `UPDATE daily_reconciliations
        SET status = 'finalized', snapshot = ?, engineVersion = ?, finalizedAt = ?, finalizedBy = ?,
            reasonText = ?, differenceReasons = ?, notes = COALESCE(?, notes), updatedAt = ?
      WHERE id = ? AND ownerId = ?`,
    [
      JSON.stringify(snapshot),
      ENGINE_VERSION,
      t,
      g.ctx.actor,
      reason || null,
      JSON.stringify(parsed.data.differenceReasons ?? day.differenceReasons),
      parsed.data.notes ?? null,
      t,
      day.id,
      g.ctx.ownerId,
    ],
  );
  await audit(g.ctx, 'daily_reconciliations', day.id, 'finalize', { status: day.status }, { status: 'finalized' }, reason || null);

  const fresh = await db.get('SELECT * FROM daily_reconciliations WHERE id = ?', [day.id]);
  return ok({ day: hydrateDay(fresh as never), summary });
}
