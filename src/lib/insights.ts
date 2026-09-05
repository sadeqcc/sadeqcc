import 'server-only';
import { getDb } from './db';
import { getSettings, n, safeJson } from './repo';
import { addDays, diffDays, dubaiDate } from './date';
import { comparePriority, urgencyOf } from './calc';
import { decorate, hydrateOrder } from './orders';
import { accountsByCustomer } from './customers';
import type { OrderStatus, OrderView, Urgency } from './types';

type Row = Record<string, unknown>;

const OPEN = `o.status NOT IN ('delivered','cancelled') AND o.deletedAt IS NULL`;

const JOINED = `
  SELECT o.*, c.name AS customerName, c.phone AS customerPhone, c.whatsapp AS customerWhatsapp,
         m.name AS makerName, tr.name AS travelerName
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
    LEFT JOIN makers m ON m.id = o.makerId AND m.ownerId = o.ownerId
    LEFT JOIN travelers tr ON tr.id = o.travelerId AND tr.ownerId = o.ownerId`;

interface JoinRow extends Row {
  customerName: string | null;
  customerPhone: string | null;
  customerWhatsapp: string | null;
  makerName: string | null;
  travelerName: string | null;
}

function toView(rows: JoinRow[], toleranceMg: number, today: string): OrderView[] {
  return rows.map((r) =>
    decorate(
      hydrateOrder(r),
      {
        customerName: r.customerName ?? 'Unknown customer',
        customerPhone: r.customerPhone,
        customerWhatsapp: r.customerWhatsapp,
        makerName: r.makerName,
        travelerName: r.travelerName,
        toleranceMg,
      },
      today,
    ),
  );
}

/* ------------------------------------------------------------- dashboard */

export interface DashboardCards {
  activeOrders: number;
  overdue: number;
  ready: number;
  withTravelers: number;
  arrived: number;
  withMakers: number;
  deliveredToday: number;
  dueToday: number;
  dueTomorrow: number;
  outstandingBalanceFils: number;
  expectedGoldMg: number;
}

export interface ActivityItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  text: string;
  icon: string;
  at: string;
}

export interface Dashboard {
  today: string;
  cards: DashboardCards;
  urgent: OrderView[];
  dueTodayOrders: OrderView[];
  activity: ActivityItem[];
  notifications: Notification[];
  followUps: FollowUpItem[];
}

export async function buildDashboard(ownerId: string): Promise<Dashboard> {
  const db = await getDb();
  const today = dubaiDate();
  const tomorrow = addDays(today, 1);
  const settings = await getSettings(ownerId);

  const [accounts, counts, balanceRow, weightRow, deliveredTodayRow, openRows, activityRows] = await Promise.all([
    accountsByCustomer(ownerId),
    db.all<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM orders WHERE ownerId = ? AND deletedAt IS NULL GROUP BY status`,
      [ownerId],
    ),
    db.get<{ v: number }>(
      `SELECT COALESCE(SUM(remainingBalanceFils),0) AS v FROM orders o WHERE o.ownerId = ? AND ${OPEN}`,
      [ownerId],
    ),
    db.get<{ v: number }>(
      `SELECT COALESCE(SUM(COALESCE(actualWeightMg, expectedWeightMg)),0) AS v FROM orders o WHERE o.ownerId = ? AND ${OPEN}`,
      [ownerId],
    ),
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND status = 'delivered' AND deliveredDate = ?`,
      [ownerId, today],
    ),
    db.all<JoinRow>(`${JOINED} WHERE o.ownerId = ? AND ${OPEN} ORDER BY o.expectedDeliveryDate IS NULL, o.expectedDeliveryDate ASC LIMIT 500`, [ownerId]),
    db.all<Row>(
      `SELECT h.*, o.orderNumber, c.name AS customerName
         FROM order_status_history h
         JOIN orders o ON o.id = h.orderId AND o.ownerId = h.ownerId
         LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
        WHERE h.ownerId = ? AND h.deletedAt IS NULL
        ORDER BY h.createdAt DESC LIMIT 12`,
      [ownerId],
    ),
  ]);

  const by = (s: OrderStatus) => n(counts.find((c) => c.status === s)?.n);
  const open = toView(openRows, settings.defaultToleranceMg, today);
  const overdue = open.filter((o) => o.isOverdue).sort(comparePriority);

  const cards: DashboardCards = {
    activeOrders: open.length,
    overdue: overdue.length,
    ready: by('ready'),
    withTravelers: by('traveler'),
    arrived: by('arrived'),
    withMakers: by('maker'),
    deliveredToday: n(deliveredTodayRow?.n),
    dueToday: open.filter((o) => o.expectedDeliveryDate === today).length,
    dueTomorrow: open.filter((o) => o.expectedDeliveryDate === tomorrow).length,
    // What the shop is actually owed: every customer's whole account, orders
    // and standalone entries together.
    outstandingBalanceFils: [...accounts.values()].reduce((a, x) => a + x.netBalanceFils, 0),
    expectedGoldMg: n(weightRow?.v),
  };

  const activity: ActivityItem[] = activityRows.map((r) => ({
    id: String(r.id),
    orderId: String(r.orderId),
    orderNumber: String(r.orderNumber ?? ''),
    customerName: String(r.customerName ?? 'Unknown customer'),
    text: activityText(String(r.toStatus), safeJson<Record<string, unknown> | null>(r.detail as string, null)),
    icon: ACTIVITY_ICON[String(r.toStatus)] ?? '•',
    at: String(r.occurredAt ?? r.createdAt),
  }));

  return {
    today,
    cards,
    urgent: overdue.slice(0, 20),
    dueTodayOrders: open.filter((o) => o.expectedDeliveryDate === today).sort(comparePriority).slice(0, 20),
    activity,
    notifications: await buildNotifications(ownerId, open, today),
    followUps: buildFollowUps(open, today),
  };
}

const ACTIVITY_ICON: Record<string, string> = {
  ordered: '📝',
  maker: '🔨',
  ready: '✅',
  traveler: '✈️',
  arrived: '📍',
  delivered: '🎁',
  cancelled: '⛔',
};

function activityText(toStatus: string, detail: Record<string, unknown> | null): string {
  switch (toStatus) {
    case 'ordered':
      return 'Order created';
    case 'maker':
      return detail?.returnedToMaker ? 'Returned to maker' : 'Sent to maker';
    case 'ready':
      return 'Marked ready';
    case 'traveler':
      return detail?.destination ? `Assigned to traveler → ${String(detail.destination)}` : 'Assigned to traveler';
    case 'arrived':
      return detail?.destination ? `Arrived in ${String(detail.destination)}` : 'Arrived';
    case 'delivered':
      return detail?.receivedBy ? `Delivered to ${String(detail.receivedBy)}` : 'Delivered';
    case 'cancelled':
      return detail?.reason ? `Cancelled — ${String(detail.reason)}` : 'Cancelled';
    default:
      return `Moved to ${toStatus}`;
  }
}

/* ---------------------------------------------------------- notifications */

export interface Notification {
  id: string;
  kind:
    | 'overdue'
    | 'due_today'
    | 'due_tomorrow'
    | 'maker_deadline'
    | 'traveler_departure'
    | 'traveler_arrival'
    | 'balance'
    | 'ready'
    | 'arrived';
  icon: string;
  title: string;
  body: string;
  severity: 'high' | 'medium' | 'low';
  href: string;
  count: number;
}

export async function buildNotifications(ownerId: string, open: OrderView[], today = dubaiDate()): Promise<Notification[]> {
  const db = await getDb();
  const settings = await getSettings(ownerId);
  const on = settings.notifications;
  const out: Notification[] = [];
  const tomorrow = addDays(today, 1);

  const overdue = open.filter((o) => o.isOverdue);
  if (on.overdue && overdue.length) {
    out.push({
      id: 'overdue',
      kind: 'overdue',
      icon: '🚨',
      title: `${overdue.length} ${overdue.length === 1 ? 'Order is' : 'Orders are'} Overdue`,
      body: overdue.slice(0, 3).map((o) => `${o.orderNumber} · ${o.customerName}`).join(' · '),
      severity: 'high',
      href: '/orders?quick=overdue',
      count: overdue.length,
    });
  }

  const dueToday = open.filter((o) => o.expectedDeliveryDate === today);
  if (on.dueToday && dueToday.length) {
    out.push({
      id: 'due_today',
      kind: 'due_today',
      icon: '🟡',
      title: `${dueToday.length} ${dueToday.length === 1 ? 'delivery' : 'deliveries'} due today`,
      body: dueToday.slice(0, 3).map((o) => o.customerName).join(' · '),
      severity: 'high',
      href: '/orders?quick=today',
      count: dueToday.length,
    });
  }

  const dueTomorrow = open.filter((o) => o.expectedDeliveryDate === tomorrow);
  if (on.dueTomorrow && dueTomorrow.length) {
    out.push({
      id: 'due_tomorrow',
      kind: 'due_tomorrow',
      icon: '🟠',
      title: `${dueTomorrow.length} ${dueTomorrow.length === 1 ? 'delivery' : 'deliveries'} due tomorrow`,
      body: dueTomorrow.slice(0, 3).map((o) => o.customerName).join(' · '),
      severity: 'medium',
      href: '/orders?quick=tomorrow',
      count: dueTomorrow.length,
    });
  }

  if (on.makerDeadline) {
    const lateMakers = open.filter(
      (o) => o.status === 'maker' && o.expectedReadyDate && diffDays(o.expectedReadyDate, today) < 0,
    );
    const grouped = groupBy(lateMakers, (o) => o.makerName ?? 'Unassigned maker');
    for (const [maker, list] of grouped) {
      out.push({
        id: `maker:${maker}`,
        kind: 'maker_deadline',
        icon: '🔨',
        title: `${maker} has ${list.length} ${list.length === 1 ? 'order' : 'orders'} past the ready date`,
        body: list.slice(0, 3).map((o) => o.orderNumber).join(' · '),
        severity: 'high',
        href: '/makers',
        count: list.length,
      });
    }
  }

  if (on.travelerDeparture || on.travelerArrival) {
    const ships = await db.all<Row>(
      `SELECT s.*, t.name AS travelerName,
              (SELECT COUNT(*) FROM orders o WHERE o.travelerShipmentId = s.id AND o.deletedAt IS NULL) AS orderCount
         FROM traveler_shipments s
         LEFT JOIN travelers t ON t.id = s.travelerId AND t.ownerId = s.ownerId
        WHERE s.ownerId = ? AND s.deletedAt IS NULL AND (s.departureDate = ? OR s.expectedArrival = ?)`,
      [ownerId, today, today],
    );
    for (const s of ships) {
      const count = n(s.orderCount);
      if (on.travelerDeparture && s.departureDate === today) {
        out.push({
          id: `dep:${s.id}`,
          kind: 'traveler_departure',
          icon: '✈️',
          title: `${String(s.travelerName ?? 'Traveler')} travels to ${String(s.destination)} today`,
          body: `${count} ${count === 1 ? 'order' : 'orders'} on board`,
          severity: 'medium',
          href: '/travelers',
          count,
        });
      }
      if (on.travelerArrival && s.expectedArrival === today && !s.arrivedAt) {
        out.push({
          id: `arr:${s.id}`,
          kind: 'traveler_arrival',
          icon: '📍',
          title: `${String(s.travelerName ?? 'Traveler')} arrives in ${String(s.destination)} today`,
          body: `${count} ${count === 1 ? 'order' : 'orders'} to confirm`,
          severity: 'medium',
          href: '/travelers',
          count,
        });
      }
    }
  }

  if (on.balance) {
    const owing = open.filter((o) => o.remainingBalanceFils > 0);
    const byCustomer = groupBy(owing, (o) => o.customerName);
    const top = [...byCustomer.entries()]
      .map(([name, list]) => ({ name, total: list.reduce((a, o) => a + o.remainingBalanceFils, 0), count: list.length }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    for (const c of top) {
      out.push({
        id: `bal:${c.name}`,
        kind: 'balance',
        icon: '💰',
        title: `${c.name} still owes a balance`,
        body: `${c.count} ${c.count === 1 ? 'order' : 'orders'} with an outstanding amount`,
        severity: 'medium',
        href: '/orders?quick=balance',
        count: c.count,
      });
    }
  }

  if (on.ready) {
    const ready = open.filter((o) => o.status === 'ready');
    if (ready.length) {
      out.push({
        id: 'ready',
        kind: 'ready',
        icon: '✅',
        title: `${ready.length} ${ready.length === 1 ? 'order is' : 'orders are'} ready`,
        body: ready.slice(0, 3).map((o) => `${o.orderNumber} · ${o.customerName}`).join(' · '),
        severity: 'low',
        href: '/orders?quick=ready',
        count: ready.length,
      });
    }
  }

  if (on.arrived) {
    const arrived = open.filter((o) => o.status === 'arrived');
    if (arrived.length) {
      out.push({
        id: 'arrived',
        kind: 'arrived',
        icon: '📍',
        title: `${arrived.length} ${arrived.length === 1 ? 'order has' : 'orders have'} arrived and await delivery`,
        body: arrived.slice(0, 3).map((o) => `${o.orderNumber} · ${o.customerName}`).join(' · '),
        severity: 'medium',
        href: '/orders?quick=arrived',
        count: arrived.length,
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function groupBy<T>(list: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const cur = m.get(k);
    if (cur) cur.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/* ------------------------------------------------------------- follow-ups */

export interface FollowUpItem {
  code: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  action: string;
  detail: string;
  urgency: Urgency;
}

/** Derived from live order state, so the list is never stale. */
export function buildFollowUps(open: OrderView[], today = dubaiDate()): FollowUpItem[] {
  const out: FollowUpItem[] = [];
  const push = (o: OrderView, code: string, action: string, detail: string) =>
    out.push({ code, orderId: o.id, orderNumber: o.orderNumber, customerName: o.customerName, action, detail, urgency: o.urgency });

  for (const o of open) {
    if (o.status === 'maker' && o.expectedReadyDate && diffDays(o.expectedReadyDate, today) <= 0) {
      push(o, 'call_maker', 'Call Maker', `${o.makerName ?? 'Maker'} — ready date ${o.expectedReadyDate}`);
    }
    if (o.status === 'ready') {
      push(o, 'check_ready', 'Check Ready Order', 'Arrange traveler or shop pickup');
    }
    if (o.status === 'traveler') {
      push(o, 'confirm_arrival', 'Confirm Arrival', `${o.travelerName ?? 'Traveler'} → ${o.destination ?? 'destination'}`);
    }
    if (o.status === 'arrived') {
      push(o, 'deliver_order', 'Deliver Order', `Waiting in ${o.destination ?? 'destination'}`);
    }
    if (o.isOverdue) {
      push(o, 'contact_customer', 'Contact Customer', `${o.daysLate} ${o.daysLate === 1 ? 'day' : 'days'} late`);
    }
    if (o.remainingBalanceFils > 0 && (o.status === 'arrived' || o.status === 'ready')) {
      push(o, 'collect_balance', 'Collect Balance', 'Balance still outstanding before handover');
    }
  }
  const rank: Record<string, number> = { critical: 0, high: 1, late: 2, due_today: 3, due_tomorrow: 4, upcoming: 5, no_date: 6 };
  return out.sort((a, b) => (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9)).slice(0, 60);
}

/* ---------------------------------------------------------------- reports */

export interface ReportBucket {
  key: string;
  label: string;
  count: number;
  weightMg: number;
  valueFils: number;
}

export interface ReportResult {
  range: { start: string; end: string };
  totals: {
    orders: number;
    active: number;
    delivered: number;
    cancelled: number;
    overdue: number;
    expectedWeightMg: number;
    actualWeightMg: number;
    orderValueFils: number;
    paidFils: number;
    outstandingFils: number;
    makerCostFils: number;
    estimatedProfitFils: number;
    paymentsReceivedFils: number;
    exchangeValueFils: number;
  };
  byKarat: ReportBucket[];
  byMaker: ReportBucket[];
  byTraveler: ReportBucket[];
  byDestination: ReportBucket[];
  byCustomer: ReportBucket[];
  byCategory: ReportBucket[];
  averageDeliveryDays: number | null;
  averageDelayDays: number | null;
}

/**
 * `includeCancelled` is off by default: a cancelled order never counts toward a
 * total unless the reader explicitly asks for it.
 */
export async function buildReport(
  ownerId: string,
  range: { start: string; end: string },
  opts: { includeCancelled?: boolean } = {},
): Promise<ReportResult> {
  const db = await getDb();
  const today = dubaiDate();
  const cancelledClause = opts.includeCancelled ? '' : `AND o.status != 'cancelled'`;

  const rows = await db.all<JoinRow>(
    `${JOINED} WHERE o.ownerId = ? AND o.deletedAt IS NULL AND o.orderDate >= ? AND o.orderDate <= ? ${cancelledClause}`,
    [ownerId, range.start, range.end],
  );
  const settings = await getSettings(ownerId);
  const orders = toView(rows, settings.defaultToleranceMg, today);

  const cancelledCount = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM orders WHERE ownerId = ? AND deletedAt IS NULL AND status = 'cancelled' AND orderDate >= ? AND orderDate <= ?`,
    [ownerId, range.start, range.end],
  );

  const paymentsRow = await db.get<{ v: number }>(
    `SELECT COALESCE(SUM(p.amountFils),0) AS v FROM payments p
      WHERE p.ownerId = ? AND p.deletedAt IS NULL AND p.paidOn >= ? AND p.paidOn <= ?`,
    [ownerId, range.start, range.end],
  );
  const exchangeRow = await db.get<{ v: number }>(
    `SELECT COALESCE(SUM(e.valueFils),0) AS v FROM gold_exchanges e
      WHERE e.ownerId = ? AND e.deletedAt IS NULL AND e.receivedOn >= ? AND e.receivedOn <= ?`,
    [ownerId, range.start, range.end],
  );

  const delivered = orders.filter((o) => o.status === 'delivered');
  const durations = delivered
    .filter((o) => o.deliveredDate)
    .map((o) => diffDays(o.deliveredDate as string, o.orderDate))
    .filter((d) => d >= 0);
  const delays = delivered
    .filter((o) => o.deliveredDate && o.expectedDeliveryDate)
    .map((o) => diffDays(o.deliveredDate as string, o.expectedDeliveryDate as string));

  const bucket = (keyOf: (o: OrderView) => string | null, labelOf?: (o: OrderView) => string): ReportBucket[] => {
    const m = new Map<string, ReportBucket>();
    for (const o of orders) {
      const key = keyOf(o);
      if (!key) continue;
      const cur = m.get(key) ?? { key, label: labelOf ? labelOf(o) : key, count: 0, weightMg: 0, valueFils: 0 };
      cur.count += 1;
      cur.weightMg += o.actualWeightMg ?? o.expectedWeightMg;
      cur.valueFils += o.totalAmountFils;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  };

  const orderValueFils = orders.reduce((a, o) => a + o.totalAmountFils, 0);
  const makerCostFils = orders.reduce((a, o) => a + o.makerCostFils, 0);
  const paidFils = orders.reduce((a, o) => a + o.totalPaidFils, 0);

  return {
    range,
    totals: {
      orders: orders.length,
      active: orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length,
      delivered: delivered.length,
      cancelled: n(cancelledCount?.n),
      overdue: orders.filter((o) => o.isOverdue).length,
      expectedWeightMg: orders.reduce((a, o) => a + o.expectedWeightMg, 0),
      actualWeightMg: orders.reduce((a, o) => a + (o.actualWeightMg ?? 0), 0),
      orderValueFils,
      paidFils,
      outstandingFils: orders.reduce((a, o) => a + o.remainingBalanceFils, 0),
      makerCostFils,
      estimatedProfitFils: orderValueFils - makerCostFils,
      paymentsReceivedFils: n(paymentsRow?.v),
      exchangeValueFils: n(exchangeRow?.v),
    },
    byKarat: bucket((o) => o.karat),
    byMaker: bucket((o) => o.makerId, (o) => o.makerName ?? 'Unassigned'),
    byTraveler: bucket((o) => o.travelerId, (o) => o.travelerName ?? 'Unassigned'),
    byDestination: bucket((o) => o.destination),
    byCustomer: bucket((o) => o.customerId, (o) => o.customerName),
    byCategory: bucket((o) => o.category),
    averageDeliveryDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    averageDelayDays: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
  };
}

/* ---------------------------------------------------------------- calendar */

export interface CalendarEntry {
  date: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  kind: 'ready' | 'delivery' | 'departure' | 'arrival';
  status: OrderStatus;
  urgency: Urgency;
}

export async function buildCalendar(ownerId: string, start: string, end: string): Promise<CalendarEntry[]> {
  const db = await getDb();
  const today = dubaiDate();
  const rows = await db.all<JoinRow & { departureDate: string | null; shipmentArrival: string | null }>(
    `SELECT o.*, c.name AS customerName, c.phone AS customerPhone, c.whatsapp AS customerWhatsapp,
            m.name AS makerName, tr.name AS travelerName,
            s.departureDate AS departureDate, s.expectedArrival AS shipmentArrival
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
       LEFT JOIN makers m ON m.id = o.makerId AND m.ownerId = o.ownerId
       LEFT JOIN travelers tr ON tr.id = o.travelerId AND tr.ownerId = o.ownerId
       LEFT JOIN traveler_shipments s ON s.id = o.travelerShipmentId AND s.ownerId = o.ownerId
      WHERE o.ownerId = ? AND o.deletedAt IS NULL`,
    [ownerId],
  );

  const out: CalendarEntry[] = [];
  const within = (d: string | null | undefined): d is string => !!d && d >= start && d <= end;

  for (const r of rows) {
    const o = hydrateOrder(r);
    const u = urgencyOf(o.status, o.expectedDeliveryDate, today);
    const base = {
      orderId: o.id,
      orderNumber: o.orderNumber,
      customerName: r.customerName ?? 'Unknown customer',
      productName: o.productName,
      status: o.status,
      urgency: u.urgency,
    };
    if (within(o.expectedReadyDate)) out.push({ ...base, date: o.expectedReadyDate, kind: 'ready' });
    if (within(o.expectedDeliveryDate)) out.push({ ...base, date: o.expectedDeliveryDate, kind: 'delivery' });
    if (within(r.departureDate)) out.push({ ...base, date: r.departureDate, kind: 'departure' });
    if (within(r.shipmentArrival)) out.push({ ...base, date: r.shipmentArrival, kind: 'arrival' });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
