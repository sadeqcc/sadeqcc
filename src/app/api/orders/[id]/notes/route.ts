import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { insertRecord, newId } from '@/lib/repo';
import { noteSchema } from '@/lib/schemas';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = noteSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const db = await getDb();
  const order = await db.get('SELECT id FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!order) return fail('order_not_found', 404);

  await insertRecord(g.ctx, 'order_notes', {
    id: parsed.data.id ?? newId(),
    orderId: id,
    text: parsed.data.text,
    pinned: parsed.data.pinned ? 1 : 0,
    createdByName: g.ctx.actor,
    status: 'active',
  });

  const notes = await db.all(
    'SELECT * FROM order_notes WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY pinned DESC, createdAt DESC',
    [g.ctx.ownerId, id],
  );
  return ok({ notes });
}
