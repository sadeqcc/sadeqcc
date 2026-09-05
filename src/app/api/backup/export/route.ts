import { isDenied, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { dubaiDate, nowIso } from '@/lib/date';

/** Tables are exported in dependency order so a restore can replay them as-is. */
export const BACKUP_TABLES = [
  'app_settings',
  'customers',
  'makers',
  'travelers',
  'traveler_shipments',
  'orders',
  'order_status_history',
  'payments',
  'gold_exchanges',
  'order_notes',
  'order_media',
  'follow_ups',
  'tags',
  'order_counters',
  'audit_logs',
] as const;

export async function GET(req: Request) {
  const g = await requireCtx('backup.manage');
  if (isDenied(g)) return g.response;

  const withMedia = new URL(req.url).searchParams.get('media') !== '0';
  const db = await getDb();
  const tables: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    if (table === 'order_media' && !withMedia) {
      tables[table] = await db.all(
        `SELECT id, ownerId, orderId, name, mime, size, kind, category, thumb, status, createdAt, updatedAt, createdBy, deletedAt
           FROM order_media WHERE ownerId = ?`,
        [g.ctx.ownerId],
      );
      continue;
    }
    tables[table] = await db.all(`SELECT * FROM ${table} WHERE ownerId = ?`, [g.ctx.ownerId]);
  }

  const payload = {
    app: 'gold-orders' as const,
    version: 1,
    exportedAt: nowIso(),
    exportedBy: g.ctx.actor,
    includesMedia: withMedia,
    tables,
  };

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="gold-orders-backup-${dubaiDate()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
