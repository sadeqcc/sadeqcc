import { describe, expect, it } from 'vitest';
import { computeCash, computeGoldKarat, summarizeDay, remainingMg } from '@/lib/calc';
import { parseCash, parseGold, formatCash, formatGold, aed, grams } from '@/lib/num';
import type { CashAdjustment, CashEntry, GoldMovement } from '@/lib/types';

const base = {
  ownerId: 'o',
  status: 'active',
  createdAt: '',
  updatedAt: '',
  createdBy: 'u',
  deletedAt: null,
};

const entry = (kind: CashEntry['kind'], amount: string, over: Partial<CashEntry> = {}): CashEntry => ({
  ...base,
  id: `${kind}-${amount}-${Math.random()}`,
  dayId: 'd1',
  kind,
  amountFils: parseCash(amount)!,
  personName: null,
  description: null,
  refNo: null,
  entryDate: '2026-09-01',
  dueDate: null,
  note: null,
  attachmentId: null,
  ...over,
});

const adj = (direction: CashAdjustment['direction'], amount: string): CashAdjustment => ({
  ...base,
  id: `adj-${direction}-${amount}`,
  dayId: 'd1',
  name: direction,
  amountFils: parseCash(amount)!,
  direction,
  note: null,
  entryDate: '2026-09-01',
  attachmentId: null,
});

const move = (
  karat: string,
  weight: string,
  over: Partial<GoldMovement> = {},
): GoldMovement => ({
  ...base,
  id: `mv-${karat}-${weight}-${Math.random()}`,
  karat,
  direction: 'out',
  holderType: 'person',
  holderName: 'x',
  weightMg: parseGold(weight)!,
  returnedMg: 0,
  deliveryDate: '2026-09-01',
  expectedReturnDate: null,
  returnedAt: null,
  reason: null,
  refNo: null,
  note: null,
  attachmentId: null,
  status: 'outstanding',
  ...over,
});

describe('decimal-safe parsing and formatting', () => {
  it('parses AED to fils without float drift', () => {
    expect(parseCash('14400.55')).toBe(1440055);
    expect(parseCash('0.1')).toBe(10);
    expect(parseCash('1,250.05')).toBe(125005);
    expect(parseCash('٣٥٠٫٧٥')).toBe(35075);
  });

  it('parses grams to milligrams at 0.001 g precision', () => {
    expect(parseGold('125.430')).toBe(125430);
    expect(parseGold('0.001')).toBe(1);
    expect(parseGold('0.35')).toBe(350);
  });

  it('survives the classic 0.1 + 0.2 float trap', () => {
    const sum = parseCash('0.1')! + parseCash('0.2')!;
    expect(formatCash(sum)).toBe('0.30');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('formats with the required decimals', () => {
    expect(aed(1440000)).toBe('AED 14,400.00');
    expect(grams(125430)).toBe('125.430 g');
    expect(formatGold(-350)).toBe('-0.350');
  });
});

describe('cash equation', () => {
  it('matches the worked example from the spec', () => {
    const r = computeCash({
      physicalCashFils: parseCash('15000')!,
      systemCashFils: parseCash('14600')!,
      entries: [
        entry('debt', '500'),
        entry('commission', '200'),
        entry('amanat', '1000'),
        entry('unregistered_sale', '300'),
        entry('duplicate_sale', '200'),
      ],
      adjustments: [],
    });
    expect(formatCash(r.adjustedPhysicalFils)).toBe('14,400.00');
    expect(formatCash(r.adjustedSystemFils)).toBe('14,400.00');
    expect(r.differenceFils).toBe(0);
    expect(r.state).toBe('matched');
  });

  it('reports a shortage', () => {
    const r = computeCash({ physicalCashFils: parseCash('9800')!, systemCashFils: parseCash('10000')!, entries: [], adjustments: [] });
    expect(r.state).toBe('short');
    expect(r.differenceFils).toBe(-20000);
  });

  it('reports a surplus', () => {
    const r = computeCash({ physicalCashFils: parseCash('10250')!, systemCashFils: parseCash('10000')!, entries: [], adjustments: [] });
    expect(r.state).toBe('over');
    expect(aed(r.differenceFils)).toBe('AED 250.00');
  });

  it('subtracts a duplicate system sale from the system side only', () => {
    const r = computeCash({
      physicalCashFils: parseCash('1000')!,
      systemCashFils: parseCash('1200')!,
      entries: [entry('duplicate_sale', '200')],
      adjustments: [],
    });
    expect(r.adjustedPhysicalFils).toBe(parseCash('1000'));
    expect(r.adjustedSystemFils).toBe(parseCash('1000'));
    expect(r.state).toBe('matched');
  });

  it('subtracts an unregistered sale from the physical side only', () => {
    const r = computeCash({
      physicalCashFils: parseCash('1300')!,
      systemCashFils: parseCash('1000')!,
      entries: [entry('unregistered_sale', '300')],
      adjustments: [],
    });
    expect(r.state).toBe('matched');
  });

  it('subtracts customer amanat because it is not the shop money', () => {
    const r = computeCash({
      physicalCashFils: parseCash('5000')!,
      systemCashFils: parseCash('4000')!,
      entries: [entry('amanat', '1000')],
      adjustments: [],
    });
    expect(r.state).toBe('matched');
    expect(r.totals.amanat).toBe(parseCash('1000'));
  });

  it('applies custom adjustments on the chosen side and direction', () => {
    const r = computeCash({
      physicalCashFils: parseCash('1000')!,
      systemCashFils: parseCash('1000')!,
      entries: [],
      adjustments: [adj('add_physical', '50'), adj('sub_physical', '20'), adj('add_system', '10'), adj('sub_system', '5')],
    });
    expect(r.adjustedPhysicalFils).toBe(parseCash('1030'));
    expect(r.adjustedSystemFils).toBe(parseCash('1005'));
    expect(r.differenceFils).toBe(parseCash('25'));
  });

  it('ignores soft-deleted entries', () => {
    const r = computeCash({
      physicalCashFils: parseCash('1000')!,
      systemCashFils: parseCash('1000')!,
      entries: [entry('debt', '500', { deletedAt: '2026-09-01T00:00:00Z' })],
      adjustments: [],
    });
    expect(r.differenceFils).toBe(0);
  });

  it('honours a cash tolerance without hiding the real difference', () => {
    const r = computeCash({
      physicalCashFils: parseCash('1000.50')!,
      systemCashFils: parseCash('1000')!,
      entries: [],
      adjustments: [],
      toleranceFils: parseCash('1')!,
    });
    expect(r.differenceFils).toBe(50);
    expect(r.withinTolerance).toBe(true);
    expect(r.state).toBe('over');
  });
});

describe('gold equation', () => {
  it('matches the worked 21K example', () => {
    const r = computeGoldKarat({
      karat: '21K',
      row: { systemMg: parseGold('645.430')!, drawerMg: parseGold('500')! },
      movements: [
        move('21K', '125.430', { holderType: 'ashraf', holderName: 'Ashraf' }),
        move('21K', '40', { holderType: 'goldsmith' }),
        move('21K', '20', { direction: 'in', holderName: 'owner' }),
      ],
    });
    expect(formatGold(r.accountedMg)).toBe('645.430');
    expect(r.differenceMg).toBe(0);
    expect(r.state).toBe('matched');
    expect(formatGold(r.withAshrafMg)).toBe('125.430');
    expect(formatGold(r.withFactoryMg)).toBe('40.000');
    expect(formatGold(r.thirdPartyMg)).toBe('20.000');
  });

  it('keeps karats independent', () => {
    const movements = [move('21K', '100'), move('18K', '50')];
    const k21 = computeGoldKarat({ karat: '21K', row: { systemMg: parseGold('100')!, drawerMg: 0 }, movements });
    const k18 = computeGoldKarat({ karat: '18K', row: { systemMg: parseGold('50')!, drawerMg: 0 }, movements });
    expect(k21.differenceMg).toBe(0);
    expect(k18.differenceMg).toBe(0);
    expect(k21.outTotalMg).toBe(parseGold('100'));
    expect(k18.outTotalMg).toBe(parseGold('50'));
  });

  it('counts only the remaining weight after a partial return', () => {
    const m = move('22K', '100', { returnedMg: parseGold('30')!, status: 'partially_returned' });
    expect(formatGold(remainingMg(m))).toBe('70.000');
    const r = computeGoldKarat({ karat: '22K', row: { systemMg: parseGold('70')!, drawerMg: 0 }, movements: [m] });
    expect(r.differenceMg).toBe(0);
  });

  it('drops a fully returned movement', () => {
    const m = move('22K', '100', { returnedMg: parseGold('100')!, status: 'returned' });
    const r = computeGoldKarat({ karat: '22K', row: { systemMg: 0, drawerMg: 0 }, movements: [m] });
    expect(r.outTotalMg).toBe(0);
  });

  it('detects a 0.001 g shortage', () => {
    const r = computeGoldKarat({ karat: '995', row: { systemMg: parseGold('10.001')!, drawerMg: parseGold('10')! }, movements: [] });
    expect(r.differenceMg).toBe(-1);
    expect(r.state).toBe('short');
    expect(formatGold(r.differenceMg)).toBe('-0.001');
  });

  it('subtracts borrowed third-party gold', () => {
    const r = computeGoldKarat({
      karat: '14K',
      row: { systemMg: parseGold('80')!, drawerMg: parseGold('100')! },
      movements: [move('14K', '20', { direction: 'in' })],
    });
    expect(r.differenceMg).toBe(0);
  });
});

describe('day summary', () => {
  it('counts matched sections across cash and every karat', () => {
    const s = summarizeDay({
      physicalCashFils: parseCash('1000')!,
      systemCashFils: parseCash('1000')!,
      entries: [],
      adjustments: [],
      karats: ['995', '21K'],
      goldRows: [
        { ...base, id: 'g1', dayId: 'd1', karat: '995', systemMg: parseGold('10')!, drawerMg: parseGold('10')! },
        { ...base, id: 'g2', dayId: 'd1', karat: '21K', systemMg: parseGold('10')!, drawerMg: parseGold('9.5')! },
      ],
      movements: [],
    });
    expect(s.sectionsTotal).toBe(3);
    expect(s.sectionsMatched).toBe(2);
    expect(s.hasDifferences).toBe(true);
    expect(s.touched).toBe(true);
  });

  it('treats an untouched day as not started', () => {
    const s = summarizeDay({
      physicalCashFils: 0,
      systemCashFils: null,
      entries: [],
      adjustments: [],
      karats: ['21K'],
      goldRows: [],
      movements: [],
    });
    expect(s.touched).toBe(false);
  });
});

describe('history: returns are dated so past days stay stable', () => {
  it('only deducts returns that had happened by that date', async () => {
    const { movementsAsOf } = await import('@/lib/history');
    const m = move('21K', '125.430', { holderType: 'ashraf', deliveryDate: '2026-09-01' });
    const events = [{ movementId: m.id, weightMg: parseGold('25.430')!, eventDate: '2026-09-05' }];

    const onDay4 = movementsAsOf([m], '2026-09-04', events);
    expect(formatGold(onDay4[0].weightMg - onDay4[0].returnedMg)).toBe('125.430');

    const onDay5 = movementsAsOf([m], '2026-09-05', events);
    expect(formatGold(onDay5[0].weightMg - onDay5[0].returnedMg)).toBe('100.000');
  });

  it('drops a movement once it is fully returned, and before it was delivered', async () => {
    const { movementsAsOf } = await import('@/lib/history');
    const m = move('22K', '10', { deliveryDate: '2026-09-03' });
    const events = [{ movementId: m.id, weightMg: parseGold('10')!, eventDate: '2026-09-06' }];
    expect(movementsAsOf([m], '2026-09-02', events)).toHaveLength(0);
    expect(movementsAsOf([m], '2026-09-05', events)).toHaveLength(1);
    expect(movementsAsOf([m], '2026-09-06', events)).toHaveLength(0);
  });
});
