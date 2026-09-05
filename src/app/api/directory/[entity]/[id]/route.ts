import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { archiveRecord, getRecord, isEntity, n, restoreRecord, safeJson, updateRecord } from '@/lib/repo';
import { customerSchema, makerSchema, shipmentSchema, tagSchema, travelerSchema } from '@/lib/schemas';

type Params = { params: Promise<{ entity: string; id: string }> };

const SCHEMAS = {
  customers: customerSchema,
  makers: makerSchema,
  travelers: travelerSchema,
  tags: tagSchema,
  traveler_shipments: shipmentSchema,
} as const;

type Allowed = keyof typeof SCHEMAS;
const isAllowed = (s: string): s is Allowed => Object.prototype.hasOwnProperty.call(SCHEMAS, s);

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { entity, id } = await params;
  if (!isAllowed(entity) || !isEntity(entity)) return fail('unknown_entity', 404);

  const item = await getRecord(g.ctx.ownerId, entity, id);
  if (!item) return fail('not_found', 404);

  const db = await getDb();
  const column = entity === 'customers' ? 'customerId' : entity === 'makers' ? 'makerId' : entity === 'travelers' ? 'travelerId' : null;
  let stats: Record<string, number> = {};
  let shipments: Record<string, unknown>[] = [];

  if (column) {
    const row = await db.get<Record<string, number>>(
      `SELECT COUNT(*) AS totalOrders,
              SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS activeOrders,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS deliveredOrders,
              SUM(CASE WHEN status != 'cancelled' THEN totalAmountFils ELSE 0 END) AS totalPurchasesFils,
              SUM(CASE WHEN status != 'cancelled' THEN remainingBalanceFils ELSE 0 END) AS outstandingFils,
              SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN COALESCE(actualWeightMg, expectedWeightMg) ELSE 0 END) AS activeWeightMg,
              SUM(makerCostFils) AS totalCostFils
         FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND ${column} = ?`,
      [g.ctx.ownerId, id],
    );
    stats = Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, n(v)]));
  }

  if (entity === 'travelers') {
    shipments = await db.all(
      `SELECT s.*, (SELECT COUNT(*) FROM orders o WHERE o.travelerShipmentId = s.id AND o.deletedAt IS NULL) AS orderCount,
              (SELECT COALESCE(SUM(COALESCE(o.actualWeightMg, o.expectedWeightMg)),0) FROM orders o WHERE o.travelerShipmentId = s.id AND o.deletedAt IS NULL) AS totalWeightMg
         FROM traveler_shipments s
        WHERE s.ownerId = ? AND s.travelerId = ? AND s.deletedAt IS NULL
        ORDER BY s.departureDate DESC`,
      [g.ctx.ownerId, id],
    );
  }

  const hydrated = entity === 'customers' ? { ...item, tags: safeJson<string[]>(item.tags as string, []) } : item;
  return ok({ item: hydrated, stats, shipments });
}

export async function PATCH(req: Request, { params }: Params) {
  const { entity, id } = await params;
  if (!isAllowed(entity) || !isEntity(entity)) return fail('unknown_entity', 404);
  const g = await requireCtx(entity === 'customers' ? 'customer.manage' : 'directory.manage');
  if (isDenied(g)) return g.response;

  const parsed = SCHEMAS[entity].partial().safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const patch = { ...parsed.data } as Record<string, unknown>;
  delete patch.id;
  if ('tags' in patch) patch.tags = JSON.stringify(patch.tags ?? []);

  const updated = await updateRecord(g.ctx, entity, id, patch);
  if (!updated) return fail('not_found', 404);
  return ok({ item: updated });
}

/** Archive keeps the record and every order that points at it intact. */
export async function DELETE(req: Request, { params }: Params) {
  const { entity, id } = await params;
  if (!isAllowed(entity) || !isEntity(entity)) return fail('unknown_entity', 404);
  const g = await requireCtx(entity === 'customers' ? 'customer.manage' : 'directory.manage');
  if (isDenied(g)) return g.response;

  const url = new URL(req.url);
  if (url.searchParams.get('restore') === '1') {
    const item = await restoreRecord(g.ctx, entity, id, url.searchParams.get('reason'));
    if (!item) return fail('not_found', 404);
    return ok({ item });
  }

  const db = await getDb();
  const column = entity === 'customers' ? 'customerId' : entity === 'makers' ? 'makerId' : entity === 'travelers' ? 'travelerId' : null;
  if (column) {
    const open = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND ${column} = ? AND status NOT IN ('delivered','cancelled')`,
      [g.ctx.ownerId, id],
    );
    if (n(open?.n) > 0) return fail('has_active_orders', 409, { activeOrders: n(open?.n) });
  }

  const archived = await archiveRecord(g.ctx, entity, id, url.searchParams.get('reason'));
  if (!archived) return fail('not_found', 404);
  return ok({ archived: true, id });
}
