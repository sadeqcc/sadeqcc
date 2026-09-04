import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { ENTITY_TABLES, insertRecord, type EntityName } from '@/lib/repo';
import { getDb } from '@/lib/db';
import {
  adjustmentSchema,
  cashEntrySchema,
  locationSchema,
  movementSchema,
  personSchema,
} from '@/lib/schemas';
import type { ZodTypeAny } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CREATE_SCHEMAS: Partial<Record<EntityName, ZodTypeAny>> = {
  cash_entries: cashEntrySchema,
  cash_adjustments: adjustmentSchema,
  gold_movements: movementSchema,
  people: personSchema,
  locations: locationSchema,
};

/** gold_holdings is an internal ledger — it is deliberately not writable from here. */
function isEntity(v: string): v is EntityName {
  return Object.prototype.hasOwnProperty.call(ENTITY_TABLES, v) && v !== 'gold_holdings';
}

export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { entity } = await params;
  if (!isEntity(entity)) return fail('unknown_entity', 404);

  const url = new URL(req.url);
  const dayId = url.searchParams.get('dayId');
  const includeDeleted = url.searchParams.get('includeDeleted') === '1';
  const db = await getDb();

  const where = ['ownerId = ?'];
  const args: unknown[] = [g.ctx.ownerId];
  if (!includeDeleted) where.push('deletedAt IS NULL');
  if (dayId && (entity === 'cash_entries' || entity === 'cash_adjustments')) {
    where.push('dayId = ?');
    args.push(dayId);
  }
  const rows = await db.all(
    `SELECT * FROM ${ENTITY_TABLES[entity]} WHERE ${where.join(' AND ')} ORDER BY createdAt DESC LIMIT 1000`,
    args,
  );
  return ok({ rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }): Promise<NextResponse> {
  const limited = guard(req, 'records-write', 300, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { entity } = await params;
  if (!isEntity(entity)) return fail('unknown_entity', 404);

  const schema = CREATE_SCHEMAS[entity];
  if (!schema) return fail('unknown_entity', 404);
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) {
    return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`) });
  }
  const data = parsed.data as Record<string, unknown>;

  // Writing into a locked day is refused everywhere, not just in the UI.
  if (entity === 'cash_entries' || entity === 'cash_adjustments') {
    const db = await getDb();
    const day = await db.get<{ status: string }>(
      'SELECT status FROM daily_reconciliations WHERE id = ? AND ownerId = ?',
      [data.dayId, g.ctx.ownerId],
    );
    if (!day) return fail('not_found', 404);
    if (day.status === 'finalized' || day.status === 'locked') return fail('day_locked', 423);
  }
  if (entity === 'gold_movements') {
    data.returnedMg = 0;
    data.status = 'outstanding';
  }

  const row = await insertRecord(g.ctx, entity, data);
  return ok({ row });
}
