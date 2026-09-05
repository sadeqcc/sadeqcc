import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { insertRecord, isEntity, listActive, newId, n } from '@/lib/repo';
import { customerSchema, makerSchema, shipmentSchema, tagSchema, travelerSchema } from '@/lib/schemas';
import { safeJson } from '@/lib/repo';

type Params = { params: Promise<{ entity: string }> };

const SCHEMAS = {
  customers: customerSchema,
  makers: makerSchema,
  travelers: travelerSchema,
  tags: tagSchema,
  traveler_shipments: shipmentSchema,
} as const;

type Allowed = keyof typeof SCHEMAS;
const isAllowed = (s: string): s is Allowed => Object.prototype.hasOwnProperty.call(SCHEMAS, s);

/**
 * Customers, makers, travelers, tags and shipments share one shape, so they
 * share one endpoint. Each list is returned with the roll-ups its page shows.
 */
export async function GET(req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { entity } = await params;
  if (!isAllowed(entity) || !isEntity(entity)) return fail('unknown_entity', 404);

  const url = new URL(req.url);
  const includeArchived = url.searchParams.get('archived') === '1';
  const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const db = await getDb();

  let rows = await listActive<Record<string, unknown>>(g.ctx.ownerId, entity, {
    orderBy: entity === 'traveler_shipments' ? 'departureDate DESC' : 'name COLLATE NOCASE ASC',
    includeArchived,
  });

  if (search) {
    rows = rows.filter((r) =>
      ['name', 'phone', 'whatsapp', 'company', 'destination', 'city', 'country', 'customerRef']
        .some((k) => String(r[k] ?? '').toLowerCase().includes(search)),
    );
  }

  if (entity === 'customers') {
    const stats = await db.all<{ customerId: string; total: number; active: number; delivered: number; purchases: number; outstanding: number }>(
      `SELECT customerId,
              COUNT(*) AS total,
              SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
              SUM(CASE WHEN status != 'cancelled' THEN totalAmountFils ELSE 0 END) AS purchases,
              SUM(CASE WHEN status != 'cancelled' THEN remainingBalanceFils ELSE 0 END) AS outstanding
         FROM orders WHERE ownerId = ? AND deletedAt IS NULL GROUP BY customerId`,
      [g.ctx.ownerId],
    );
    const byId = new Map(stats.map((s) => [s.customerId, s]));
    rows = rows.map((r) => {
      const s = byId.get(String(r.id));
      return {
        ...r,
        tags: safeJson<string[]>(r.tags as string, []),
        totalOrders: n(s?.total),
        activeOrders: n(s?.active),
        deliveredOrders: n(s?.delivered),
        totalPurchasesFils: n(s?.purchases),
        outstandingFils: n(s?.outstanding),
      };
    });
  }

  if (entity === 'makers') {
    const stats = await db.all<{ makerId: string; active: number; ready: number; late: number; weight: number; cost: number }>(
      `SELECT makerId,
              SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS active,
              SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready,
              SUM(CASE WHEN status = 'maker' AND expectedReadyDate IS NOT NULL AND expectedReadyDate < date('now') THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN COALESCE(actualWeightMg, expectedWeightMg) ELSE 0 END) AS weight,
              SUM(makerCostFils) AS cost
         FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND makerId IS NOT NULL GROUP BY makerId`,
      [g.ctx.ownerId],
    );
    const byId = new Map(stats.map((s) => [s.makerId, s]));
    rows = rows.map((r) => {
      const s = byId.get(String(r.id));
      return {
        ...r,
        activeOrders: n(s?.active),
        readyOrders: n(s?.ready),
        lateOrders: n(s?.late),
        expectedWeightMg: n(s?.weight),
        totalCostFils: n(s?.cost),
      };
    });
  }

  if (entity === 'travelers') {
    const stats = await db.all<{ travelerId: string; current: number; weight: number }>(
      `SELECT travelerId,
              SUM(CASE WHEN status IN ('traveler','arrived') THEN 1 ELSE 0 END) AS current,
              SUM(CASE WHEN status IN ('traveler','arrived') THEN COALESCE(actualWeightMg, expectedWeightMg) ELSE 0 END) AS weight
         FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND travelerId IS NOT NULL GROUP BY travelerId`,
      [g.ctx.ownerId],
    );
    const byId = new Map(stats.map((s) => [s.travelerId, s]));
    rows = rows.map((r) => {
      const s = byId.get(String(r.id));
      return { ...r, currentOrders: n(s?.current), currentWeightMg: n(s?.weight) };
    });
  }

  return ok({ items: rows });
}

export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx(undefined);
  if (isDenied(g)) return g.response;
  const { entity } = await params;
  if (!isAllowed(entity) || !isEntity(entity)) return fail('unknown_entity', 404);

  const needed = entity === 'customers' ? 'customer.manage' : 'directory.manage';
  const guarded = await requireCtx(needed);
  if (isDenied(guarded)) return guarded.response;

  const parsed = SCHEMAS[entity].safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const data = { ...parsed.data } as Record<string, unknown>;
  data.id = (data.id as string) ?? newId();
  data.status = 'active';
  if ('tags' in data) data.tags = JSON.stringify(data.tags ?? []);
  if ('email' in data && !data.email) data.email = null;

  const row = await insertRecord(guarded.ctx, entity, data);
  return ok({ item: row });
}
