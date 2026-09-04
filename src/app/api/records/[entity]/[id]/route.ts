import { NextResponse } from 'next/server';
import { fail, guard, ok, readJson, requireCtx } from '@/lib/api';
import { ENTITY_TABLES, getRecord, restoreRecord, softDelete, updateRecord, type EntityName } from '@/lib/repo';
import { getDb } from '@/lib/db';
import {
  adjustmentPatchSchema,
  cashEntryPatchSchema,
  locationSchema,
  movementPatchSchema,
  personSchema,
} from '@/lib/schemas';
import type { ZodTypeAny } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATCH_SCHEMAS: Partial<Record<EntityName, ZodTypeAny>> = {
  cash_entries: cashEntryPatchSchema,
  cash_adjustments: adjustmentPatchSchema,
  gold_movements: movementPatchSchema,
  people: personSchema.partial(),
  locations: locationSchema.partial(),
};

/** gold_holdings is an internal ledger — it is deliberately not writable from here. */
function isEntity(v: string): v is EntityName {
  return Object.prototype.hasOwnProperty.call(ENTITY_TABLES, v) && v !== 'gold_holdings';
}

async function dayLocked(ownerId: string, dayId: unknown): Promise<boolean> {
  if (!dayId) return false;
  const db = await getDb();
  const day = await db.get<{ status: string }>('SELECT status FROM daily_reconciliations WHERE id = ? AND ownerId = ?', [
    dayId,
    ownerId,
  ]);
  return !!day && (day.status === 'finalized' || day.status === 'locked');
}

export async function PATCH(req: Request, { params }: { params: Promise<{ entity: string; id: string }> }): Promise<NextResponse> {
  const limited = guard(req, 'records-patch', 300, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { entity, id } = await params;
  if (!isEntity(entity)) return fail('unknown_entity', 404);

  const body = (await readJson(req)) as Record<string, unknown> | null;
  if (!body) return fail('invalid_input', 400);
  const { reason, restore, ...rest } = body;

  const before = await getRecord(g.ctx.ownerId, entity, id);
  if (!before) return fail('not_found', 404);
  if (await dayLocked(g.ctx.ownerId, before.dayId)) return fail('day_locked', 423);

  if (restore === true) {
    const row = await restoreRecord(g.ctx, entity, id, (reason as string) ?? null);
    return ok({ row });
  }

  const schema = PATCH_SCHEMAS[entity];
  if (!schema) return fail('unknown_entity', 404);
  const parsed = schema.safeParse(rest);
  if (!parsed.success) {
    return fail('invalid_input', 400, { issues: parsed.error.issues.map((i) => `${i.path.join('.')}:${i.message}`) });
  }
  const patch = parsed.data as Record<string, unknown>;
  delete patch.dayId;
  const row = await updateRecord(g.ctx, entity, id, patch, (reason as string) ?? null);
  return ok({ row });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ entity: string; id: string }> }): Promise<NextResponse> {
  const limited = guard(req, 'records-delete', 120, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { entity, id } = await params;
  if (!isEntity(entity)) return fail('unknown_entity', 404);

  const before = await getRecord(g.ctx.ownerId, entity, id);
  if (!before) return fail('not_found', 404);
  if (await dayLocked(g.ctx.ownerId, before.dayId)) return fail('day_locked', 423);

  const url = new URL(req.url);
  const row = await softDelete(g.ctx, entity, id, url.searchParams.get('reason'));
  return ok({ row });
}
