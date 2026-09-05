import { fail, isDenied, ok, requireCtx } from '@/lib/api';
import { verifyPin } from '@/lib/auth';
import { getAccount, listLedger } from '@/lib/customers';
import { archiveRecord, getRecord } from '@/lib/repo';

type Params = { params: Promise<{ id: string }> };

/** Removing money needs the PIN, exactly like deleting a payment on an order. */
export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('payment.delete');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const url = new URL(req.url);

  if (!(await verifyPin(g.ctx.userId, url.searchParams.get('pin') ?? ''))) return fail('wrong_pin', 403);

  const before = await getRecord(g.ctx.ownerId, 'customer_ledger', id);
  if (!before || before.deletedAt) return fail('not_found', 404);

  await archiveRecord(g.ctx, 'customer_ledger', id, url.searchParams.get('reason'));
  const customerId = String(before.customerId);
  const [entries, account] = await Promise.all([listLedger(g.ctx.ownerId, customerId), getAccount(g.ctx.ownerId, customerId)]);
  return ok({ entries, account });
}
