import { fail, guard, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { dubaiDate, nowIso } from '@/lib/date';
import { findDuplicates } from '@/lib/calc';
import { addStatusEvent, getOrderView, hydrateOrder, listOrders, recomputeTotals, type OrderFilters } from '@/lib/orders';
import { audit, getSettings, insertRecord, n, newId, nextOrderNumber } from '@/lib/repo';
import { orderCreateSchema } from '@/lib/schemas';

function parseFilters(url: URL): OrderFilters {
  const p = url.searchParams;
  const list = (k: string) => p.getAll(k).flatMap((v) => v.split(',')).filter(Boolean);
  return {
    status: list('status'),
    overdue: p.get('overdue') === '1',
    customerId: p.get('customerId') ?? undefined,
    makerId: p.get('makerId') ?? undefined,
    travelerId: p.get('travelerId') ?? undefined,
    karat: p.get('karat') ?? undefined,
    style: p.get('style') ?? undefined,
    category: p.get('category') ?? undefined,
    destination: p.get('destination') ?? undefined,
    tag: p.get('tag') ?? undefined,
    balance: (p.get('balance') as OrderFilters['balance']) ?? undefined,
    quick: p.get('quick') ?? undefined,
    orderDateFrom: p.get('orderDateFrom') ?? undefined,
    orderDateTo: p.get('orderDateTo') ?? undefined,
    deliveryFrom: p.get('deliveryFrom') ?? undefined,
    deliveryTo: p.get('deliveryTo') ?? undefined,
    search: p.get('q') ?? undefined,
    includeArchived: p.get('archived') === '1',
    sort: p.get('sort') ?? 'priority',
    limit: Number(p.get('limit') ?? 50),
    offset: Number(p.get('offset') ?? 0),
  };
}

export async function GET(req: Request) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const filters = parseFilters(new URL(req.url));
  const { orders, total } = await listOrders(g.ctx.ownerId, filters);
  return ok({ orders, total, offset: filters.offset ?? 0, limit: filters.limit ?? 50 });
}

export async function POST(req: Request) {
  const limited = guard(req, 'order-create', 120, 60_000);
  if (limited) return limited;
  const g = await requireCtx('order.create');
  if (isDenied(g)) return g.response;

  const parsed = orderCreateSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);
  const input = parsed.data;
  const db = await getDb();
  const settings = await getSettings(g.ctx.ownerId);
  const today = dubaiDate();
  const orderDate = input.orderDate ?? today;
  const orderId = input.id ?? newId();

  // An offline replay must land on the row it created the first time.
  const existing = await db.get('SELECT id FROM orders WHERE id = ? AND ownerId = ?', [orderId, g.ctx.ownerId]);
  if (existing) return ok({ order: await getOrderView(g.ctx.ownerId, orderId), duplicates: [] });

  // Customer: reuse the chosen one, otherwise create the inline record.
  let customerId = input.customerId ?? null;
  if (!customerId && input.customer) {
    const row = await insertRecord(g.ctx, 'customers', {
      id: input.customer.id ?? newId(),
      name: input.customer.name,
      phone: input.customer.phone ?? null,
      whatsapp: input.customer.whatsapp ?? input.customer.phone ?? null,
      country: input.customer.country ?? null,
      city: input.customer.city ?? null,
      customerType: input.customer.customerType ?? 'New Customer',
      customerRef: input.customer.customerRef ?? null,
      instagram: input.customer.instagram ?? null,
      email: input.customer.email || null,
      tags: JSON.stringify(input.customer.tags ?? []),
      notes: input.customer.notes ?? null,
      status: 'active',
    });
    customerId = String(row?.id ?? '');
  }
  if (!customerId) return fail('customer_required', 422);

  const customer = await db.get('SELECT id FROM customers WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [customerId, g.ctx.ownerId]);
  if (!customer) return fail('customer_not_found', 404);

  // A near-identical recent order is reported, never blocked.
  const recent = await db.all<{ id: string; orderNumber: string; customerId: string; productName: string; expectedWeightMg: number; orderDate: string }>(
    `SELECT id, orderNumber, customerId, productName, expectedWeightMg, orderDate FROM orders
      WHERE ownerId = ? AND customerId = ? AND deletedAt IS NULL AND status != 'cancelled'
      ORDER BY orderDate DESC LIMIT 40`,
    [g.ctx.ownerId, customerId],
  );
  const duplicates = findDuplicates(
    { customerId, productName: input.productName, expectedWeightMg: input.expectedWeightMg, orderDate },
    recent.map((r) => ({ ...r, expectedWeightMg: n(r.expectedWeightMg) })),
  );
  if (duplicates.length && !input.acknowledgeDuplicate) {
    return fail('possible_duplicate', 409, {
      duplicates: duplicates.map((d) => ({ id: d.id, orderNumber: d.orderNumber, productName: d.productName, orderDate: d.orderDate })),
    });
  }

  const orderNumber = input.orderNumber?.trim() || (await nextOrderNumber(g.ctx, settings, orderDate));
  const status = input.status ?? 'ordered';
  const t = nowIso();

  await db.run(
    `INSERT INTO orders (
      id, ownerId, orderNumber, referenceNo, customerId, category, productName, style, karat,
      expectedWeightMg, minimumWeightMg, maximumWeightMg, actualWeightMg,
      goldRateFilsPerGram, goldRateMode, goldValueOverrideFils, makingChargeMode, makingChargeFils,
      otherChargesFils, discountFils, vatBp, totalAmountFils, totalPaidFils, remainingBalanceFils,
      makerId, makerReference, makerCostFils, makerNotes, sentToMakerDate,
      travelerId, travelerShipmentId, destination,
      orderDate, expectedReadyDate, readyDate, expectedDeliveryDate, arrivalDate, deliveredDate,
      qualityCheck, receivedBy, deliveryMethod, cancelReason, cancelNote,
      status, coverMediaId, notes, tags, createdAt, updatedAt, createdBy, createdByName
    ) VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?, ?,?,?,?,?, ?,?,?,0,0,0, ?,?,?,?,?, ?,NULL,?, ?,?,NULL,?,NULL,NULL, NULL,NULL,NULL,NULL,NULL, ?,?,?,?,?,?,?,?)`,
    [
      orderId, g.ctx.ownerId, orderNumber, input.referenceNo ?? null, customerId, input.category, input.productName,
      input.style ?? null, input.karat,
      input.expectedWeightMg, input.minimumWeightMg ?? null, input.maximumWeightMg ?? null, input.actualWeightMg ?? null,
      input.goldRateFilsPerGram, input.goldRateMode, input.goldValueOverrideFils ?? null, input.makingChargeMode, input.makingChargeFils,
      input.otherChargesFils, input.discountFils, input.vatBp,
      input.makerId ?? null, input.makerReference ?? null, input.makerCostFils, input.makerNotes ?? null, input.sentToMakerDate ?? null,
      input.travelerId ?? null, input.destination ?? null,
      orderDate, input.expectedReadyDate ?? null, input.expectedDeliveryDate ?? null,
      status, input.coverMediaId ?? null, input.notes ?? null, JSON.stringify(input.tags ?? []),
      t, t, g.ctx.userId, g.ctx.actor,
    ],
  );

  if (input.mediaIds?.length) {
    for (const mediaId of input.mediaIds) {
      await db.run('UPDATE order_media SET orderId = ?, updatedAt = ? WHERE id = ? AND ownerId = ?', [orderId, t, mediaId, g.ctx.ownerId]);
    }
    if (!input.coverMediaId) {
      await db.run('UPDATE orders SET coverMediaId = ? WHERE id = ? AND ownerId = ?', [input.mediaIds[0], orderId, g.ctx.ownerId]);
    }
  }

  // A deposit typed on the create screen becomes a real payment row, not a field.
  if (input.depositFils && input.depositFils > 0) {
    await db.run(
      `INSERT INTO payments (id, ownerId, orderId, amountFils, paidOn, paidAt, method, reference, note, mediaId, createdByName, status, createdAt, updatedAt, createdBy)
       VALUES (?,?,?,?,?,?,?,NULL,'Deposit at order creation',NULL,?,'active',?,?,?)`,
      [newId(), g.ctx.ownerId, orderId, input.depositFils, orderDate, t, input.depositMethod || 'Cash', g.ctx.actor, t, t, g.ctx.userId],
    );
  }

  const row = await db.get('SELECT * FROM orders WHERE id = ? AND ownerId = ?', [orderId, g.ctx.ownerId]);
  await audit(g.ctx, 'orders', orderId, 'create', null, row ? hydrateOrder(row) : { orderNumber });
  await addStatusEvent(g.ctx, orderId, { fromStatus: null, toStatus: status, note: null, detail: { orderNumber } });
  await recomputeTotals(g.ctx, orderId);

  return ok({ order: await getOrderView(g.ctx.ownerId, orderId), duplicates: [] });
}
