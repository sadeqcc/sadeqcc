import {
  ADJUSTMENT_EFFECT,
  CASH_KIND_EFFECT,
  type CashAdjustment,
  type CashEntry,
  type CashEntryKind,
  type GoldMovement,
  type GoldRow,
  type MatchState,
} from './types';
import { sum } from './num';

export const ENGINE_VERSION = 'sadeq-engine-1.0.0';

export interface CashLine {
  key: string;
  label: string;
  sign: 1 | -1;
  amountFils: number;
  side: 'physical' | 'system';
  count: number;
}

export interface CashResult {
  physicalCashFils: number;
  systemCashFils: number;
  lines: CashLine[];
  totals: Record<CashEntryKind, number>;
  adjustPhysicalAdd: number;
  adjustPhysicalSub: number;
  adjustSystemAdd: number;
  adjustSystemSub: number;
  adjustedPhysicalFils: number;
  adjustedSystemFils: number;
  differenceFils: number;
  state: MatchState;
  withinTolerance: boolean;
}

const KIND_LABELS: Record<CashEntryKind, string> = {
  principal: 'principal',
  debt: 'debts',
  commission: 'commissions',
  amanat: 'amanat',
  unregistered_sale: 'unregistered_sales',
  duplicate_sale: 'duplicate_sales',
  system_error: 'system_errors',
};

/**
 * Adjusted Physical = Physical + Principal + Debts + Commissions + CustomAdd
 *                     - Amanat - Unregistered Sales - CustomSub
 * Adjusted System   = System - Duplicate Sales - System Errors + CustomAdd - CustomSub
 * Difference        = Adjusted Physical - Adjusted System
 */
export function computeCash(input: {
  physicalCashFils: number;
  systemCashFils: number | null;
  entries: CashEntry[];
  adjustments: CashAdjustment[];
  toleranceFils?: number;
}): CashResult {
  const live = input.entries.filter((e) => !e.deletedAt);
  const liveAdj = input.adjustments.filter((a) => !a.deletedAt);

  const totals = {} as Record<CashEntryKind, number>;
  (Object.keys(KIND_LABELS) as CashEntryKind[]).forEach((k) => {
    totals[k] = sum(live.filter((e) => e.kind === k).map((e) => e.amountFils));
  });

  const lines: CashLine[] = (Object.keys(KIND_LABELS) as CashEntryKind[]).map((k) => ({
    key: k,
    label: KIND_LABELS[k],
    sign: CASH_KIND_EFFECT[k].sign,
    side: CASH_KIND_EFFECT[k].side,
    amountFils: totals[k],
    count: live.filter((e) => e.kind === k).length,
  }));

  const bucket = (dir: keyof typeof ADJUSTMENT_EFFECT) =>
    sum(liveAdj.filter((a) => a.direction === dir).map((a) => a.amountFils));

  const adjustPhysicalAdd = bucket('add_physical');
  const adjustPhysicalSub = bucket('sub_physical');
  const adjustSystemAdd = bucket('add_system');
  const adjustSystemSub = bucket('sub_system');

  const physicalCashFils = input.physicalCashFils;
  const systemCashFils = input.systemCashFils ?? 0;

  const adjustedPhysicalFils =
    physicalCashFils +
    totals.principal +
    totals.debt +
    totals.commission +
    adjustPhysicalAdd -
    totals.amanat -
    totals.unregistered_sale -
    adjustPhysicalSub;

  const adjustedSystemFils =
    systemCashFils - totals.duplicate_sale - totals.system_error + adjustSystemAdd - adjustSystemSub;

  const differenceFils = adjustedPhysicalFils - adjustedSystemFils;
  const tol = Math.abs(input.toleranceFils ?? 0);

  return {
    physicalCashFils,
    systemCashFils,
    lines,
    totals,
    adjustPhysicalAdd,
    adjustPhysicalSub,
    adjustSystemAdd,
    adjustSystemSub,
    adjustedPhysicalFils,
    adjustedSystemFils,
    differenceFils,
    state: differenceFils === 0 ? 'matched' : differenceFils > 0 ? 'over' : 'short',
    withinTolerance: Math.abs(differenceFils) <= tol,
  };
}

export interface GoldKaratResult {
  karat: string;
  systemMg: number;
  drawerMg: number;
  withAshrafMg: number;
  withPeopleMg: number;
  withOfficesMg: number;
  withFactoryMg: number;
  withOtherMg: number;
  outTotalMg: number;
  thirdPartyMg: number;
  accountedMg: number;
  differenceMg: number;
  state: MatchState;
  withinTolerance: boolean;
  toleranceMg: number;
  movements: GoldMovement[];
}

/** Remaining (not yet returned) weight of a movement. */
export function remainingMg(m: GoldMovement): number {
  const rest = m.weightMg - m.returnedMg;
  return rest > 0 ? rest : 0;
}

export function isOutstanding(m: GoldMovement): boolean {
  return !m.deletedAt && m.status !== 'returned' && remainingMg(m) > 0;
}

/**
 * Accounted Store Gold = Drawer + Ashraf + People + Offices + Factory/Goldsmith - Third-party
 * Gold Difference      = Accounted - System        (per karat, never mixed)
 */
export function computeGoldKarat(input: {
  karat: string;
  row: Pick<GoldRow, 'systemMg' | 'drawerMg'> | null;
  movements: GoldMovement[];
  toleranceMg?: number;
}): GoldKaratResult {
  const mine = input.movements.filter((m) => m.karat === input.karat && isOutstanding(m));
  const out = mine.filter((m) => m.direction === 'out');
  const inbound = mine.filter((m) => m.direction === 'in');

  const byType = (t: string) => sum(out.filter((m) => m.holderType === t).map(remainingMg));

  const withAshrafMg = byType('ashraf');
  const withPeopleMg = byType('person');
  const withOfficesMg = byType('office');
  const withFactoryMg = byType('factory') + byType('goldsmith');
  const withOtherMg = byType('other');
  const outTotalMg = withAshrafMg + withPeopleMg + withOfficesMg + withFactoryMg + withOtherMg;
  const thirdPartyMg = sum(inbound.map(remainingMg));

  const systemMg = input.row?.systemMg ?? 0;
  const drawerMg = input.row?.drawerMg ?? 0;
  const accountedMg = drawerMg + outTotalMg - thirdPartyMg;
  const differenceMg = accountedMg - systemMg;
  const toleranceMg = Math.abs(input.toleranceMg ?? 0);

  return {
    karat: input.karat,
    systemMg,
    drawerMg,
    withAshrafMg,
    withPeopleMg,
    withOfficesMg,
    withFactoryMg,
    withOtherMg,
    outTotalMg,
    thirdPartyMg,
    accountedMg,
    differenceMg,
    state: differenceMg === 0 ? 'matched' : differenceMg > 0 ? 'over' : 'short',
    withinTolerance: Math.abs(differenceMg) <= toleranceMg,
    toleranceMg,
    movements: mine,
  };
}

export function computeGold(input: {
  karats: string[];
  rows: GoldRow[];
  movements: GoldMovement[];
  tolerances?: Record<string, number>;
}): GoldKaratResult[] {
  return input.karats.map((k) =>
    computeGoldKarat({
      karat: k,
      row: input.rows.find((r) => r.karat === k && !r.deletedAt) ?? null,
      movements: input.movements,
      toleranceMg: input.tolerances?.[k] ?? 0,
    }),
  );
}

export interface DaySummary {
  cash: CashResult;
  gold: GoldKaratResult[];
  sectionsTotal: number;
  sectionsMatched: number;
  allMatched: boolean;
  hasDifferences: boolean;
  touched: boolean;
}

export function summarizeDay(input: {
  physicalCashFils: number;
  systemCashFils: number | null;
  entries: CashEntry[];
  adjustments: CashAdjustment[];
  karats: string[];
  goldRows: GoldRow[];
  movements: GoldMovement[];
  tolerances?: Record<string, number>;
  cashTolerance?: number;
}): DaySummary {
  const cash = computeCash({
    physicalCashFils: input.physicalCashFils,
    systemCashFils: input.systemCashFils,
    entries: input.entries,
    adjustments: input.adjustments,
    toleranceFils: input.cashTolerance,
  });
  const gold = computeGold({
    karats: input.karats,
    rows: input.goldRows,
    movements: input.movements,
    tolerances: input.tolerances,
  });

  const sections = [cash.state === 'matched' || cash.withinTolerance, ...gold.map((g) => g.state === 'matched' || g.withinTolerance)];
  const sectionsMatched = sections.filter(Boolean).length;
  const touched =
    input.systemCashFils !== null ||
    input.physicalCashFils !== 0 ||
    input.entries.some((e) => !e.deletedAt) ||
    input.adjustments.some((a) => !a.deletedAt) ||
    input.goldRows.some((r) => !r.deletedAt && (r.systemMg !== 0 || r.drawerMg !== 0));

  return {
    cash,
    gold,
    sectionsTotal: sections.length,
    sectionsMatched,
    allMatched: sectionsMatched === sections.length,
    hasDifferences: sections.some((s) => !s),
    touched,
  };
}

/** Non-destructive hints. These never mutate data — the user decides. */
export interface Suggestion {
  key: string;
  scope: 'cash' | 'gold';
  karat?: string;
  amountFils?: number;
  weightMg?: number;
  refId?: string;
}

export function suggestForDifference(input: {
  cash: CashResult;
  gold: GoldKaratResult[];
  movements: GoldMovement[];
  entries: CashEntry[];
}): Suggestion[] {
  const out: Suggestion[] = [];
  const d = input.cash.differenceFils;

  if (d > 0) {
    out.push({ key: 'maybe_unregistered_sale', scope: 'cash', amountFils: d });
    out.push({ key: 'maybe_deposit_not_deducted', scope: 'cash', amountFils: d });
  } else if (d < 0) {
    out.push({ key: 'maybe_duplicate_entry', scope: 'cash', amountFils: -d });
    out.push({ key: 'maybe_counting_mistake', scope: 'cash', amountFils: -d });
  }

  // A recorded entry whose amount equals the difference is a strong hint.
  if (d !== 0) {
    const target = Math.abs(d);
    const hit = input.entries.find((e) => !e.deletedAt && e.amountFils === target);
    if (hit) out.push({ key: 'similar_entry_value', scope: 'cash', amountFils: target, refId: hit.id });
  }

  for (const g of input.gold) {
    if (g.differenceMg === 0) continue;
    if (g.differenceMg < 0) {
      if (g.karat === '21K' && g.withAshrafMg === 0) out.push({ key: 'maybe_missing_ashraf', scope: 'gold', karat: g.karat, weightMg: -g.differenceMg });
      out.push({ key: 'maybe_gold_with_person', scope: 'gold', karat: g.karat, weightMg: -g.differenceMg });
    } else {
      out.push({ key: 'maybe_borrowed_gold', scope: 'gold', karat: g.karat, weightMg: g.differenceMg });
    }
    const target = Math.abs(g.differenceMg);
    const hit = input.movements.find((m) => m.karat === g.karat && !m.deletedAt && remainingMg(m) === target);
    if (hit) out.push({ key: 'similar_movement_value', scope: 'gold', karat: g.karat, weightMg: target, refId: hit.id });
    if (target > 0 && target < 10) out.push({ key: 'maybe_precision', scope: 'gold', karat: g.karat, weightMg: target });
  }
  return out;
}

/** Derive the working status of a day from its data (finalized/locked always win). */
export function deriveStatus(current: string, s: DaySummary): string {
  if (current === 'finalized' || current === 'locked') return current;
  if (!s.touched) return 'not_started';
  if (s.allMatched) return 'matched';
  return 'has_differences';
}
