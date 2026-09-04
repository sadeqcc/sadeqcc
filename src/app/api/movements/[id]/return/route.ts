import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { audit, getRecord, insertRecord, updateRecord } from '@/lib/repo';
import { goldWeight } from '@/lib/schemas';
import { nowIso, dubaiDate } from '@/lib/date';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  returnedMg: goldWeight,
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Records a (partial) return. The original weight is never erased. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const limited = guard(req, 'movement-return', 120, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const { id } = await params;
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_input', 400);

  const before = await getRecord(g.ctx.ownerId, 'gold_movements', id);
  if (!before || before.deletedAt) return fail('not_found', 404);

  const weightMg = Number(before.weightMg);
  const already = Number(before.returnedMg ?? 0);
  const total = already + parsed.data.returnedMg;
  if (total > weightMg) return fail('return_exceeds_weight', 422);

  const eventDate = parsed.data.returnDate ?? dubaiDate();
  const done = total === weightMg;

  // Dated ledger entry: a return recorded today never rewrites yesterday's totals.
  await insertRecord(g.ctx, 'gold_holdings', {
    movementId: id,
    dayId: null,
    karat: String(before.karat),
    weightMg: parsed.data.returnedMg,
    kind: 'return',
    eventDate,
    status: 'active',
    deletedAt: null,
  });

  const patch: Record<string, unknown> = {
    returnedMg: total,
    status: done ? 'returned' : 'partially_returned',
    returnedAt: done ? `${eventDate}T${nowIso().slice(11)}` : null,
    note: parsed.data.note ?? (before.note as string | null),
  };
  const row = await updateRecord(g.ctx, 'gold_movements', id, patch, 'return');
  await audit(g.ctx, 'gold_movements', id, done ? 'returned' : 'partially_returned', { returnedMg: already }, { returnedMg: total });
  return ok({ row });
}
