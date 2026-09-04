import { NextResponse } from 'next/server';
import { ok, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { nowIso } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLES = [
  'daily_reconciliations',
  'cash_entries',
  'cash_adjustments',
  'gold_reconciliations',
  'gold_movements',
  'gold_holdings',
  'third_party_gold',
  'people',
  'locations',
  'attachments',
  'audit_logs',
  'app_settings',
];

export const BACKUP_FORMAT = 'sadeq-drawer-backup/1';

/** Full owner-scoped backup. Includes soft-deleted rows so a restore is faithful. */
export async function GET(req: Request): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const db = await getDb();
  const url = new URL(req.url);
  const skipAttachments = url.searchParams.get('light') === '1';

  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    if (t === 'attachments' && skipAttachments) {
      data[t] = [];
      continue;
    }
    data[t] = await db.all(`SELECT * FROM ${t} WHERE ownerId = ?`, [g.ctx.ownerId]);
  }
  const payload = {
    format: BACKUP_FORMAT,
    exportedAt: nowIso(),
    ownerId: g.ctx.ownerId,
    counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    data,
  };
  return ok(payload);
}
