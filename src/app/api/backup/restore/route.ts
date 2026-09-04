import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { audit } from '@/lib/repo';
import { verifyPin } from '@/lib/auth';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE_COLUMNS: Record<string, string[]> = {
  daily_reconciliations: ['id','ownerId','date','shift','status','employeeName','systemCashFils','physicalMode','physicalCashFils','denominations','notes','differenceReasons','reasonText','snapshot','engineVersion','startedAt','finalizedAt','finalizedBy','createdAt','updatedAt','createdBy','deletedAt'],
  cash_entries: ['id','ownerId','dayId','kind','amountFils','personName','description','refNo','entryDate','dueDate','note','attachmentId','status','createdAt','updatedAt','createdBy','deletedAt'],
  cash_adjustments: ['id','ownerId','dayId','name','amountFils','direction','note','entryDate','attachmentId','status','createdAt','updatedAt','createdBy','deletedAt'],
  gold_reconciliations: ['id','ownerId','dayId','karat','systemMg','drawerMg','status','createdAt','updatedAt','createdBy','deletedAt'],
  gold_movements: ['id','ownerId','karat','direction','holderType','holderName','weightMg','returnedMg','deliveryDate','expectedReturnDate','returnedAt','reason','refNo','note','attachmentId','status','createdAt','updatedAt','createdBy','deletedAt'],
  gold_holdings: ['id','ownerId','movementId','dayId','karat','weightMg','kind','status','createdAt','updatedAt','createdBy','deletedAt'],
  third_party_gold: ['id','ownerId','movementId','ownerName','karat','weightMg','status','createdAt','updatedAt','createdBy','deletedAt'],
  people: ['id','ownerId','name','type','phone','note','status','createdAt','updatedAt','createdBy','deletedAt'],
  locations: ['id','ownerId','name','kind','note','status','createdAt','updatedAt','createdBy','deletedAt'],
  attachments: ['id','ownerId','name','mime','size','data','status','createdAt','updatedAt','createdBy','deletedAt'],
  audit_logs: ['id','ownerId','entity','entityId','action','oldValue','newValue','actor','reason','status','createdAt','updatedAt','createdBy','deletedAt'],
};

const schema = z.object({
  pin: z.string().max(32).optional().nullable(),
  mode: z.enum(['merge', 'replace']).default('merge'),
  confirm: z.literal(true),
  backup: z.object({
    format: z.string(),
    exportedAt: z.string().optional(),
    data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

/**
 * Validates first, writes second. Existing data is only cleared once the payload
 * has been accepted, and every row is re-stamped with the current owner id.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'restore', 5, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return fail('invalid_backup', 400);
  if (!parsed.data.backup.format.startsWith('sadeq-drawer-backup')) return fail('unsupported_format', 422);
  if (!(await verifyPin(g.ctx.userId, parsed.data.pin ?? ''))) return fail('bad_pin', 403);

  const { data } = parsed.data.backup;
  const known = Object.keys(TABLE_COLUMNS);
  for (const table of Object.keys(data)) {
    if (table !== 'app_settings' && !known.includes(table)) return fail('unknown_table', 422, { table });
  }

  const db = await getDb();
  const counts: Record<string, number> = {};

  if (parsed.data.mode === 'replace') {
    for (const t of [...known, 'app_settings']) {
      await db.run(`DELETE FROM ${t} WHERE ownerId = ?`, [g.ctx.ownerId]);
    }
  }

  for (const table of known) {
    const rows = data[table] ?? [];
    let n = 0;
    for (const row of rows) {
      const cols = TABLE_COLUMNS[table];
      const values = cols.map((c) => (c === 'ownerId' ? g.ctx.ownerId : ((row[c] as unknown) ?? null)));
      await db.run(
        `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
        values,
      );
      n += 1;
    }
    counts[table] = n;
  }

  const settingsRows = data.app_settings ?? [];
  if (settingsRows.length) {
    const s = settingsRows[0];
    await db.run(
      `INSERT OR REPLACE INTO app_settings (ownerId, data, createdAt, updatedAt, createdBy, status) VALUES (?,?,?,?,?,?)`,
      [g.ctx.ownerId, String(s.data ?? '{}'), String(s.createdAt ?? ''), String(s.updatedAt ?? ''), g.ctx.userId, 'active'],
    );
    counts.app_settings = 1;
  }

  await audit(g.ctx, 'backup', 'restore', 'restore', null, { counts, mode: parsed.data.mode }, 'backup restore');
  return ok({ counts, mode: parsed.data.mode });
}
