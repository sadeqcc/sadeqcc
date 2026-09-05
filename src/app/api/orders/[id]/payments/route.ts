import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { hydratePayment, recomputeTotals } from '@/lib/orders';
import { insertRecord, newId } from '@/lib/repo';
import { paymentSchema } from '@/lib/schemas';
import { nowIso } from '@/lib/date';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const db = await getDb();
  const rows = await db.all(
    'SELECT * FROM payments WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY paidOn ASC, createdAt ASC',
    [g.ctx.ownerId, id],
  );
  return ok({ payments: rows.map(hydratePayment) });
}

export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('payment.create');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = paymentSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const db = await getDb();
  const order = await db.get('SELECT id FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!order) return fail('order_not_found', 404);

  await insertRecord(g.ctx, 'payments', {
    id: parsed.data.id ?? newId(),
    orderId: id,
    amountFils: parsed.data.amountFils,
    paidOn: parsed.data.paidOn,
    paidAt: parsed.data.paidAt ?? nowIso(),
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    note: parsed.data.note ?? null,
    mediaId: parsed.data.mediaId ?? null,
    createdByName: g.ctx.actor,
    status: 'active',
  });

  const order2 = await recomputeTotals(g.ctx, id);
  const rows = await db.all(
    'SELECT * FROM payments WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY paidOn ASC, createdAt ASC',
    [g.ctx.ownerId, id],
  );
  return ok({ payments: rows.map(hydratePayment), order: order2 });
}
