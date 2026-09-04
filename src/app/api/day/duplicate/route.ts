import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { audit, findDay, getOrCreateDay, hydrateDay, insertRecord, listDayData, upsertGoldRow } from '@/lib/repo';
import { dateStr } from '@/lib/schemas';
import { addDays } from '@/lib/date';
import { z } from 'zod';
import type { CashEntry, GoldRow } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  toDate: dateStr,
  fromDate: dateStr.optional(),
  shift: z.string().max(32).default('main'),
  confirm: z.literal(true),
});

/**
 * Starts a day from the previous one. Only carry-over balances are copied
 * (principal, debts, commissions, customer deposits) plus the gold system
 * weights — sales are never copied, they belong to their own day.
 */
const CARRY_KINDS = ['principal', 'debt', 'commission', 'amanat'];

export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'duplicate', 30, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);

  const fromDate = parsed.data.fromDate ?? addDays(parsed.data.toDate, -1);
  const source = await findDay(g.ctx.ownerId, fromDate, parsed.data.shift);
  if (!source) return fail('source_not_found', 404);

  const target = await getOrCreateDay(g.ctx, parsed.data.toDate, parsed.data.shift);
  if (target.status === 'finalized' || target.status === 'locked') return fail('day_locked', 423);

  const existing = await listDayData(g.ctx.ownerId, target.id);
  if (existing.entries.length > 0) return fail('target_not_empty', 409);

  const src = await listDayData(g.ctx.ownerId, source.id);
  let copied = 0;
  for (const raw of src.entries as unknown as CashEntry[]) {
    if (!CARRY_KINDS.includes(raw.kind)) continue;
    await insertRecord(g.ctx, 'cash_entries', {
      dayId: target.id,
      kind: raw.kind,
      amountFils: Number(raw.amountFils),
      personName: raw.personName,
      description: raw.description,
      refNo: raw.refNo,
      entryDate: parsed.data.toDate,
      dueDate: raw.dueDate,
      note: raw.note,
      attachmentId: null,
      status: 'active',
      deletedAt: null,
    });
    copied += 1;
  }
  for (const row of src.goldRows as unknown as GoldRow[]) {
    await upsertGoldRow(g.ctx, target.id, row.karat, { systemMg: Number(row.systemMg), drawerMg: 0 });
  }

  await audit(g.ctx, 'daily_reconciliations', target.id, 'duplicate_day', { fromDate }, { copied });
  const fresh = await findDay(g.ctx.ownerId, parsed.data.toDate, parsed.data.shift);
  return ok({ day: fresh ? hydrateDay(fresh) : null, copied });
}
