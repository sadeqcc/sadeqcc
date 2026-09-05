'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '@/components/providers';
import { StatCard } from '@/components/bits';
import { Card, CardTitle, DateInput, EmptyState, ErrorState, Segmented, Skeleton, Toggle } from '@/components/ui';
import { apiGet } from '@/lib/client';
import { presetRange } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import type { ReportBucket, ReportResult } from '@/lib/insights';
import type { DictKey } from '@/i18n/dict';

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

const EXPORTS = [
  { key: 'orders', label: 'export_orders' },
  { key: 'payments', label: 'export_payments' },
  { key: 'customers', label: 'export_customers' },
  { key: 'statement', label: 'export_statement' },
  { key: 'makers', label: 'export_makers' },
  { key: 'travelers', label: 'export_travelers' },
] as const satisfies readonly { key: string; label: DictKey }[];

export default function ReportsPage() {
  const { settings, can, t } = useApp();
  const [preset, setPreset] = useState<Preset>('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [data, setData] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ start: range.start, end: range.end });
      if (includeCancelled) p.set('includeCancelled', '1');
      setData(await apiGet<ReportResult>(`/api/reports?${p.toString()}`));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [range, includeCancelled]);

  useEffect(() => {
    void load();
  }, [load]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  if (!can('reports.view')) {
    return <EmptyState title={t('reports_restricted')} text={t('reports_restricted_hint')} icon="🔒" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">{t('reports')}</h2>

      <Segmented
        value={preset}
        onChange={choosePreset}
        options={[
          { value: 'today', label: t('preset_today') },
          { value: 'week', label: t('preset_week') },
          { value: 'month', label: t('preset_month') },
          { value: 'year', label: t('preset_year') },
          { value: 'custom', label: t('preset_custom') },
        ]}
      />

      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label mb-1.5">{t('from')}</span>
            <DateInput value={range.start} onChange={(v) => setRange((r) => ({ ...r, start: v }))} />
          </label>
          <label className="block">
            <span className="label mb-1.5">{t('to')}</span>
            <DateInput value={range.end} onChange={(v) => setRange((r) => ({ ...r, end: v }))} />
          </label>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
        <span className="text-[13px] text-ink">{t('include_cancelled')}</span>
        <Toggle checked={includeCancelled} onChange={setIncludeCancelled} label={t('include_cancelled')} />
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : error || !data ? (
        <ErrorState text={t('could_not_build_report')} onRetry={() => void load()} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5">
            <StatCard label={t('total_orders')} value={String(data.totals.orders)} />
            <StatCard label={t('active_orders')} value={String(data.totals.active)} tone="gold" />
            <StatCard label={t('delivered_orders')} value={String(data.totals.delivered)} tone="ok" />
            <StatCard label={t('cancelled')} value={String(data.totals.cancelled)} />
            <StatCard label={t('card_overdue')} value={`🔴 ${data.totals.overdue}`} tone="bad" />
            <StatCard
              label={t('avg_delivery_time')}
              value={data.averageDeliveryDays === null ? '—' : `${data.averageDeliveryDays} d`}
            />
            <StatCard
              label={t('avg_delay')}
              value={data.averageDelayDays === null ? '—' : `${data.averageDelayDays} d`}
              tone={(data.averageDelayDays ?? 0) > 0 ? 'bad' : 'ok'}
            />
            <StatCard label={t('expected_gold')} value={`${formatWeight(data.totals.expectedWeightMg)} g`} tone="gold" />
            <div className="col-span-2">
              <StatCard label={t('actual_gold')} value={`${formatWeight(data.totals.actualWeightMg)} g`} tone="gold" />
            </div>
          </section>

          {can('finance.view') ? (
            <Card>
              <CardTitle title={t('financial_dashboard')} subtitle={`${range.start} → ${range.end}`} />
              <dl className="text-[13px]">
                <Row label={t('total_order_value')} value={`${settings.currency} ${formatMoney(data.totals.orderValueFils)}`} strong />
                <Row label={t('total_paid')} value={`${settings.currency} ${formatMoney(data.totals.paidFils)}`} />
                <Row label={t('payments_received')} value={`${settings.currency} ${formatMoney(data.totals.paymentsReceivedFils)}`} />
                <Row label={t('gold_exchange_value')} value={`${settings.currency} ${formatMoney(data.totals.exchangeValueFils)}`} />
                <Row
                  label={t('total_outstanding')}
                  value={`${settings.currency} ${formatMoney(data.totals.outstandingFils)}`}
                  tone={data.totals.outstandingFils > 0 ? 'bad' : 'ok'}
                  strong
                />
                <Row label={t('total_maker_cost')} value={`${settings.currency} ${formatMoney(data.totals.makerCostFils)}`} />
                <Row
                  label={t('estimated_profit')}
                  value={`${settings.currency} ${formatMoney(data.totals.estimatedProfitFils)}`}
                  tone={data.totals.estimatedProfitFils >= 0 ? 'ok' : 'bad'}
                  strong
                />
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                {t('cancelled_excluded')}
              </p>
            </Card>
          ) : null}

          <Breakdown title={t('by_karat')} buckets={data.byKarat} currency={settings.currency} />
          <Breakdown title={t('by_maker')} buckets={data.byMaker} currency={settings.currency} />
          <Breakdown title={t('by_traveler')} buckets={data.byTraveler} currency={settings.currency} />
          <Breakdown title={t('by_destination')} buckets={data.byDestination} currency={settings.currency} />
          <Breakdown title={t('by_category')} buckets={data.byCategory} currency={settings.currency} />
          <Breakdown title={t('by_customer')} buckets={data.byCustomer.slice(0, 15)} currency={settings.currency} />

          <Card>
            <CardTitle title={t('export')} subtitle={t('export_hint')} icon={<Download className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2">
              {EXPORTS.map((e) => (
                <a key={e.key} href={`/api/export/${e.key}`} className="btn-ghost btn-sm">
                  {t(e.label)}
                </a>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Breakdown({ title, buckets, currency }: { title: string; buckets: ReportBucket[]; currency: string }) {
  if (!buckets.length) return null;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <Card>
      <CardTitle title={title} />
      <ul className="space-y-2">
        {buckets.map((b) => (
          <li key={b.key}>
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="truncate font-semibold text-ink">{b.label}</span>
              <span className="num shrink-0 text-muted">
                {b.count} · {formatWeight(b.weightMg)} g · {currency} {formatMoney(b.valueFils)}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface2">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round((b.count / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'bad' | 'ok' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className={strong ? 'font-bold text-ink' : 'text-muted'}>{label}</dt>
      <dd className={`num ${strong ? 'text-[15px] font-extrabold' : 'font-semibold'} ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}
