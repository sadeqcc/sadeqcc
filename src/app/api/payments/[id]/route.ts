import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { verifyPin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { recomputeTotals } from '@/lib/orders';
import { archiveRecord, getRecord, updateRecord } from '@/lib/repo';
import { paymentSchema } from '@/lib/schemas';

type Params = { params: Promise<{ id: string }> };

/** Editing money always leaves an audit row carrying the old and new values. */
export async function PATCH(req: Request, { params }: Params) {
  const g = await requireCtx('payment.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const body = await readJson(req);
  const parsed = paymentSchema.partial().safeParse(body);
  if (!parsed.success) return invalid(parsed.error.issues);

  const before = await getRecord(g.ctx.ownerId, 'payments', id);
  if (!before || before.deletedAt) return fail('not_found', 404);

  const { reason, id: _ignored, ...patch } = parsed.data;
  const updated = await updateRecord(g.ctx, 'payments', id, patch as Record<string, unknown>, reason ?? null);
  if (!updated) return fail('not_found', 404);

  const order = await recomputeTotals(g.ctx, String(before.orderId));
  return ok({ payment: updated, order });
}

/** Financial records need the PIN as the second confirmation. */
export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('payment.delete');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const url = new URL(req.url);
  const pin = url.searchParams.get('pin') ?? '';
  const reason = url.searchParams.get('reason');

  if (!(await verifyPin(g.ctx.userId, pin))) return fail('wrong_pin', 403);

  const db = await getDb();
  const before = await getRecord(g.ctx.ownerId, 'payments', id);
  if (!before) return fail('not_found', 404);

  await archiveRecord(g.ctx, 'payments', id, reason);
  const order = await recomputeTotals(g.ctx, String(before.orderId));
  const rows = await db.all(
    'SELECT * FROM payments WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY paidOn ASC',
    [g.ctx.ownerId, String(before.orderId)],
  );
  return ok({ payments: rows, order });
}
