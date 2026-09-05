import { fail, isDenied, ok, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { archiveRecord, getRecord } from '@/lib/repo';
import { nowIso } from '@/lib/date';

type Params = { params: Promise<{ id: string }> };

/** Streams the stored blob. Lazy-loaded by the gallery, one item at a time. */
export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const db = await getDb();
  const row = await db.get<{ data: string; mime: string; name: string }>(
    'SELECT data, mime, name FROM order_media WHERE id = ? AND ownerId = ? AND deletedAt IS NULL',
    [id, g.ctx.ownerId],
  );
  if (!row) return fail('not_found', 404);

  const base64 = String(row.data).split(',').pop() ?? '';
  const buffer = Buffer.from(base64, 'base64');
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': row.mime || 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { setAsCover?: boolean; category?: string } | null;

  const media = await getRecord(g.ctx.ownerId, 'order_media', id);
  if (!media || media.deletedAt) return fail('not_found', 404);

  const db = await getDb();
  if (body?.category) {
    await db.run('UPDATE order_media SET category = ?, updatedAt = ? WHERE id = ? AND ownerId = ?', [body.category, nowIso(), id, g.ctx.ownerId]);
  }
  if (body?.setAsCover && media.orderId) {
    await db.run('UPDATE orders SET coverMediaId = ?, updatedAt = ? WHERE id = ? AND ownerId = ?', [id, nowIso(), String(media.orderId), g.ctx.ownerId]);
  }
  return ok({ id, updated: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const media = await getRecord(g.ctx.ownerId, 'order_media', id);
  if (!media) return fail('not_found', 404);
  await archiveRecord(g.ctx, 'order_media', id, new URL(req.url).searchParams.get('reason'));

  // An archived cover would leave a broken thumbnail on the card.
  if (media.orderId) {
    const db = await getDb();
    const order = await db.get<{ coverMediaId: string | null }>('SELECT coverMediaId FROM orders WHERE id = ? AND ownerId = ?', [String(media.orderId), g.ctx.ownerId]);
    if (order?.coverMediaId === id) {
      const next = await db.get<{ id: string }>(
        `SELECT id FROM order_media WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL AND kind = 'photo' ORDER BY createdAt ASC LIMIT 1`,
        [g.ctx.ownerId, String(media.orderId)],
      );
      await db.run('UPDATE orders SET coverMediaId = ?, updatedAt = ? WHERE id = ? AND ownerId = ?', [next?.id ?? null, nowIso(), String(media.orderId), g.ctx.ownerId]);
    }
  }
  return ok({ archived: true, id });
}
