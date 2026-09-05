import 'server-only';
import { getDb } from './db';
import { audit, getSettings, n, nOrNull, newId, safeJson, type Ctx } from './repo';
import { dubaiDate, nowIso } from './date';
import { balanceOf, compareWeight, comparePriority, priceOrder, progressPercent, urgencyOf } from './calc';
import type { GoldExchange, Order, OrderMedia, OrderNote, OrderStatus, OrderView, Payment, StatusEvent } from './types';

/* ------------------------------------------------------------- hydration */

type Row = Record<string, unknown>;

export function hydrateOrder(r: Row): Order {
  return {
    ...(r as unknown as Order),
    expectedWeightMg: n(r.expectedWeightMg),
    minimumWeightMg: nOrNull(r.minimumWeightMg),
    maximumWeightMg: nOrNull(r.maximumWeightMg),
    actualWeightMg: nOrNull(r.actualWeightMg),
    goldRateFilsPerGram: n(r.goldRateFilsPerGram),
    goldValueOverrideFils: nOrNull(r.goldValueOverrideFils),
    makingChargeFils: n(r.makingChargeFils),
    otherChargesFils: n(r.otherChargesFils),
    discountFils: n(r.discountFils),
    vatBp: n(r.vatBp),
    totalAmountFils: n(r.totalAmountFils),
    totalPaidFils: n(r.totalPaidFils),
    remainingBalanceFils: n(r.remainingBalanceFils),
    makerCostFils: n(r.makerCostFils),
    tags: safeJson<string[]>(r.tags as string, []),
  };
}

export function hydratePayment(r: Row): Payment {
  return { ...(r as unknown as Payment), amountFils: n(r.amountFils) };
}

export function hydrateExchange(r: Row): GoldExchange {
  return {
    ...(r as unknown as GoldExchange),
    weightMg: n(r.weightMg),
    rateFilsPerGram: n(r.rateFilsPerGram),
    valueFils: n(r.valueFils),
  };
}

export function hydrateEvent(r: Row): StatusEvent {
  return { ...(r as unknown as StatusEvent), detail: safeJson<Record<string, unknown> | null>(r.detail as string, null) };
}

/** Attaches the computed fields every list and card needs. */
export function decorate(
  o: Order,
  extra: {
    customerName: string;
    customerPhone?: string | null;
    customerWhatsapp?: string | null;
    makerName?: string | null;
    travelerName?: string | null;
    toleranceMg?: number;
  },
  today = dubaiDate(),
): OrderView {
  const u = urgencyOf(o.status, o.expectedDeliveryDate, today);
  const bal = balanceOf(o.totalAmountFils, [{ amountFils: o.totalPaidFils }], []);
  const weight =
    o.actualWeightMg === null
      ? null
      : compareWeight(o.expectedWeightMg, o.actualWeightMg, {
          minimumMg: o.minimumWeightMg,
          maximumMg: o.maximumWeightMg,
          toleranceMg: extra.toleranceMg,
        });
  return {
    ...o,
    customerName: extra.customerName,
    customerPhone: extra.customerPhone ?? null,
    customerWhatsapp: extra.customerWhatsapp ?? null,
    makerName: extra.makerName ?? null,
    travelerName: extra.travelerName ?? null,
    urgency: u.urgency,
    daysLate: u.daysLate,
    daysRemaining: u.daysRemaining,
    priority: u.priority,
    isOverdue: u.isOverdue,
    progressPercent: progressPercent(o.status),
    balanceStatus: bal.status,
    weightDifferenceMg: weight ? weight.differenceMg : null,
    weightVerdict: weight ? weight.verdict : null,
  };
}

/* ------------------------------------------------------------------ totals */

/**
 * Recomputes the money on an order from its own fields plus its live payment and
 * exchange rows, then persists the three cached totals the lists read.
 * Called after every write that can move a number.
 */
export async function recomputeTotals(ctx: Ctx, orderId: string): Promise<Order | null> {
  const db = await getDb();
  const raw = await db.get<Row>('SELECT * FROM orders WHERE id = ? AND ownerId = ?', [orderId, ctx.ownerId]);
  if (!raw) return null;
  const o = hydrateOrder(raw);

  const [payRows, exRows] = await Promise.all([
    db.all<Row>('SELECT amountFils FROM payments WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL', [ctx.ownerId, orderId]),
    db.all<Row>('SELECT valueFils FROM gold_exchanges WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL', [ctx.ownerId, orderId]),
  ]);

  const pricing = priceOrder(o);
  const bal = balanceOf(
    pricing.totalFils,
    payRows.map((p) => ({ amountFils: n(p.amountFils) })),
    exRows.map((e) => ({ valueFils: n(e.valueFils) })),
  );

  await db.run(
    'UPDATE orders SET totalAmountFils = ?, totalPaidFils = ?, remainingBalanceFils = ?, updatedAt = ? WHERE id = ? AND ownerId = ?',
    [pricing.totalFils, bal.totalPaidFils, bal.remainingFils, nowIso(), orderId, ctx.ownerId],
  );

  return {
    ...o,
    totalAmountFils: pricing.totalFils,
    totalPaidFils: bal.totalPaidFils,
    remainingBalanceFils: bal.remainingFils,
  };
}

/* --------------------------------------------------------------- timeline */

export async function addStatusEvent(
  ctx: Ctx,
  orderId: string,
  event: {
    fromStatus: string | null;
    toStatus: string;
    note?: string | null;
    mediaId?: string | null;
    detail?: Record<string, unknown> | null;
    occurredAt?: string;
  },
): Promise<void> {
  const db = await getDb();
  const t = nowIso();
  const id = newId();
  await db.run(
    `INSERT INTO order_status_history
      (id, ownerId, orderId, fromStatus, toStatus, note, mediaId, detail, actor, occurredAt, status, createdAt, updatedAt, createdBy)
     VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?,?)`,
    [
      id,
      ctx.ownerId,
      orderId,
      event.fromStatus,
      event.toStatus,
      event.note ?? null,
      event.mediaId ?? null,
      event.detail ? JSON.stringify(event.detail) : null,
      ctx.actor,
      event.occurredAt ?? t,
      t,
      t,
      ctx.userId,
    ],
  );
}

export async function listTimeline(ownerId: string, orderId: string): Promise<StatusEvent[]> {
  const db = await getDb();
  const rows = await db.all<Row>(
    'SELECT * FROM order_status_history WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY occurredAt ASC, createdAt ASC',
    [ownerId, orderId],
  );
  return rows.map(hydrateEvent);
}

/* ------------------------------------------------------------------- read */

export interface OrderFilters {
  status?: string[];
  overdue?: boolean;
  customerId?: string;
  makerId?: string;
  travelerId?: string;
  karat?: string;
  style?: string;
  category?: string;
  destination?: string;
  tag?: string;
  balance?: 'due' | 'paid' | 'partial' | 'unpaid';
  quick?: string;
  orderDateFrom?: string;
  orderDateTo?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  search?: string;
  includeArchived?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
}

interface JoinedRow extends Row {
  customerName: string;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  makerName: string | null;
  travelerName: string | null;
}

const BASE_SELECT = `
  SELECT o.*,
         c.name AS customerName, c.phone AS customerPhone, c.whatsapp AS customerWhatsapp,
         m.name AS makerName, tr.name AS travelerName
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
    LEFT JOIN makers m ON m.id = o.makerId AND m.ownerId = o.ownerId
    LEFT JOIN travelers tr ON tr.id = o.travelerId AND tr.ownerId = o.ownerId`;

/**
 * Filtering and paging happen in SQL; the urgency ordering happens in memory on
 * the page that was fetched, because "overdue" depends on today's Dubai date.
 * Priority sorting therefore pre-filters to open orders in SQL first.
 */
export async function listOrders(
  ownerId: string,
  filters: OrderFilters = {},
): Promise<{ orders: OrderView[]; total: number }> {
  const db = await getDb();
  const today = dubaiDate();
  const settings = await getSettings(ownerId);
  const where: string[] = ['o.ownerId = ?'];
  const params: unknown[] = [ownerId];

  if (!filters.includeArchived) where.push('o.deletedAt IS NULL');

  const quick = filters.quick;
  const statuses = new Set(filters.status ?? []);
  if (quick === 'maker') statuses.add('maker');
  if (quick === 'ready') statuses.add('ready');
  if (quick === 'traveler') statuses.add('traveler');
  if (quick === 'arrived') statuses.add('arrived');
  if (quick === 'delivered') statuses.add('delivered');
  if (statuses.size) {
    where.push(`o.status IN (${[...statuses].map(() => '?').join(',')})`);
    params.push(...statuses);
  }

  const openOnly = () => where.push(`o.status NOT IN ('delivered','cancelled')`);
  if (filters.overdue || quick === 'overdue') {
    openOnly();
    where.push('o.expectedDeliveryDate IS NOT NULL AND o.expectedDeliveryDate < ?');
    params.push(today);
  }
  if (quick === 'today') {
    openOnly();
    where.push('o.expectedDeliveryDate = ?');
    params.push(today);
  }
  if (quick === 'tomorrow') {
    openOnly();
    where.push("o.expectedDeliveryDate = date(?, '+1 day')");
    params.push(today);
  }
  if (quick === 'active') openOnly();
  if (quick === 'balance' || filters.balance === 'due') where.push('o.remainingBalanceFils > 0');
  if (filters.balance === 'paid') where.push('o.remainingBalanceFils = 0 AND o.totalPaidFils > 0');
  if (filters.balance === 'partial') where.push('o.remainingBalanceFils > 0 AND o.totalPaidFils > 0');
  if (filters.balance === 'unpaid') where.push('o.totalPaidFils = 0');

  const eq = (col: string, v: string | undefined) => {
    if (!v) return;
    where.push(`${col} = ?`);
    params.push(v);
  };
  eq('o.customerId', filters.customerId);
  eq('o.makerId', filters.makerId);
  eq('o.travelerId', filters.travelerId);
  eq('o.karat', filters.karat);
  eq('o.style', filters.style);
  eq('o.category', filters.category);
  eq('o.destination', filters.destination);

  if (filters.tag) {
    where.push('o.tags LIKE ?');
    params.push(`%"${filters.tag}"%`);
  }
  if (filters.orderDateFrom) { where.push('o.orderDate >= ?'); params.push(filters.orderDateFrom); }
  if (filters.orderDateTo) { where.push('o.orderDate <= ?'); params.push(filters.orderDateTo); }
  if (filters.deliveryFrom) { where.push('o.expectedDeliveryDate >= ?'); params.push(filters.deliveryFrom); }
  if (filters.deliveryTo) { where.push('o.expectedDeliveryDate <= ?'); params.push(filters.deliveryTo); }

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim().toLowerCase()}%`;
    where.push(`(
      LOWER(o.orderNumber) LIKE ? OR LOWER(COALESCE(o.referenceNo,'')) LIKE ? OR
      LOWER(o.productName) LIKE ? OR LOWER(COALESCE(o.destination,'')) LIKE ? OR
      LOWER(COALESCE(o.notes,'')) LIKE ? OR LOWER(COALESCE(o.tags,'')) LIKE ? OR
      LOWER(COALESCE(c.name,'')) LIKE ? OR LOWER(COALESCE(c.phone,'')) LIKE ? OR
      LOWER(COALESCE(c.whatsapp,'')) LIKE ? OR LOWER(COALESCE(m.name,'')) LIKE ? OR
      LOWER(COALESCE(tr.name,'')) LIKE ?
    )`);
    params.push(...Array(11).fill(q));
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRow = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM orders o
       LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
       LEFT JOIN makers m ON m.id = o.makerId AND m.ownerId = o.ownerId
       LEFT JOIN travelers tr ON tr.id = o.travelerId AND tr.ownerId = o.ownerId
     ${whereSql}`,
    params,
  );
  const total = n(countRow?.n);

  const sort = filters.sort ?? 'priority';
  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  const SQL_SORTS: Record<string, string> = {
    newest: 'o.createdAt DESC',
    oldest: 'o.createdAt ASC',
    delivery: 'o.expectedDeliveryDate IS NULL, o.expectedDeliveryDate ASC',
    weight_desc: 'COALESCE(o.actualWeightMg, o.expectedWeightMg) DESC',
    weight_asc: 'COALESCE(o.actualWeightMg, o.expectedWeightMg) ASC',
    balance: 'o.remainingBalanceFils DESC',
    customer: 'c.name COLLATE NOCASE ASC',
  };

  // Priority ordering is expressed in SQL first so paging stays correct, then
  // refined in memory where the exact urgency band is computed.
  const prioritySql = `
    CASE
      WHEN o.status = 'cancelled' THEN 900
      WHEN o.status = 'delivered' THEN 800
      WHEN o.expectedDeliveryDate IS NULL THEN 600
      WHEN julianday(?) - julianday(o.expectedDeliveryDate) > 7 THEN 0
      WHEN julianday(?) - julianday(o.expectedDeliveryDate) >= 3 THEN 100
      WHEN julianday(?) - julianday(o.expectedDeliveryDate) >= 1 THEN 200
      WHEN o.expectedDeliveryDate = ? THEN 300
      WHEN julianday(o.expectedDeliveryDate) - julianday(?) = 1 THEN 400
      ELSE 500
    END ASC, o.expectedDeliveryDate IS NULL, o.expectedDeliveryDate ASC, o.createdAt DESC`;

  const orderParams = sort === 'priority' ? [today, today, today, today, today] : [];
  const orderSql = sort === 'priority' ? prioritySql : SQL_SORTS[sort] ?? SQL_SORTS.newest;

  const rows = await db.all<JoinedRow>(
    `${BASE_SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...params, ...orderParams, limit, offset],
  );

  const orders = rows.map((r) =>
    decorate(hydrateOrder(r), {
      customerName: r.customerName ?? 'Unknown customer',
      customerPhone: r.customerPhone,
      customerWhatsapp: r.customerWhatsapp,
      makerName: r.makerName,
      travelerName: r.travelerName,
      toleranceMg: settings.defaultToleranceMg,
    }, today),
  );

  if (sort === 'priority') orders.sort(comparePriority);
  return { orders, total };
}

export async function getOrderView(ownerId: string, id: string): Promise<OrderView | null> {
  const db = await getDb();
  const settings = await getSettings(ownerId);
  const row = await db.get<JoinedRow>(`${BASE_SELECT} WHERE o.ownerId = ? AND o.id = ?`, [ownerId, id]);
  if (!row) return null;
  return decorate(hydrateOrder(row), {
    customerName: row.customerName ?? 'Unknown customer',
    customerPhone: row.customerPhone,
    customerWhatsapp: row.customerWhatsapp,
    makerName: row.makerName,
    travelerName: row.travelerName,
    toleranceMg: settings.defaultToleranceMg,
  });
}

export interface OrderBundle {
  order: OrderView;
  customer: Row | null;
  maker: Row | null;
  traveler: Row | null;
  shipment: Row | null;
  payments: Payment[];
  exchanges: GoldExchange[];
  notes: OrderNote[];
  media: OrderMedia[];
  timeline: StatusEvent[];
  audit: Row[];
}

/** Everything the order detail page renders, in one round trip. */
export async function getOrderBundle(ownerId: string, id: string): Promise<OrderBundle | null> {
  const db = await getDb();
  const order = await getOrderView(ownerId, id);
  if (!order) return null;

  const [customer, maker, traveler, shipment, payments, exchanges, notes, media, timeline, auditRows] = await Promise.all([
    db.get<Row>('SELECT * FROM customers WHERE ownerId = ? AND id = ?', [ownerId, order.customerId]),
    order.makerId ? db.get<Row>('SELECT * FROM makers WHERE ownerId = ? AND id = ?', [ownerId, order.makerId]) : null,
    order.travelerId ? db.get<Row>('SELECT * FROM travelers WHERE ownerId = ? AND id = ?', [ownerId, order.travelerId]) : null,
    order.travelerShipmentId
      ? db.get<Row>('SELECT * FROM traveler_shipments WHERE ownerId = ? AND id = ?', [ownerId, order.travelerShipmentId])
      : null,
    db.all<Row>('SELECT * FROM payments WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY paidOn ASC, createdAt ASC', [ownerId, id]),
    db.all<Row>('SELECT * FROM gold_exchanges WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY receivedOn ASC', [ownerId, id]),
    db.all<Row>('SELECT * FROM order_notes WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY pinned DESC, createdAt DESC', [ownerId, id]),
    db.all<Row>(
      'SELECT id, orderId, name, mime, size, kind, category, thumb, status, createdAt, updatedAt FROM order_media WHERE ownerId = ? AND orderId = ? AND deletedAt IS NULL ORDER BY createdAt ASC',
      [ownerId, id],
    ),
    listTimeline(ownerId, id),
    db.all<Row>('SELECT * FROM audit_logs WHERE ownerId = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 100', [ownerId, id]),
  ]);

  return {
    order,
    customer,
    maker,
    traveler,
    shipment,
    payments: payments.map(hydratePayment),
    exchanges: exchanges.map(hydrateExchange),
    notes: notes as unknown as OrderNote[],
    media: media as unknown as OrderMedia[],
    timeline,
    audit: auditRows,
  };
}

/* ------------------------------------------------------------ transitions */

export interface StatusChangeInput {
  toStatus: OrderStatus;
  note?: string | null;
  mediaId?: string | null;
  occurredAt?: string;
  /** Status-specific fields, all optional; only the ones that apply are stored. */
  makerId?: string | null;
  makerReference?: string | null;
  makerCostFils?: number | null;
  makerNotes?: string | null;
  sentToMakerDate?: string | null;
  expectedReadyDate?: string | null;

  actualWeightMg?: number | null;
  readyDate?: string | null;
  qualityCheck?: string | null;

  travelerId?: string | null;
  shipmentId?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  expectedArrival?: string | null;
  flightNumber?: string | null;
  airline?: string | null;
  packageRef?: string | null;

  arrivalDate?: string | null;
  arrivalTime?: string | null;
  receivedBy?: string | null;

  deliveredDate?: string | null;
  deliveredTime?: string | null;
  deliveryMethod?: string | null;
  finalPaymentFils?: number | null;
  finalPaymentMethod?: string | null;
  acknowledgeBalance?: boolean;

  cancelReason?: string | null;
  cancelNote?: string | null;
}

export class StatusError extends Error {
  code: string;
  extra: Record<string, unknown>;
  constructor(code: string, extra: Record<string, unknown> = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

/**
 * Applies a status change and writes the timeline event. Previous history is
 * never rewritten — going back to the maker after Ready appends a new event and
 * leaves the Ready event standing.
 */
export async function changeStatus(ctx: Ctx, orderId: string, input: StatusChangeInput): Promise<OrderView> {
  const db = await getDb();
  const raw = await db.get<Row>('SELECT * FROM orders WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [orderId, ctx.ownerId]);
  if (!raw) throw new StatusError('order_not_found');
  const before = hydrateOrder(raw);
  const to = input.toStatus;
  const today = dubaiDate();
  const patch: Record<string, unknown> = { status: to };
  const detail: Record<string, unknown> = {};

  if (to === 'cancelled') {
    if (!input.cancelReason) throw new StatusError('cancel_reason_required');
    patch.cancelReason = input.cancelReason;
    patch.cancelNote = input.cancelNote ?? null;
    detail.reason = input.cancelReason;
  }

  if (to === 'maker') {
    if (input.makerId !== undefined) patch.makerId = input.makerId;
    if (!patch.makerId && !before.makerId) throw new StatusError('maker_required');
    patch.sentToMakerDate = input.sentToMakerDate ?? before.sentToMakerDate ?? today;
    if (input.expectedReadyDate !== undefined) patch.expectedReadyDate = input.expectedReadyDate;
    if (input.makerReference !== undefined) patch.makerReference = input.makerReference;
    if (input.makerCostFils !== undefined && input.makerCostFils !== null) patch.makerCostFils = input.makerCostFils;
    if (input.makerNotes !== undefined) patch.makerNotes = input.makerNotes;
    detail.makerId = patch.makerId ?? before.makerId;
    detail.expectedReadyDate = patch.expectedReadyDate ?? before.expectedReadyDate;
    // Coming back from Ready is a return, not a fresh dispatch.
    if (before.status === 'ready') detail.returnedToMaker = true;
  }

  if (to === 'ready') {
    if (input.actualWeightMg !== undefined && input.actualWeightMg !== null) patch.actualWeightMg = input.actualWeightMg;
    if (patch.actualWeightMg === undefined && before.actualWeightMg === null) throw new StatusError('actual_weight_required');
    patch.readyDate = input.readyDate ?? today;
    if (input.makerCostFils !== undefined && input.makerCostFils !== null) patch.makerCostFils = input.makerCostFils;
    if (input.qualityCheck !== undefined) patch.qualityCheck = input.qualityCheck;
    detail.actualWeightMg = patch.actualWeightMg ?? before.actualWeightMg;
    detail.qualityCheck = patch.qualityCheck ?? before.qualityCheck;
  }

  if (to === 'traveler') {
    const travelerId = input.travelerId ?? before.travelerId;
    if (!travelerId) throw new StatusError('traveler_required');
    patch.travelerId = travelerId;
    const destination = input.destination ?? before.destination;
    patch.destination = destination;

    // One shipment row per traveler + destination + departure, shared by orders.
    let shipmentId = input.shipmentId ?? null;
    if (!shipmentId) {
      const existing = await db.get<Row>(
        `SELECT id FROM traveler_shipments
          WHERE ownerId = ? AND travelerId = ? AND destination = ? AND COALESCE(departureDate,'') = ?
            AND arrivedAt IS NULL AND deletedAt IS NULL`,
        [ctx.ownerId, travelerId, destination ?? '', input.departureDate ?? ''],
      );
      if (existing) {
        shipmentId = String(existing.id);
      } else {
        shipmentId = newId();
        const t = nowIso();
        await db.run(
          `INSERT INTO traveler_shipments
            (id, ownerId, travelerId, destination, departureDate, expectedArrival, arrivedAt, flightNumber, airline, packageRef, notes, status, createdAt, updatedAt, createdBy)
           VALUES (?,?,?,?,?,?,NULL,?,?,?,?, 'active',?,?,?)`,
          [
            shipmentId,
            ctx.ownerId,
            travelerId,
            destination ?? '',
            input.departureDate ?? null,
            input.expectedArrival ?? null,
            input.flightNumber ?? null,
            input.airline ?? null,
            input.packageRef ?? null,
            input.note ?? null,
            t,
            t,
            ctx.userId,
          ],
        );
        await audit(ctx, 'traveler_shipments', shipmentId, 'create', null, { travelerId, destination });
      }
    }
    patch.travelerShipmentId = shipmentId;
    detail.travelerId = travelerId;
    detail.destination = destination;
    detail.departureDate = input.departureDate ?? null;
    detail.flightNumber = input.flightNumber ?? null;
  }

  if (to === 'arrived') {
    patch.arrivalDate = input.arrivalDate ?? today;
    if (input.destination !== undefined && input.destination !== null) patch.destination = input.destination;
    if (input.receivedBy !== undefined) patch.receivedBy = input.receivedBy;
    detail.arrivalDate = patch.arrivalDate;
    detail.arrivalTime = input.arrivalTime ?? null;
    detail.destination = patch.destination ?? before.destination;
    if (before.travelerShipmentId) {
      await db.run('UPDATE traveler_shipments SET arrivedAt = ?, updatedAt = ? WHERE id = ? AND ownerId = ? AND arrivedAt IS NULL', [
        String(patch.arrivalDate),
        nowIso(),
        before.travelerShipmentId,
        ctx.ownerId,
      ]);
    }
  }

  if (to === 'delivered') {
    // A final payment recorded on the delivery screen is a real payment row.
    if (input.finalPaymentFils && input.finalPaymentFils > 0) {
      const t = nowIso();
      await db.run(
        `INSERT INTO payments (id, ownerId, orderId, amountFils, paidOn, paidAt, method, reference, note, mediaId, createdByName, status, createdAt, updatedAt, createdBy)
         VALUES (?,?,?,?,?,?,?,NULL,'Final payment on delivery',NULL,?,'active',?,?,?)`,
        [
          newId(),
          ctx.ownerId,
          orderId,
          input.finalPaymentFils,
          input.deliveredDate ?? today,
          t,
          input.finalPaymentMethod ?? 'Cash',
          ctx.actor,
          t,
          t,
          ctx.userId,
        ],
      );
    }
    const fresh = await recomputeTotals(ctx, orderId);
    const remaining = fresh?.remainingBalanceFils ?? before.remainingBalanceFils;
    if (remaining > 0 && !input.acknowledgeBalance) {
      throw new StatusError('balance_outstanding', { remainingBalanceFils: remaining });
    }
    patch.deliveredDate = input.deliveredDate ?? today;
    if (input.receivedBy !== undefined) patch.receivedBy = input.receivedBy;
    if (input.deliveryMethod !== undefined) patch.deliveryMethod = input.deliveryMethod;
    detail.deliveredDate = patch.deliveredDate;
    detail.deliveredTime = input.deliveredTime ?? null;
    detail.receivedBy = patch.receivedBy ?? before.receivedBy;
    detail.deliveryMethod = patch.deliveryMethod ?? before.deliveryMethod;
    detail.remainingBalanceFils = remaining;
  }

  if (to === 'ordered' && before.status === 'cancelled') {
    patch.cancelReason = null;
    patch.cancelNote = null;
  }

  const keys = Object.keys(patch);
  await db.run(
    `UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updatedAt = ? WHERE id = ? AND ownerId = ?`,
    [...keys.map((k) => patch[k] ?? null), nowIso(), orderId, ctx.ownerId],
  );

  await addStatusEvent(ctx, orderId, {
    fromStatus: before.status,
    toStatus: to,
    note: input.note ?? null,
    mediaId: input.mediaId ?? null,
    detail: Object.keys(detail).length ? detail : null,
    occurredAt: input.occurredAt,
  });
  await audit(ctx, 'orders', orderId, 'status_change', { status: before.status }, { status: to, ...detail });

  // Weight or maker cost may have moved, so the money is rebuilt either way.
  await recomputeTotals(ctx, orderId);
  const view = await getOrderView(ctx.ownerId, orderId);
  if (!view) throw new StatusError('order_not_found');
  return view;
}
