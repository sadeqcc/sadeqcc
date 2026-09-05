import { isDenied, ok, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { listOrders } from '@/lib/orders';

/** One box across orders, customers, makers and travelers. */
export async function GET(req: Request) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 1) return ok({ orders: [], customers: [], makers: [], travelers: [] });

  const like = `%${q.toLowerCase()}%`;
  const db = await getDb();
  const [{ orders }, customers, makers, travelers] = await Promise.all([
    listOrders(g.ctx.ownerId, { search: q, limit: 25, sort: 'priority' }),
    db.all(
      `SELECT id, name, phone, whatsapp, country, city, customerType FROM customers
        WHERE ownerId = ? AND deletedAt IS NULL
          AND (LOWER(name) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(whatsapp,'')) LIKE ?)
        ORDER BY name LIMIT 10`,
      [g.ctx.ownerId, like, like, like],
    ),
    db.all(
      `SELECT id, name, company, phone, specialty FROM makers
        WHERE ownerId = ? AND deletedAt IS NULL AND (LOWER(name) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ?)
        ORDER BY name LIMIT 10`,
      [g.ctx.ownerId, like, like],
    ),
    db.all(
      `SELECT id, name, phone, frequentRoute FROM travelers
        WHERE ownerId = ? AND deletedAt IS NULL AND (LOWER(name) LIKE ? OR LOWER(COALESCE(frequentRoute,'')) LIKE ?)
        ORDER BY name LIMIT 10`,
      [g.ctx.ownerId, like, like],
    ),
  ]);

  return ok({ orders, customers, makers, travelers });
}
