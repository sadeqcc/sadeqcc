import { describe, expect, it } from 'vitest';
import {
  accountFrom,
  balanceOf,
  compareWeight,
  comparePriority,
  findDuplicates,
  nextStatus,
  priceOrder,
  progressPercent,
  urgencyOf,
  warningsFor,
} from '../src/lib/calc';
import {
  applyBp,
  formatMoney,
  formatWeight,
  goldValueFils,
  mulDiv,
  ouncePriceToPerGram,
  parseMoney,
  parseWeight,
  percentToBp,
} from '../src/lib/num';
import { countdownLabel, diffDays, presetRange } from '../src/lib/date';

import { LEDGER_DIRECTION } from '../src/lib/types';

describe('decimal-safe parsing and formatting', () => {
  it('parses money to whole fils without float drift', () => {
    expect(parseMoney('23500.00')).toBe(2_350_000);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('1,250.55')).toBe(125_055);
    // half-up beyond the supported precision
    expect(parseMoney('10.005')).toBe(1001);
    expect(parseMoney('10.004')).toBe(1000);
  });

  it('parses weights to whole milligrams', () => {
    expect(parseWeight('45.000')).toBe(45_000);
    expect(parseWeight('46.35')).toBe(46_350);
    expect(parseWeight('0.0005')).toBe(1);
  });

  it('rejects junk instead of guessing', () => {
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseWeight('1.2.3')).toBeNull();
  });

  it('formats back to fixed decimals', () => {
    expect(formatMoney(2_350_000)).toBe('23,500.00');
    expect(formatWeight(46_350)).toBe('46.350');
    expect(formatWeight(-1_350)).toBe('-1.350');
  });

  it('round-trips a value through parse and format', () => {
    for (const s of ['0.01', '9.99', '12345.67', '999999.99']) {
      expect(formatMoney(parseMoney(s)!, false)).toBe(s);
    }
  });

  it('multiplies and divides as integers with half-up rounding', () => {
    expect(mulDiv(10, 3, 4)).toBe(8); // 7.5 -> 8
    expect(mulDiv(-10, 3, 4)).toBe(-8);
    expect(mulDiv(100, 0, 5)).toBe(0);
    expect(mulDiv(100, 5, 0)).toBe(0);
  });

  it('converts an ounce price to a per-gram rate', () => {
    // 3,110.30 per ounce is about 100.00 per gram
    expect(ouncePriceToPerGram(311_030)).toBe(10_000);
  });

  it('applies a percentage through basis points', () => {
    expect(percentToBp(5)).toBe(500);
    expect(applyBp(2_000_000, 500)).toBe(100_000);
    expect(applyBp(333, 500)).toBe(17); // 16.65 -> 17
  });

  it('values gold by weight', () => {
    expect(goldValueFils(45_000, 22_000)).toBe(990_000); // 45 g at 220.00/g
  });
});

describe('order pricing', () => {
  const base = {
    expectedWeightMg: 45_000,
    goldRateFilsPerGram: 22_000,
    makingChargeMode: 'per_gram' as const,
    makingChargeFils: 5_000,
  };

  it('prices from the expected weight until the actual weight is known', () => {
    const r = priceOrder(base);
    expect(r.billableWeightMg).toBe(45_000);
    expect(r.goldValueFils).toBe(990_000);
    expect(r.makingFils).toBe(225_000);
    expect(r.totalFils).toBe(1_215_000);
  });

  it('switches to the actual weight once it is recorded', () => {
    const r = priceOrder({ ...base, actualWeightMg: 46_350 });
    expect(r.billableWeightMg).toBe(46_350);
    expect(r.goldValueFils).toBe(1_019_700);
    expect(r.totalFils).toBe(1_251_450);
  });

  it('applies a fixed making charge without scaling by weight', () => {
    const r = priceOrder({ ...base, makingChargeMode: 'fixed', makingChargeFils: 50_000 });
    expect(r.makingFils).toBe(50_000);
  });

  it('honours a manual gold value over the rate', () => {
    const r = priceOrder({ ...base, goldValueOverrideFils: 1_000_000 });
    expect(r.goldValueFils).toBe(1_000_000);
  });

  it('applies charges, discount and VAT in order', () => {
    const r = priceOrder({ ...base, otherChargesFils: 10_000, discountFils: 15_000, vatBp: 500 });
    expect(r.subtotalFils).toBe(1_210_000);
    expect(r.vatFils).toBe(60_500);
    expect(r.totalFils).toBe(1_270_500);
  });
});

describe('balance', () => {
  it('adds payments and gold exchange together', () => {
    const b = balanceOf(2_350_000, [{ amountFils: 1_800_000 }], [{ valueFils: 325_000 }]);
    expect(b.totalPaidFils).toBe(2_125_000);
    expect(b.remainingFils).toBe(225_000);
    expect(b.status).toBe('partial');
  });

  it('never reports a negative balance — an overpayment is credit', () => {
    const b = balanceOf(1_000_000, [{ amountFils: 1_050_000 }]);
    expect(b.remainingFils).toBe(0);
    expect(b.creditFils).toBe(50_000);
    expect(b.status).toBe('credit');
  });

  it('marks a fully settled order as paid and an untouched one as unpaid', () => {
    expect(balanceOf(1_000, [{ amountFils: 1_000 }]).status).toBe('paid');
    expect(balanceOf(1_000, []).status).toBe('unpaid');
  });
});

describe('weight comparison', () => {
  it('accepts a weight inside the declared band', () => {
    const r = compareWeight(45_000, 46_350, { minimumMg: 43_000, maximumMg: 47_000 });
    expect(r.differenceMg).toBe(1_350);
    expect(r.verdict).toBe('within');
  });

  it('flags a small overshoot as slight and a large one as outside', () => {
    expect(compareWeight(45_000, 47_500, { minimumMg: 43_000, maximumMg: 47_000 }).verdict).toBe('slight');
    expect(compareWeight(45_000, 55_000, { minimumMg: 43_000, maximumMg: 47_000 }).verdict).toBe('outside');
  });

  it('derives a band from the tolerance when none was set', () => {
    const r = compareWeight(45_000, 46_000, { toleranceMg: 2_000 });
    expect(r.minimumMg).toBe(43_000);
    expect(r.maximumMg).toBe(47_000);
    expect(r.verdict).toBe('within');
  });
});

describe('urgency and priority', () => {
  const today = '2026-09-05';

  it('marks a passed delivery date on an open order as overdue', () => {
    const r = urgencyOf('maker', '2026-09-01', today);
    expect(r.isOverdue).toBe(true);
    expect(r.daysLate).toBe(4);
    expect(r.urgency).toBe('high');
  });

  it('escalates by how late the order is', () => {
    expect(urgencyOf('maker', '2026-09-04', today).urgency).toBe('late');
    expect(urgencyOf('maker', '2026-09-02', today).urgency).toBe('high');
    expect(urgencyOf('maker', '2026-08-20', today).urgency).toBe('critical');
  });

  it('never marks a delivered or cancelled order overdue', () => {
    expect(urgencyOf('delivered', '2026-08-01', today).isOverdue).toBe(false);
    expect(urgencyOf('cancelled', '2026-08-01', today).isOverdue).toBe(false);
  });

  it('labels today and tomorrow', () => {
    expect(urgencyOf('ready', today, today).urgency).toBe('due_today');
    expect(urgencyOf('ready', '2026-09-06', today).urgency).toBe('due_tomorrow');
  });

  it('sorts overdue orders above everything still active', () => {
    const overdue = { ...urgencyOf('maker', '2026-09-01', today), expectedDeliveryDate: '2026-09-01', createdAt: '2026-09-01T00:00:00Z' };
    const upcoming = { ...urgencyOf('maker', '2026-09-20', today), expectedDeliveryDate: '2026-09-20', createdAt: '2026-09-04T00:00:00Z' };
    const delivered = { ...urgencyOf('delivered', '2026-09-01', today), expectedDeliveryDate: '2026-09-01', createdAt: '2026-09-04T00:00:00Z' };
    const sorted = [delivered, upcoming, overdue].sort(comparePriority);
    expect(sorted[0]).toBe(overdue);
    expect(sorted[2]).toBe(delivered);
  });

  it('breaks a priority tie by the soonest delivery date', () => {
    const a = { priority: 500, expectedDeliveryDate: '2026-09-20', createdAt: '2026-09-01T00:00:00Z' };
    const b = { priority: 500, expectedDeliveryDate: '2026-09-10', createdAt: '2026-09-01T00:00:00Z' };
    expect([a, b].sort(comparePriority)[0]).toBe(b);
  });
});

describe('progress', () => {
  it('walks the flow from ordered to delivered', () => {
    expect(progressPercent('ordered')).toBe(17);
    expect(progressPercent('ready')).toBe(50);
    expect(progressPercent('delivered')).toBe(100);
    expect(progressPercent('cancelled')).toBe(0);
  });

  it('knows the next step', () => {
    expect(nextStatus('ordered')).toBe('maker');
    expect(nextStatus('arrived')).toBe('delivered');
    expect(nextStatus('delivered')).toBeNull();
  });
});

describe('warnings', () => {
  const base = {
    status: 'maker' as const,
    expectedDeliveryDate: '2026-09-01',
    expectedReadyDate: '2026-08-28',
    actualWeightMg: null,
    expectedWeightMg: 45_000,
    weightVerdict: null,
    remainingFils: 560_500,
    coverMediaId: null,
    mediaCount: 0,
    departureDate: null,
    today: '2026-09-05',
  };

  it('reports the passed delivery date, maker deadline, balance and missing photo', () => {
    const codes = warningsFor(base).map((w) => w.code);
    expect(codes).toContain('past_due');
    expect(codes).toContain('maker_late');
    expect(codes).toContain('balance_due');
    expect(codes).toContain('no_photo');
  });

  it('calls out an order delivered with money still owed', () => {
    const codes = warningsFor({ ...base, status: 'delivered' }).map((w) => w.code);
    expect(codes).toContain('delivered_unpaid');
  });

  it('stays quiet on a clean, settled order', () => {
    const codes = warningsFor({
      ...base,
      status: 'ready',
      expectedDeliveryDate: '2026-09-20',
      expectedReadyDate: '2026-09-10',
      remainingFils: 0,
      coverMediaId: 'm1',
      mediaCount: 2,
    }).map((w) => w.code);
    expect(codes).toEqual([]);
  });
});

describe('duplicate detection', () => {
  const existing = [
    { id: '1', orderNumber: 'GO-2026-0001', customerId: 'c1', productName: 'Indian Necklace', expectedWeightMg: 45_000, orderDate: '2026-09-01' },
  ];

  it('warns on the same customer, product, similar weight and a recent date', () => {
    const hits = findDuplicates(
      { customerId: 'c1', productName: 'indian necklace', expectedWeightMg: 46_000, orderDate: '2026-09-05' },
      existing,
    );
    expect(hits).toHaveLength(1);
  });

  it('does not warn across customers, distant weights or old orders', () => {
    expect(findDuplicates({ customerId: 'c2', productName: 'Indian Necklace', expectedWeightMg: 45_000, orderDate: '2026-09-05' }, existing)).toHaveLength(0);
    expect(findDuplicates({ customerId: 'c1', productName: 'Indian Necklace', expectedWeightMg: 90_000, orderDate: '2026-09-05' }, existing)).toHaveLength(0);
    expect(findDuplicates({ customerId: 'c1', productName: 'Indian Necklace', expectedWeightMg: 45_000, orderDate: '2026-11-05' }, existing)).toHaveLength(0);
  });
});

describe('Dubai dates', () => {
  it('counts whole days between business dates', () => {
    expect(diffDays('2026-09-05', '2026-09-01')).toBe(4);
    expect(diffDays('2026-09-01', '2026-09-05')).toBe(-4);
  });

  it('describes the countdown in the shop’s words', () => {
    expect(countdownLabel('2026-09-05', '2026-09-05')).toBe('Due Today');
    expect(countdownLabel('2026-09-06', '2026-09-05')).toBe('Due Tomorrow');
    expect(countdownLabel('2026-09-10', '2026-09-05')).toBe('5 Days Remaining');
    expect(countdownLabel('2026-09-02', '2026-09-05')).toBe('3 Days Late');
    expect(countdownLabel(null)).toBe('No delivery date');
  });

  it('resolves named report ranges', () => {
    expect(presetRange('today', '2026-09-05')).toEqual({ start: '2026-09-05', end: '2026-09-05' });
    expect(presetRange('month', '2026-09-05')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(presetRange('year', '2026-09-05')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
});

describe('customer account', () => {
  const orders = (...xs: [number, number, string][]) =>
    xs.map(([total, paid, status]) => ({
      totalAmountFils: total,
      totalPaidFils: paid,
      remainingBalanceFils: Math.max(total - paid, 0),
      status,
    }));

  it('adds what orders still owe to what is owed outside them', () => {
    const a = accountFrom('c1', orders([2_350_000, 1_800_000, 'delivered'], [1_000_000, 0, 'maker']), [
      { direction: 'debit', amountFils: 500_000 },
    ]);
    expect(a.ordersRemainingFils).toBe(1_550_000);
    expect(a.ledgerDebitFils).toBe(500_000);
    expect(a.netBalanceFils).toBe(2_050_000);
    expect(a.creditFils).toBe(0);
  });

  it('takes a payment on account off the balance', () => {
    const a = accountFrom('c1', orders([1_000_000, 0, 'ready']), [{ direction: 'credit', amountFils: 400_000 }]);
    expect(a.netBalanceFils).toBe(600_000);
  });

  it('reports an overpaid account as credit, never a negative balance', () => {
    const a = accountFrom('c1', orders([1_000_000, 1_000_000, 'delivered']), [{ direction: 'credit', amountFils: 250_000 }]);
    expect(a.netBalanceFils).toBe(0);
    expect(a.creditFils).toBe(250_000);
  });

  it('never counts a cancelled order toward the balance', () => {
    const a = accountFrom('c1', orders([900_000, 0, 'cancelled'], [100_000, 0, 'ordered']), []);
    expect(a.ordersTotalFils).toBe(100_000);
    expect(a.netBalanceFils).toBe(100_000);
    expect(a.totalOrders).toBe(2);
  });

  it('carries an opening debt with no orders at all', () => {
    const a = accountFrom('c1', [], [{ direction: 'debit', amountFils: 750_000 }]);
    expect(a.netBalanceFils).toBe(750_000);
    expect(a.totalOrders).toBe(0);
  });

  it('settles to zero once everything is paid', () => {
    const a = accountFrom('c1', orders([1_000_000, 1_000_000, 'delivered']), [
      { direction: 'debit', amountFils: 200_000 },
      { direction: 'credit', amountFils: 200_000 },
    ]);
    expect(a.netBalanceFils).toBe(0);
    expect(a.creditFils).toBe(0);
  });

  it('counts active and delivered orders separately', () => {
    const a = accountFrom('c1', orders([1, 0, 'maker'], [1, 0, 'ready'], [1, 1, 'delivered'], [1, 0, 'cancelled']), []);
    expect(a.activeOrders).toBe(2);
    expect(a.deliveredOrders).toBe(1);
  });

  it('files each entry kind in the direction it belongs', () => {
    expect(LEDGER_DIRECTION.opening).toBe('debit');
    expect(LEDGER_DIRECTION.charge).toBe('debit');
    expect(LEDGER_DIRECTION.payment).toBe('credit');
    expect(LEDGER_DIRECTION.writeoff).toBe('credit');
  });
});
