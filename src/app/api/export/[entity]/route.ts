import { fail, isDenied, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { formatMoney, formatWeight } from '@/lib/num';
import { n, safeJson } from '@/lib/repo';
import { STATUS_LABEL, type OrderStatus } from '@/lib/types';
import { urgencyOf } from '@/lib/calc';
import { dubaiDate } from '@/lib/date';

type Params = { params: Promise<{ entity: string }> };

const csvEscape = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** BOM first so Excel opens the file with the right encoding. */
const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n');

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx('reports.view');
  if (isDenied(g)) return g.response;
  const { entity } = await params;
  const db = await getDb();
  const today = dubaiDate();
  let rows: unknown[][];

  switch (entity) {
    case 'orders': {
      const data = await db.all<Record<string, unknown>>(
        `SELECT o.*, c.name AS customerName, c.phone AS customerPhone, m.name AS makerName, t.name AS travelerName
           FROM orders o
           LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
           LEFT JOIN makers m ON m.id = o.makerId AND m.ownerId = o.ownerId
           LEFT JOIN travelers t ON t.id = o.travelerId AND t.ownerId = o.ownerId
          WHERE o.ownerId = ? AND o.deletedAt IS NULL ORDER BY o.orderDate DESC`,
        [g.ctx.ownerId],
      );
      rows = [
        ['Order Number', 'Reference', 'Order Date', 'Customer', 'Phone', 'Product', 'Category', 'Style', 'Karat',
         'Expected Weight (g)', 'Actual Weight (g)', 'Total', 'Paid', 'Balance', 'Maker', 'Maker Cost', 'Traveler',
         'Destination', 'Status', 'Expected Delivery', 'Delivered', 'Days Late', 'Tags'],
        ...data.map((o) => {
          const u = urgencyOf(String(o.status) as OrderStatus, (o.expectedDeliveryDate as string) ?? null, today);
          return [
            o.orderNumber, o.referenceNo ?? '', o.orderDate, o.customerName ?? '', o.customerPhone ?? '',
            o.productName, o.category, o.style ?? '', o.karat,
            formatWeight(n(o.expectedWeightMg), false),
            o.actualWeightMg == null ? '' : formatWeight(n(o.actualWeightMg), false),
            formatMoney(n(o.totalAmountFils), false), formatMoney(n(o.totalPaidFils), false), formatMoney(n(o.remainingBalanceFils), false),
            o.makerName ?? '', formatMoney(n(o.makerCostFils), false), o.travelerName ?? '', o.destination ?? '',
            STATUS_LABEL[String(o.status) as OrderStatus] ?? o.status,
            o.expectedDeliveryDate ?? '', o.deliveredDate ?? '', u.daysLate || '',
            safeJson<string[]>(o.tags as string, []).join(' | '),
          ];
        }),
      ];
      break;
    }
    case 'payments': {
      const data = await db.all<Record<string, unknown>>(
        `SELECT p.*, o.orderNumber, c.name AS customerName FROM payments p
           JOIN orders o ON o.id = p.orderId AND o.ownerId = p.ownerId
           LEFT JOIN customers c ON c.id = o.customerId AND c.ownerId = o.ownerId
          WHERE p.ownerId = ? AND p.deletedAt IS NULL ORDER BY p.paidOn DESC`,
        [g.ctx.ownerId],
      );
      rows = [
        ['Date', 'Order Number', 'Customer', 'Amount', 'Method', 'Reference', 'Note', 'Recorded By'],
        ...data.map((p) => [p.paidOn, p.orderNumber, p.customerName ?? '', formatMoney(n(p.amountFils), false), p.method, p.reference ?? '', p.note ?? '', p.createdByName ?? '']),
      ];
      break;
    }
    case 'customers': {
      const data = await db.all<Record<string, unknown>>(
        `SELECT c.*,
                (SELECT COUNT(*) FROM orders o WHERE o.customerId = c.id AND o.deletedAt IS NULL) AS totalOrders,
                (SELECT COALESCE(SUM(o.remainingBalanceFils),0) FROM orders o WHERE o.customerId = c.id AND o.deletedAt IS NULL AND o.status != 'cancelled') AS outstanding
           FROM customers c WHERE c.ownerId = ? AND c.deletedAt IS NULL ORDER BY c.name`,
        [g.ctx.ownerId],
      );
      rows = [
        ['Name', 'Phone', 'WhatsApp', 'Country', 'City', 'Type', 'Instagram', 'Email', 'Total Orders', 'Outstanding', 'Tags', 'Notes'],
        ...data.map((c) => [c.name, c.phone ?? '', c.whatsapp ?? '', c.country ?? '', c.city ?? '', c.customerType ?? '', c.instagram ?? '', c.email ?? '', n(c.totalOrders), formatMoney(n(c.outstanding), false), safeJson<string[]>(c.tags as string, []).join(' | '), c.notes ?? '']),
      ];
      break;
    }
    case 'makers': {
      const data = await db.all<Record<string, unknown>>(
        `SELECT m.*,
                (SELECT COUNT(*) FROM orders o WHERE o.makerId = m.id AND o.deletedAt IS NULL AND o.status NOT IN ('delivered','cancelled')) AS activeOrders
           FROM makers m WHERE m.ownerId = ? AND m.deletedAt IS NULL ORDER BY m.name`,
        [g.ctx.ownerId],
      );
      rows = [
        ['Name', 'Company', 'Phone', 'WhatsApp', 'Location', 'Specialty', 'Active Orders', 'Notes'],
        ...data.map((m) => [m.name, m.company ?? '', m.phone ?? '', m.whatsapp ?? '', m.location ?? '', m.specialty ?? '', n(m.activeOrders), m.notes ?? '']),
      ];
      break;
    }
    case 'travelers': {
      const data = await db.all<Record<string, unknown>>(
        `SELECT t.*,
                (SELECT COUNT(*) FROM orders o WHERE o.travelerId = t.id AND o.deletedAt IS NULL AND o.status IN ('traveler','arrived')) AS currentOrders
           FROM travelers t WHERE t.ownerId = ? AND t.deletedAt IS NULL ORDER BY t.name`,
        [g.ctx.ownerId],
      );
      rows = [
        ['Name', 'Phone', 'WhatsApp', 'Frequent Route', 'ID Reference', 'Current Orders', 'Notes'],
        ...data.map((t) => [t.name, t.phone ?? '', t.whatsapp ?? '', t.frequentRoute ?? '', t.idReference ?? '', n(t.currentOrders), t.notes ?? '']),
      ];
      break;
    }
    default:
      return fail('unknown_export', 404);
  }

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gold-orders-${entity}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
