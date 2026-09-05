import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { getOrderBundle, getOrderView, hydrateOrder, recomputeTotals } from '@/lib/orders';
import { archiveRecord, audit, restoreRecord } from '@/lib/repo';
import { orderUpdateSchema } from '@/lib/schemas';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const bundle = await getOrderBundle(g.ctx.ownerId, id);
  if (!bundle) return fail('not_found', 404);
  return ok(bundle);
}

/** Field-level edits. Status moves go through /status so history is always written. */
export async function PATCH(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = orderUpdateSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);
  const { reason, tags, ...rest } = parsed.data;

  const db = await getDb();
  const beforeRow = await db.get('SELECT * FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!beforeRow) return fail('not_found', 404);
  const before = hydrateOrder(beforeRow);

  const patch: Record<string, unknown> = { ...rest };
  if (tags) patch.tags = JSON.stringify(tags);
  const keys = Object.keys(patch);
  if (!keys.length) return ok({ order: await getOrderView(g.ctx.ownerId, id) });

  await db.run(
    `UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updatedAt = ? WHERE id = ? AND ownerId = ?`,
    [...keys.map((k) => patch[k] ?? null), new Date().toISOString(), id, g.ctx.ownerId],
  );

  const afterRow = await db.get('SELECT * FROM orders WHERE id = ? AND ownerId = ?', [id, g.ctx.ownerId]);
  const after = afterRow ? hydrateOrder(afterRow) : null;
  await audit(g.ctx, 'orders', id, 'update', before, after, reason ?? null);

  // A weight, rate or charge edit moves the money, so the totals are rebuilt.
  await recomputeTotals(g.ctx, id);
  return ok({ order: await getOrderView(g.ctx.ownerId, id) });
}

/** Archive, never destroy — the row and its whole history stay in the database. */
export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('order.delete');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const url = new URL(req.url);
  const reason = url.searchParams.get('reason');

  if (url.searchParams.get('restore') === '1') {
    const restored = await restoreRecord(g.ctx, 'orders', id, reason);
    if (!restored) return fail('not_found', 404);
    return ok({ order: await getOrderView(g.ctx.ownerId, id) });
  }

  const archived = await archiveRecord(g.ctx, 'orders', id, reason);
  if (!archived) return fail('not_found', 404);
  return ok({ archived: true, id });
}
