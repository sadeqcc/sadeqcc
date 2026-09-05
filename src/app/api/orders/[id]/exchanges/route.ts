import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { hydrateExchange, recomputeTotals } from '@/lib/orders';
import { insertRecord, newId } from '@/lib/repo';
import { exchangeSchema } from '@/lib/schemas';

type Params = { params: Promise<{ id: string }> };

/** Old gold taken in part-exchange counts toward what the customer has paid. */
export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('payment.create');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = exchangeSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const db = await getDb();
  const order = await db.get('SELECT id FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!order) return fail('order_not_found', 404);

  await insertRecord(g.ctx, 'gold_exchanges', {
    id: parsed.data.id ?? newId(),
    orderId: id,
    karat: parsed.data.karat,
    weightMg: parsed.data.weightMg,
    rateFilsPerGram: parsed.data.rateFilsPerGram,
    valueFils: parsed.data.valueFils,
    mediaId: parsed.data.mediaId ?? null,
    notes: parsed.data.notes ?? null,
    receivedOn: parsed.data.receivedOn,
    status: 'active',
  });

  const updated = await recomputeTotals(g.ctx, id);
  const rows = await db.all('SELECT * FROM gold_exchanges WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY receivedOn ASC', [g.ctx.ownerId, id]);
  return ok({ exchanges: rows.map(hydrateExchange), order: updated });
}
