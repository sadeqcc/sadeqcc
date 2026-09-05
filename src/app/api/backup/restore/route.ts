import { fail, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { verifyPin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { audit } from '@/lib/repo';
import { restoreSchema } from '@/lib/schemas';
import { BACKUP_TABLES } from '../export/route';

const KNOWN = new Set<string>(BACKUP_TABLES);

/**
 * Validates the whole file before a single row is touched, then replaces the
 * owner's data inside one transaction. Existing data is only cleared once the
 * incoming payload has been checked end to end.
 */
export async function POST(req: Request) {
  const g = await requireCtx('backup.manage');
  if (isDenied(g)) return g.response;

  const parsed = restoreSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_backup', 422, { issues: parsed.error.issues.map((i) => i.message) });
  if (!(await verifyPin(g.ctx.userId, parsed.data.pin ?? ''))) return fail('wrong_pin', 403);

  const { backup } = parsed.data;
  const db = await getDb();

  // Validation pass — nothing is written until every table and row looks sane.
  const staged: { table: string; rows: Record<string, unknown>[]; columns: string[] }[] = [];
  const counts: Record<string, number> = {};

  for (const [table, rows] of Object.entries(backup.tables)) {
    if (!KNOWN.has(table)) return fail('unknown_table', 422, { table });
    const info = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    const columns = info.map((c) => c.name);
    if (!columns.length) return fail('unknown_table', 422, { table });
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!columns.includes(key)) return fail('unknown_column', 422, { table, column: key });
      }
      // Only tables that actually have an id column are required to carry one:
      // app_settings is keyed by ownerId and order_counters by ownerId + year.
      if (columns.includes('id') && !row.id) return fail('row_missing_id', 422, { table });
    }
    staged.push({ table, rows, columns });
    counts[table] = rows.length;
  }

  await db.tx(async () => {
    for (const { table } of staged) {
      await db.run(`DELETE FROM ${table} WHERE ownerId = ?`, [g.ctx.ownerId]);
    }
    for (const { table, rows } of staged) {
      for (const row of rows) {
        // Rows are re-homed onto the restoring owner, never another account.
        const data: Record<string, unknown> = { ...row, ownerId: g.ctx.ownerId };
        const keys = Object.keys(data);
        await db.run(
          `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
          keys.map((k) => data[k] ?? null),
        );
      }
    }
  });

  await audit(g.ctx, 'backup', g.ctx.ownerId, 'restore', null, { counts, exportedAt: backup.exportedAt });
  return ok({ restored: true, counts });
}
