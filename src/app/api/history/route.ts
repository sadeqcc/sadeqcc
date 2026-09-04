import { NextResponse } from 'next/server';
import { fail, ok, requireCtx } from '@/lib/api';
import { getSettings, listAdjustmentsRange, listDays, listEntriesRange, listGoldRange, listMovements, listReturnEvents } from '@/lib/repo';
import { digestDay, monthStats, movementsAsOf, type DayBundleRow, type DayDigest } from '@/lib/history';
import { isValidDate, monthRange } from '@/lib/date';
import type { CashAdjustment, CashEntry, GoldMovement, GoldRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseSnapshot(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Calendar + analytics feed. Open days are recomputed; closed days report their snapshot. */
export async function GET(req: Request): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  let start = url.searchParams.get('start') ?? '';
  let end = url.searchParams.get('end') ?? '';
  if (month && /^\d{4}-\d{2}$/.test(month)) ({ start, end } = monthRange(month));
  if (!isValidDate(start) || !isValidDate(end)) return fail('invalid_range', 400);

  const ownerId = g.ctx.ownerId;
  const [settings, days, entries, adjustments, goldRows, movements, returns] = await Promise.all([
    getSettings(ownerId),
    listDays(ownerId, start, end),
    listEntriesRange(ownerId, start, end),
    listAdjustmentsRange(ownerId, start, end),
    listGoldRange(ownerId, start, end),
    listMovements(ownerId, { all: true }),
    listReturnEvents(ownerId),
  ]);

  const allMovements = movements as unknown as GoldMovement[];
  const digests: DayDigest[] = [];
  for (const raw of days) {
    const day = raw as unknown as DayBundleRow;
    const { digest } = digestDay(day, {
      entries: (entries as unknown as CashEntry[]).filter((e) => e.dayId === day.id),
      adjustments: (adjustments as unknown as CashAdjustment[]).filter((a) => a.dayId === day.id),
      goldRows: (goldRows as unknown as GoldRow[]).filter((r) => r.dayId === day.id),
      movements: movementsAsOf(allMovements, day.date, returns),
      settings,
      snapshot: parseSnapshot((raw as { snapshot?: string | null }).snapshot),
    });
    digests.push(digest);
  }

  const sumKind = (k: string) =>
    (entries as unknown as CashEntry[]).filter((e) => e.kind === k).reduce((a, e) => a + Number(e.amountFils), 0);

  const stats = monthStats(month ?? start.slice(0, 7), digests, {
    principal: sumKind('principal'),
    debts: sumKind('debt'),
    commissions: sumKind('commission'),
    amanat: sumKind('amanat'),
    unregistered: sumKind('unregistered_sale'),
    duplicates: sumKind('duplicate_sale') + sumKind('system_error'),
  });

  const outstanding = allMovements.filter((m) => !m.deletedAt && m.status !== 'returned');

  return ok({ start, end, days: digests, stats, settings, outstanding });
}
