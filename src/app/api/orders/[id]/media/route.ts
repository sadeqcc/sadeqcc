import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { insertRecord, newId } from '@/lib/repo';
import { mediaSchema } from '@/lib/schemas';
import { nowIso } from '@/lib/date';

type Params = { params: Promise<{ id: string }> };

const LIST_COLUMNS = 'id, orderId, name, mime, size, kind, category, thumb, status, createdAt, updatedAt';

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const db = await getDb();
  const media = await db.all(
    `SELECT ${LIST_COLUMNS} FROM order_media WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY createdAt ASC`,
    [g.ctx.ownerId, id],
  );
  return ok({ media });
}

/**
 * The blob lives in the database next to the order, so a backup is complete on
 * its own. Photos arrive already compressed with a thumbnail from the client.
 */
export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = mediaSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const db = await getDb();
  const order = await db.get('SELECT id, coverMediaId FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!order) return fail('order_not_found', 404);

  const mediaId = parsed.data.id ?? newId();
  const kind = parsed.data.mime.startsWith('image/') ? 'photo' : parsed.data.mime.startsWith('video/') ? 'video' : 'file';

  await insertRecord(g.ctx, 'order_media', {
    id: mediaId,
    orderId: id,
    name: parsed.data.name,
    mime: parsed.data.mime,
    size: parsed.data.size,
    kind,
    category: parsed.data.category,
    data: parsed.data.data,
    thumb: parsed.data.thumb ?? null,
    status: 'active',
  });

  // The first photo becomes the cover unless one was already chosen.
  if (parsed.data.setAsCover || (!order.coverMediaId && kind === 'photo')) {
    await db.run('UPDATE orders SET coverMediaId = ?, updatedAt = ? WHERE id = ? AND ownerId = ?', [mediaId, nowIso(), id, g.ctx.ownerId]);
  }

  const media = await db.all(
    `SELECT ${LIST_COLUMNS} FROM order_media WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY createdAt ASC`,
    [g.ctx.ownerId, id],
  );
  return ok({ media, mediaId });
}
