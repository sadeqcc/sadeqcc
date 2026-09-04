import { summarizeDay, type DaySummary } from './calc';
import type { AppSettings, CashAdjustment, CashEntry, GoldMovement, GoldRow } from './types';

export interface DayBundleRow {
  id: string;
  date: string;
  shift: string;
  status: string;
  employeeName: string | null;
  systemCashFils: number | null;
  physicalCashFils: number;
  reasonText: string | null;
  notes: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  updatedAt: string;
}

/** Movements as they stood on a business date, using the dated return ledger. */
export function movementsAsOf(
  all: GoldMovement[],
  date: string,
  returns: { movementId: string; weightMg: number; eventDate: string }[] = [],
): GoldMovement[] {
  return all
    .filter((m) => !m.deletedAt && m.deliveryDate <= date)
    .map((m) => {
      const returned = returns
        .filter((e) => e.movementId === m.id && e.eventDate <= date)
        .reduce((a, e) => a + e.weightMg, 0);
      return { ...m, weightMg: Number(m.weightMg), returnedMg: returned };
    })
    .filter((m) => m.returnedMg < m.weightMg);
}

export interface DayDigest {
  date: string;
  id: string;
  status: string;
  employeeName: string | null;
  cashDifferenceFils: number;
  goldDifferences: { karat: string; differenceMg: number }[];
  hasGoldDifference: boolean;
  matched: boolean;
  sectionsMatched: number;
  sectionsTotal: number;
  reasonText: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  updatedAt: string;
}

export function digestDay(
  day: DayBundleRow,
  parts: {
    entries: CashEntry[];
    adjustments: CashAdjustment[];
    goldRows: GoldRow[];
    movements: GoldMovement[];
    settings: AppSettings;
    snapshot?: unknown;
  },
): { digest: DayDigest; summary: DaySummary } {
  // A closed day reports what it reported when it was closed.
  const snap = parts.snapshot as { results?: DaySummary } | null | undefined;
  const locked = day.status === 'finalized' || day.status === 'locked';
  const summary = locked && snap?.results ? snap.results : summarizeDay({
    physicalCashFils: day.physicalCashFils,
    systemCashFils: day.systemCashFils,
    entries: parts.entries,
    adjustments: parts.adjustments,
    karats: parts.settings.karats,
    goldRows: parts.goldRows,
    movements: parts.movements,
    tolerances: parts.settings.tolerances,
    cashTolerance: parts.settings.cashTolerance,
  });
  const goldDifferences = summary.gold.map((g) => ({ karat: g.karat, differenceMg: g.differenceMg }));
  return {
    summary,
    digest: {
      date: day.date,
      id: day.id,
      status: day.status,
      employeeName: day.employeeName,
      cashDifferenceFils: summary.cash.differenceFils,
      goldDifferences,
      hasGoldDifference: goldDifferences.some((g) => g.differenceMg !== 0),
      matched: summary.allMatched,
      sectionsMatched: summary.sectionsMatched,
      sectionsTotal: summary.sectionsTotal,
      reasonText: day.reasonText,
      startedAt: day.startedAt,
      finalizedAt: day.finalizedAt,
      updatedAt: day.updatedAt,
    },
  };
}

export interface MonthStats {
  month: string;
  daysRecorded: number;
  daysMatched: number;
  daysShort: number;
  daysOver: number;
  daysFinalized: number;
  daysDraft: number;
  totalShortFils: number;
  totalOverFils: number;
  netCashFils: number;
  averageDifferenceFils: number;
  largestShort: { date: string; amountFils: number } | null;
  largestOver: { date: string; amountFils: number } | null;
  goldByKarat: { karat: string; netMg: number; mismatchDays: number }[];
  worstKarat: string | null;
  totals: { debts: number; commissions: number; amanat: number; unregistered: number; duplicates: number; principal: number };
}

export function monthStats(month: string, digests: DayDigest[], entryTotals: MonthStats['totals']): MonthStats {
  const recorded = digests.filter((d) => d.status !== 'not_started');
  const shorts = recorded.filter((d) => d.cashDifferenceFils < 0);
  const overs = recorded.filter((d) => d.cashDifferenceFils > 0);
  const totalShortFils = shorts.reduce((a, d) => a + d.cashDifferenceFils, 0);
  const totalOverFils = overs.reduce((a, d) => a + d.cashDifferenceFils, 0);

  const karats = new Map<string, { net: number; days: number }>();
  for (const d of recorded) {
    for (const g of d.goldDifferences) {
      const cur = karats.get(g.karat) ?? { net: 0, days: 0 };
      cur.net += g.differenceMg;
      if (g.differenceMg !== 0) cur.days += 1;
      karats.set(g.karat, cur);
    }
  }
  const goldByKarat = [...karats.entries()].map(([karat, v]) => ({ karat, netMg: v.net, mismatchDays: v.days }));
  const worst = [...goldByKarat].sort((a, b) => b.mismatchDays - a.mismatchDays)[0];

  const largestShort = shorts.length
    ? shorts.reduce((a, b) => (b.cashDifferenceFils < a.cashDifferenceFils ? b : a))
    : null;
  const largestOver = overs.length ? overs.reduce((a, b) => (b.cashDifferenceFils > a.cashDifferenceFils ? b : a)) : null;

  return {
    month,
    daysRecorded: recorded.length,
    daysMatched: recorded.filter((d) => d.matched).length,
    daysShort: shorts.length,
    daysOver: overs.length,
    daysFinalized: recorded.filter((d) => d.status === 'finalized' || d.status === 'locked').length,
    daysDraft: recorded.filter((d) => d.status === 'draft' || d.status === 'has_differences').length,
    totalShortFils,
    totalOverFils,
    netCashFils: totalShortFils + totalOverFils,
    averageDifferenceFils: recorded.length ? Math.round((totalShortFils + totalOverFils) / recorded.length) : 0,
    largestShort: largestShort ? { date: largestShort.date, amountFils: largestShort.cashDifferenceFils } : null,
    largestOver: largestOver ? { date: largestOver.date, amountFils: largestOver.cashDifferenceFils } : null,
    goldByKarat,
    worstKarat: worst && worst.mismatchDays > 0 ? worst.karat : null,
    totals: entryTotals,
  };
}
