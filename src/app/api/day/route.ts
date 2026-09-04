import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import {
  audit,
  findDay,
  getOrCreateDay,
  getSettings,
  hydrateDay,
  listDayData,
  listMovements,
  type DayRow,
} from '@/lib/repo';
import { getDb } from '@/lib/db';
import { dayPatchSchema } from '@/lib/schemas';
import { dubaiDate, isValidDate, nowIso } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything needed to render a business day, in a single round trip. */
export async function GET(req: Request): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || dubaiDate();
  const shift = url.searchParams.get('shift') || 'main';
  if (!isValidDate(date)) return fail('invalid_date', 400);

  const create = url.searchParams.get('create') === '1';
  const row = create ? await getOrCreateDay(g.ctx, date, shift) : await findDay(g.ctx.ownerId, date, shift);
  const settings = await getSettings(g.ctx.ownerId);
  const movements = await listMovements(g.ctx.ownerId, { onDate: date });

  if (!row) {
    return ok({ day: null, entries: [], adjustments: [], goldRows: [], movements, settings, date, shift });
  }
  const data = await listDayData(g.ctx.ownerId, row.id);
  return ok({ day: hydrateDay(row), ...data, movements, settings, date, shift });
}

/** Auto-save of the day header (system cash, drawer cash, denominations, notes). */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'day-write', 300, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = dayPatchSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`) });
  }
  const { date, shift, ...patch } = parsed.data;
  const day = await getOrCreateDay(g.ctx, date, shift);
  if (day.status === 'finalized' || day.status === 'locked') return fail('day_locked', 423);

  const db = await getDb();
  const fields: Record<string, unknown> = {};
  if ('employeeName' in patch) fields.employeeName = patch.employeeName ?? null;
  if ('systemCashFils' in patch) fields.systemCashFils = patch.systemCashFils ?? null;
  if (patch.physicalMode) fields.physicalMode = patch.physicalMode;
  if (patch.physicalCashFils !== undefined) fields.physicalCashFils = patch.physicalCashFils;
  if (patch.denominations) fields.denominations = JSON.stringify(patch.denominations);
  if ('notes' in patch) fields.notes = patch.notes ?? null;
  if (patch.differenceReasons) fields.differenceReasons = JSON.stringify(patch.differenceReasons);
  if ('reasonText' in patch) fields.reasonText = patch.reasonText ?? null;

  const keys = Object.keys(fields);
  if (keys.length) {
    const t = nowIso();
    await db.run(
      `UPDATE daily_reconciliations SET ${keys.map((k) => `${k} = ?`).join(', ')}, status = CASE WHEN status = 'not_started' THEN 'draft' ELSE status END, startedAt = COALESCE(startedAt, ?), updatedAt = ? WHERE id = ? AND ownerId = ?`,
      [...keys.map((k) => fields[k] ?? null), t, t, day.id, g.ctx.ownerId],
    );
    await audit(g.ctx, 'daily_reconciliations', day.id, 'update', pick(day, keys), fields);
  }
  const fresh = await findDay(g.ctx.ownerId, date, shift);
  return ok({ day: fresh ? hydrateDay(fresh) : null });
}

function pick(row: DayRow, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (row as unknown as Record<string, unknown>)[k];
  return out;
}
