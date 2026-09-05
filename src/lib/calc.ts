/**
 * Pure order calculations. Everything here is integer maths on fils and
 * milligrams, so a total is reproducible and never drifts.
 */
import { applyBp, goldValueFils, mulDiv, sum } from './num';
import { diffDays, dubaiDate } from './date';
import {
  STATUS_FLOW,
  isClosed,
  type OrderStatus,
  type Urgency,
} from './types';

/* --------------------------------------------------------------- pricing */

export interface PricingInput {
  expectedWeightMg: number;
  actualWeightMg?: number | null;
  goldRateFilsPerGram: number;
  /** When the shop types one lump-sum gold value instead of a rate. */
  goldValueOverrideFils?: number | null;
  makingChargeMode: 'per_gram' | 'fixed';
  /** Per gram, or the flat amount — same field, read according to the mode. */
  makingChargeFils: number;
  otherChargesFils?: number;
  discountFils?: number;
  vatBp?: number;
}

export interface PricingResult {
  /** The weight the price is actually built on: actual once known, else expected. */
  billableWeightMg: number;
  goldValueFils: number;
  makingFils: number;
  otherChargesFils: number;
  discountFils: number;
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
}

export function priceOrder(input: PricingInput): PricingResult {
  const billableWeightMg = input.actualWeightMg ?? input.expectedWeightMg ?? 0;
  const gold =
    input.goldValueOverrideFils !== null && input.goldValueOverrideFils !== undefined
      ? input.goldValueOverrideFils
      : goldValueFils(billableWeightMg, input.goldRateFilsPerGram ?? 0);
  const making =
    input.makingChargeMode === 'per_gram'
      ? mulDiv(input.makingChargeFils ?? 0, billableWeightMg, 1000)
      : input.makingChargeFils ?? 0;
  const other = input.otherChargesFils ?? 0;
  const discount = input.discountFils ?? 0;
  const subtotal = gold + making + other - discount;
  const vat = applyBp(Math.max(subtotal, 0), input.vatBp ?? 0);
  return {
    billableWeightMg,
    goldValueFils: gold,
    makingFils: making,
    otherChargesFils: other,
    discountFils: discount,
    subtotalFils: subtotal,
    vatFils: vat,
    totalFils: subtotal + vat,
  };
}

/* --------------------------------------------------------------- balance */

export type BalanceStatus = 'paid' | 'partial' | 'unpaid' | 'credit';

export interface BalanceResult {
  totalFils: number;
  paymentsFils: number;
  exchangeFils: number;
  totalPaidFils: number;
  /** Never negative. An overpayment surfaces as `creditFils` instead. */
  remainingFils: number;
  creditFils: number;
  status: BalanceStatus;
}

export function balanceOf(
  totalFils: number,
  payments: { amountFils: number }[],
  exchanges: { valueFils: number }[] = [],
): BalanceResult {
  const paymentsFils = sum(payments.map((p) => p.amountFils));
  const exchangeFils = sum(exchanges.map((e) => e.valueFils));
  const totalPaidFils = paymentsFils + exchangeFils;
  const diff = totalFils - totalPaidFils;
  const remainingFils = Math.max(diff, 0);
  const creditFils = Math.max(-diff, 0);
  let status: BalanceStatus;
  if (creditFils > 0) status = 'credit';
  else if (remainingFils === 0 && totalPaidFils > 0) status = 'paid';
  else if (totalPaidFils > 0) status = 'partial';
  else status = 'unpaid';
  return { totalFils, paymentsFils, exchangeFils, totalPaidFils, remainingFils, creditFils, status };
}

export const BALANCE_LABEL: Record<BalanceStatus, string> = {
  paid: 'Paid',
  partial: 'Partially Paid',
  unpaid: 'Not Paid',
  credit: 'Customer Credit',
};

export const BALANCE_ICON: Record<BalanceStatus, string> = {
  paid: '🟢',
  partial: '🟡',
  unpaid: '🔴',
  credit: '🔵',
};

/* ---------------------------------------------------------------- weight */

export type WeightVerdict = 'within' | 'slight' | 'outside';

export interface WeightResult {
  differenceMg: number;
  verdict: WeightVerdict;
  /** The band the piece was expected to land in, when one was set. */
  minimumMg: number | null;
  maximumMg: number | null;
}

/**
 * A difference inside the declared min/max band is "within". Outside the band
 * but under half the tolerance again is "slight"; anything further is "outside".
 */
export function compareWeight(
  expectedMg: number,
  actualMg: number,
  bounds: { minimumMg?: number | null; maximumMg?: number | null; toleranceMg?: number } = {},
): WeightResult {
  const differenceMg = actualMg - expectedMg;
  const tol = bounds.toleranceMg ?? 0;
  const min = bounds.minimumMg ?? (tol ? expectedMg - tol : null);
  const max = bounds.maximumMg ?? (tol ? expectedMg + tol : null);
  let verdict: WeightVerdict = 'within';
  if (min !== null && max !== null) {
    if (actualMg < min || actualMg > max) {
      const band = Math.max(max - min, 0);
      const overshoot = actualMg < min ? min - actualMg : actualMg - max;
      verdict = overshoot <= Math.max(band / 2, 500) ? 'slight' : 'outside';
    }
  } else if (differenceMg !== 0) {
    verdict = Math.abs(differenceMg) <= 500 ? 'within' : Math.abs(differenceMg) <= 2000 ? 'slight' : 'outside';
  }
  return { differenceMg, verdict, minimumMg: min, maximumMg: max };
}

export const WEIGHT_VERDICT_LABEL: Record<WeightVerdict, string> = {
  within: 'Within Tolerance',
  slight: 'Slight Difference',
  outside: 'Outside Expected Range',
};

/* -------------------------------------------------------------- urgency */

export interface UrgencyResult {
  urgency: Urgency;
  daysLate: number;
  daysRemaining: number | null;
  isOverdue: boolean;
  /** Lower sorts first. Overdue orders can never fall below an active one. */
  priority: number;
}

/**
 * Overdue means: the expected delivery date has passed in Dubai and the order
 * is neither delivered nor cancelled. Nothing about this is manual.
 */
export function urgencyOf(
  status: OrderStatus,
  expectedDeliveryDate: string | null,
  today: string = dubaiDate(),
): UrgencyResult {
  if (status === 'delivered') return { urgency: 'delivered', daysLate: 0, daysRemaining: null, isOverdue: false, priority: 800 };
  if (status === 'cancelled') return { urgency: 'cancelled', daysLate: 0, daysRemaining: null, isOverdue: false, priority: 900 };
  if (!expectedDeliveryDate) return { urgency: 'no_date', daysLate: 0, daysRemaining: null, isOverdue: false, priority: 600 };

  const remaining = diffDays(expectedDeliveryDate, today);
  const late = remaining < 0 ? -remaining : 0;

  if (late > 7) return { urgency: 'critical', daysLate: late, daysRemaining: remaining, isOverdue: true, priority: 0 };
  if (late >= 3) return { urgency: 'high', daysLate: late, daysRemaining: remaining, isOverdue: true, priority: 100 };
  if (late >= 1) return { urgency: 'late', daysLate: late, daysRemaining: remaining, isOverdue: true, priority: 200 };
  if (remaining === 0) return { urgency: 'due_today', daysLate: 0, daysRemaining: 0, isOverdue: false, priority: 300 };
  if (remaining === 1) return { urgency: 'due_tomorrow', daysLate: 0, daysRemaining: 1, isOverdue: false, priority: 400 };
  return { urgency: 'upcoming', daysLate: 0, daysRemaining: remaining, isOverdue: false, priority: 500 };
}

/**
 * Default list order: urgency band first, then the soonest delivery date, then
 * the newest order. Overdue work stays pinned at the top until it closes.
 */
export function comparePriority(
  a: { priority: number; expectedDeliveryDate: string | null; createdAt: string },
  b: { priority: number; expectedDeliveryDate: string | null; createdAt: string },
): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ad = a.expectedDeliveryDate ?? '9999-12-31';
  const bd = b.expectedDeliveryDate ?? '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return a.createdAt < b.createdAt ? 1 : -1;
}

/* -------------------------------------------------------------- progress */

export function progressPercent(status: OrderStatus): number {
  if (status === 'cancelled') return 0;
  const i = STATUS_FLOW.indexOf(status);
  if (i < 0) return 0;
  return Math.round(((i + 1) / STATUS_FLOW.length) * 100);
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(status);
  if (i < 0 || i === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
}

/** Which moves the UI offers. Going back to the maker after Ready is allowed. */
export function allowedTransitions(status: OrderStatus): OrderStatus[] {
  if (status === 'delivered') return [];
  if (status === 'cancelled') return ['ordered'];
  const forward = STATUS_FLOW.filter((s) => s !== status);
  return [...forward, 'cancelled'];
}

/* -------------------------------------------------------------- warnings */

export interface OrderWarning {
  code: string;
  text: string;
  severity: 'high' | 'medium' | 'low';
}

export interface WarningInput {
  status: OrderStatus;
  expectedDeliveryDate: string | null;
  expectedReadyDate: string | null;
  actualWeightMg: number | null;
  expectedWeightMg: number;
  weightVerdict: WeightVerdict | null;
  remainingFils: number;
  coverMediaId: string | null;
  mediaCount: number;
  departureDate: string | null;
  today?: string;
}

export function warningsFor(o: WarningInput): OrderWarning[] {
  const today = o.today ?? dubaiDate();
  const out: OrderWarning[] = [];
  const open = !isClosed(o.status);

  if (open && !o.expectedDeliveryDate) {
    out.push({ code: 'no_delivery_date', text: 'Order has no expected delivery date.', severity: 'medium' });
  }
  if (open && o.expectedDeliveryDate && diffDays(o.expectedDeliveryDate, today) < 0) {
    out.push({ code: 'past_due', text: 'Expected delivery date has passed.', severity: 'high' });
  }
  if (o.status === 'maker' && o.expectedReadyDate && diffDays(o.expectedReadyDate, today) < 0) {
    out.push({ code: 'maker_late', text: 'Maker deadline has passed.', severity: 'high' });
  }
  if (o.status === 'traveler' && o.departureDate && diffDays(o.departureDate, today) < 0) {
    out.push({ code: 'traveler_departed', text: 'Traveler departure date passed but the order is still marked Traveler.', severity: 'high' });
  }
  if (o.weightVerdict === 'outside') {
    out.push({ code: 'weight_off', text: 'Actual weight differs significantly from the expected weight.', severity: 'high' });
  }
  if (o.remainingFils > 0 && o.status === 'delivered') {
    out.push({ code: 'delivered_unpaid', text: 'Order was delivered with a balance still outstanding.', severity: 'high' });
  } else if (o.remainingFils > 0 && open) {
    out.push({ code: 'balance_due', text: 'Customer still has an unpaid balance.', severity: 'medium' });
  }
  if (!o.coverMediaId && o.mediaCount === 0) {
    out.push({ code: 'no_photo', text: 'Order has no product photo.', severity: 'low' });
  }
  return out;
}

/* ------------------------------------------------------------- duplicates */

export interface DuplicateCandidate {
  id: string;
  orderNumber: string;
  customerId: string;
  productName: string;
  expectedWeightMg: number;
  orderDate: string;
}

/**
 * Warns only — creation is never blocked. Same customer, near-identical product
 * name, weight within 5 g, and ordered within the last 14 days.
 */
export function findDuplicates(
  candidate: { customerId: string; productName: string; expectedWeightMg: number; orderDate: string },
  existing: DuplicateCandidate[],
): DuplicateCandidate[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const name = norm(candidate.productName);
  return existing.filter(
    (o) =>
      o.customerId === candidate.customerId &&
      norm(o.productName) === name &&
      Math.abs(o.expectedWeightMg - candidate.expectedWeightMg) <= 5000 &&
      Math.abs(diffDays(candidate.orderDate, o.orderDate)) <= 14,
  );
}
