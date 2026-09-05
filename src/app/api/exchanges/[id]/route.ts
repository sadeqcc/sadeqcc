import { fail, isDenied, ok, requireCtx } from '@/lib/api';
import { verifyPin } from '@/lib/auth';
import { recomputeTotals } from '@/lib/orders';
import { archiveRecord, getRecord } from '@/lib/repo';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('payment.delete');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const url = new URL(req.url);

  if (!(await verifyPin(g.ctx.userId, url.searchParams.get('pin') ?? ''))) return fail('wrong_pin', 403);

  const before = await getRecord(g.ctx.ownerId, 'gold_exchanges', id);
  if (!before) return fail('not_found', 404);
  await archiveRecord(g.ctx, 'gold_exchanges', id, url.searchParams.get('reason'));
  const order = await recomputeTotals(g.ctx, String(before.orderId));
  return ok({ archived: true, order });
}
