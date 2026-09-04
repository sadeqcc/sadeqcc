'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, CalendarDays, Download, FileText, Printer, Search } from 'lucide-react';
import { Card, CardTitle, EmptyState, Modal, Segmented, Select, Skeleton, TextInput } from '@/components/ui';
import { CashDiff, KeyValue, StatusPill, statusTone, setActiveDate } from '@/components/bits';
import { DiffChart, MonthCalendar } from '@/components/calendar';
import { useApp } from '@/components/providers';
import { apiGet, download, toCsv } from '@/lib/client';
import { aed, formatCash, formatGold, grams } from '@/lib/num';
import { dubaiDate, dubaiStamp, shiftMonth } from '@/lib/date';
import type { DayDigest, MonthStats } from '@/lib/history';
import type { AppSettings, CashEntry, GoldMovement } from '@/lib/types';
import type { DayPayload } from '@/lib/useDay';
import type { DictKey } from '@/i18n/dict';

interface HistoryResponse {
  start: string;
  end: string;
  days: DayDigest[];
  stats: MonthStats;
  settings: AppSettings;
  outstanding: GoldMovement[];
}

type Tab = 'calendar' | 'analytics' | 'reports';

export default function ReportsPage() {
  const { t, lang } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('calendar');
  const [month, setMonth] = useState(dubaiDate().slice(0, 7));
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [prev, setPrev] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayPayload | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, before] = await Promise.all([
        apiGet<HistoryResponse>(`/api/history?month=${month}`),
        apiGet<HistoryResponse>(`/api/history?month=${shiftMonth(month, -1)}`),
      ]);
      setData(cur);
      setPrev(before);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    apiGet<DayPayload>(`/api/day?date=${selected}`).then(setDetail).catch(() => setDetail(null));
  }, [selected]);

  const filtered = useMemo(() => {
    const rows = data?.days ?? [];
    return rows.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        d.date.includes(q) ||
        (d.employeeName ?? '').toLowerCase().includes(q) ||
        (d.reasonText ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, query, statusFilter]);

  const stats = data?.stats;

  const exportCsv = (name: string, rows: (string | number)[][]) => {
    download(`sadeq-${name}-${month}.csv`, toCsv(rows), 'text/csv');
  };

  const reportBuilders: { key: DictKey; build: () => Promise<void> }[] = [
    {
      key: 'r_daily_closing',
      build: async () => {
        const rows: (string | number)[][] = [['date', 'status', 'employee', 'cash_difference_aed', 'gold_differences_g', 'reason', 'finalized_at']];
        for (const d of data?.days ?? []) {
          rows.push([
            d.date,
            d.status,
            d.employeeName ?? '',
            formatCash(d.cashDifferenceFils, false),
            d.goldDifferences.map((g) => `${g.karat}:${formatGold(g.differenceMg, false)}`).join(' '),
            d.reasonText ?? '',
            d.finalizedAt ?? '',
          ]);
        }
        exportCsv('daily-closing', rows);
      },
    },
    {
      key: 'r_cash_difference',
      build: async () => {
        const rows: (string | number)[][] = [['date', 'cash_difference_aed', 'state']];
        for (const d of data?.days ?? []) {
          rows.push([d.date, formatCash(d.cashDifferenceFils, false), d.cashDifferenceFils === 0 ? 'matched' : d.cashDifferenceFils > 0 ? 'surplus' : 'shortage']);
        }
        exportCsv('cash-difference', rows);
      },
    },
    {
      key: 'r_gold_by_karat',
      build: async () => {
        const rows: (string | number)[][] = [['date', 'karat', 'difference_g']];
        for (const d of data?.days ?? []) {
          for (const g of d.goldDifferences) rows.push([d.date, g.karat, formatGold(g.differenceMg, false)]);
        }
        exportCsv('gold-by-karat', rows);
      },
    },
    {
      key: 'r_ashraf',
      build: async () => {
        const rows: (string | number)[][] = [['holder', 'karat', 'weight_g', 'returned_g', 'remaining_g', 'delivery_date', 'expected_return', 'status']];
        for (const m of (data?.outstanding ?? []).filter((x) => x.holderType === 'ashraf')) {
          rows.push([m.holderName, m.karat, formatGold(Number(m.weightMg), false), formatGold(Number(m.returnedMg), false), formatGold(Number(m.weightMg) - Number(m.returnedMg), false), m.deliveryDate, m.expectedReturnDate ?? '', m.status]);
        }
        exportCsv('ashraf-gold', rows);
      },
    },
    {
      key: 'r_outstanding',
      build: async () => {
        const rows: (string | number)[][] = [['holder', 'type', 'direction', 'karat', 'remaining_g', 'delivery_date', 'expected_return', 'status']];
        for (const m of data?.outstanding ?? []) {
          rows.push([m.holderName, m.holderType, m.direction, m.karat, formatGold(Number(m.weightMg) - Number(m.returnedMg), false), m.deliveryDate, m.expectedReturnDate ?? '', m.status]);
        }
        exportCsv('outstanding-gold', rows);
      },
    },
    { key: 'r_amanat', build: () => exportEntries('amanat') },
    { key: 'r_debts', build: () => exportEntries('debt') },
    { key: 'r_unregistered', build: () => exportEntries('unregistered_sale') },
    { key: 'r_duplicates', build: () => exportEntries('duplicate_sale') },
    {
      key: 'r_monthly',
      build: async () => {
        if (!stats) return;
        const rows: (string | number)[][] = [
          ['month', stats.month],
          ['days_recorded', stats.daysRecorded],
          ['days_matched', stats.daysMatched],
          ['days_shortage', stats.daysShort],
          ['days_surplus', stats.daysOver],
          ['total_shortage_aed', formatCash(stats.totalShortFils, false)],
          ['total_surplus_aed', formatCash(stats.totalOverFils, false)],
          ['net_aed', formatCash(stats.netCashFils, false)],
          ['average_aed', formatCash(stats.averageDifferenceFils, false)],
          ...stats.goldByKarat.map((g) => [`gold_${g.karat}_g`, formatGold(g.netMg, false)] as (string | number)[]),
        ];
        exportCsv('monthly-summary', rows);
      },
    },
  ];

  async function exportEntries(kind: string) {
    const rows: (string | number)[][] = [['date', 'name', 'amount_aed', 'description', 'ref', 'note']];
    const res = await apiGet<{ rows: (CashEntry & { businessDate?: string })[] }>(`/api/records/cash_entries`);
    for (const e of res.rows.filter((x) => x.kind === kind)) {
      rows.push([e.entryDate, e.personName ?? '', formatCash(Number(e.amountFils), false), e.description ?? '', e.refNo ?? '', e.note ?? '']);
    }
    exportCsv(kind, rows);
  }

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'calendar', label: t('calendar') },
          { value: 'analytics', label: t('analytics') },
          { value: 'reports', label: t('reports') },
        ]}
      />

      {tab === 'calendar' ? (
        <Card>
          <CardTitle title={t('reports_title')} icon={<CalendarDays className="h-4 w-4" />} />
          <MonthCalendar
            month={month}
            digests={data?.days ?? []}
            onMonthChange={setMonth}
            onSelect={setSelected}
            selected={selected}
          />
        </Card>
      ) : null}

      {tab === 'analytics' && stats ? (
        <>
          <Card>
            <CardTitle title={`${t('analytics')} · ${month}`} icon={<BarChart3 className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2">
              <Stat label={t('days_matched')} value={String(stats.daysMatched)} tone="gold" />
              <Stat label={t('days_finalized')} value={String(stats.daysFinalized)} tone="lock" />
              <Stat label={t('days_short')} value={String(stats.daysShort)} tone="bad" />
              <Stat label={t('days_over')} value={String(stats.daysOver)} tone="ok" />
            </div>
            <div className="mt-3">
              <KeyValue label={t('total_short')} value={aed(stats.totalShortFils)} tone="bad" />
              <KeyValue label={t('total_over')} value={aed(stats.totalOverFils)} tone="ok" />
              <KeyValue label={t('net_difference')} value={aed(stats.netCashFils)} strong tone="gold" />
              <KeyValue label={t('avg_difference')} value={aed(stats.averageDifferenceFils)} />
              <KeyValue label={t('largest_short')} value={stats.largestShort ? `${stats.largestShort.date} · ${aed(stats.largestShort.amountFils)}` : '—'} />
              <KeyValue label={t('largest_over')} value={stats.largestOver ? `${stats.largestOver.date} · ${aed(stats.largestOver.amountFils)}` : '—'} />
              <KeyValue label={t('worst_karat')} value={stats.worstKarat ?? '—'} />
              {prev ? (
                <KeyValue
                  label={t('compare_prev_month')}
                  value={`${aed(stats.netCashFils - prev.stats.netCashFils)}`}
                  tone={stats.netCashFils - prev.stats.netCashFils >= 0 ? 'ok' : 'bad'}
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardTitle title={t('daily_chart')} />
            <DiffChart digests={data?.days ?? []} />
          </Card>

          <Card>
            <CardTitle title={t('gold_difference')} />
            {stats.goldByKarat.map((g) => (
              <KeyValue key={g.karat} label={g.karat} value={grams(g.netMg)} tone={g.netMg === 0 ? 'gold' : g.netMg > 0 ? 'ok' : 'bad'} />
            ))}
          </Card>

          <Card>
            <CardTitle title={t('quick_summary')} />
            <KeyValue label={t('debts')} value={aed(stats.totals.debts)} />
            <KeyValue label={t('commissions')} value={aed(stats.totals.commissions)} />
            <KeyValue label={t('amanat')} value={aed(stats.totals.amanat)} />
            <KeyValue label={t('unregistered_sales')} value={aed(stats.totals.unregistered)} />
            <KeyValue label={t('duplicate_sales')} value={aed(stats.totals.duplicates)} />
            <KeyValue label={t('principal')} value={aed(stats.totals.principal)} />
          </Card>
        </>
      ) : null}

      {tab === 'reports' ? (
        <>
          <Card>
            <CardTitle title={t('search')} icon={<Search className="h-4 w-4" />} />
            <div className="grid gap-2">
              <TextInput value={query} onChange={setQuery} placeholder={t('search')} ariaLabel={t('search')} />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel={t('filter')}
                options={[
                  { value: 'all', label: t('all') },
                  { value: 'draft', label: t('st_draft') },
                  { value: 'matched', label: t('st_matched') },
                  { value: 'has_differences', label: t('st_has_differences') },
                  { value: 'finalized', label: t('st_finalized') },
                ]}
              />
            </div>
            <ul className="mt-3 space-y-1">
              {filtered.length === 0 ? (
                <EmptyState text={t('no_record')} />
              ) : (
                filtered.map((d) => (
                  <li key={d.date}>
                    <button className="row w-full text-start" onClick={() => setSelected(d.date)}>
                      <div>
                        <p className="num text-[13px] font-bold text-ink">{d.date}</p>
                        <p className="text-[11px] text-muted">{d.employeeName ?? ''}</p>
                      </div>
                      <CashDiff fils={d.cashDifferenceFils} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card>
            <CardTitle title={t('reports')} icon={<FileText className="h-4 w-4" />} />
            <ul className="space-y-1.5">
              {reportBuilders.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2">
                  <span className="text-[13px] font-semibold text-ink">{t(r.key)}</span>
                  <button className="btn-ghost h-9 min-h-0 px-3 text-[12px]" onClick={() => void r.build()}>
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn-ghost mt-3 w-full" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              {t('print_pdf')}
            </button>
          </Card>
        </>
      ) : null}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`${t('day_details')} · ${selected ?? ''}`} wide>
        {!detail ? (
          <Skeleton className="h-40" />
        ) : !detail.day ? (
          <EmptyState text={t('no_record')} />
        ) : (
          <DayDetail payload={detail} onOpen={() => {
            setActiveDate(detail.date);
            router.push('/cash');
          }} />
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'gold' | 'ok' | 'bad' | 'lock' }) {
  const color = tone === 'gold' ? 'text-gold' : tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : 'text-lock';
  return (
    <div className="rounded-xl border border-line bg-surface2 p-3">
      <span className="label">{label}</span>
      <p className={`num mt-1 text-[22px] font-extrabold ${color}`}>{value}</p>
    </div>
  );
}

function DayDetail({ payload, onOpen }: { payload: DayPayload; onOpen: () => void }) {
  const { t } = useApp();
  const day = payload.day!;
  const [audit, setAudit] = useState<{ id: string; action: string; entity: string; createdAt: string; actor: string; reason: string | null }[]>([]);

  useEffect(() => {
    apiGet<{ rows: typeof audit }>(`/api/audit?entityId=${day.id}&limit=30`).then((r) => setAudit(r.rows)).catch(() => undefined);
  }, [day.id]);

  const summaryFromSnapshot = day.snapshot as { results?: { cash: { differenceFils: number }; gold: { karat: string; differenceMg: number }[] } } | null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <StatusPill tone={statusTone(day.status)} label={t(`st_${day.status}` as DictKey)} />
        <span className="text-[12px] text-muted">{dubaiStamp(day.finalizedAt ?? day.updatedAt)}</span>
      </div>

      <div className="rounded-xl border border-line bg-surface2 p-3">
        <KeyValue label={t('system_cash')} value={formatCash(day.systemCashFils ?? 0)} />
        <KeyValue label={t('physical_cash')} value={formatCash(day.physicalCashFils)} />
        {summaryFromSnapshot?.results ? (
          <KeyValue
            label={t('cash_difference')}
            value={formatCash(summaryFromSnapshot.results.cash.differenceFils)}
            strong
            tone={summaryFromSnapshot.results.cash.differenceFils === 0 ? 'gold' : summaryFromSnapshot.results.cash.differenceFils > 0 ? 'ok' : 'bad'}
          />
        ) : null}
      </div>

      {payload.goldRows.length ? (
        <div className="rounded-xl border border-line bg-surface2 p-3">
          {payload.goldRows.map((g) => (
            <KeyValue key={g.id} label={g.karat} value={`${formatGold(Number(g.drawerMg))} / ${formatGold(Number(g.systemMg))}`} />
          ))}
        </div>
      ) : null}

      {payload.entries.length ? (
        <div className="rounded-xl border border-line bg-surface2 p-3">
          {payload.entries.map((e) => (
            <KeyValue key={e.id} label={`${e.kind} · ${e.personName ?? e.refNo ?? ''}`} value={formatCash(Number(e.amountFils))} />
          ))}
        </div>
      ) : null}

      {day.reasonText ? (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px] text-warn">{day.reasonText}</div>
      ) : null}

      {audit.length ? (
        <div className="rounded-xl border border-line bg-surface2 p-3">
          <p className="label mb-2">{t('audit_log')}</p>
          <ul className="space-y-1">
            {audit.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span>{a.action} · {a.entity}</span>
                <span className="num">{dubaiStamp(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button className="btn-primary w-full" onClick={onOpen}>
        {t('open_full_day')}
      </button>
    </div>
  );
}
