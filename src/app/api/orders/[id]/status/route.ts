import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { changeStatus, StatusError } from '@/lib/orders';
import { statusChangeSchema } from '@/lib/schemas';
import { can } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('order.status');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = statusChangeSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);
  if (parsed.data.toStatus === 'cancelled' && !can(g.ctx.role, 'order.cancel')) return fail('forbidden', 403);

  try {
    return ok({ order: await changeStatus(g.ctx, id, parsed.data) });
  } catch (e) {
    if (e instanceof StatusError) {
      // A pending balance is a confirmation prompt, not a failure.
      return fail(e.code, e.code === 'order_not_found' ? 404 : e.code === 'balance_outstanding' ? 409 : 422, e.extra);
    }
    throw e;
  }
}
