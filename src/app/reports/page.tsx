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

type Preset = 'today' | 'week' | 'month' | 'year' | 'custom';

const EXPORTS = [
  { key: 'orders', label: 'Orders CSV' },
  { key: 'payments', label: 'Payments CSV' },
  { key: 'customers', label: 'Customers CSV' },
  { key: 'makers', label: 'Makers CSV' },
  { key: 'travelers', label: 'Travelers CSV' },
];

export default function ReportsPage() {
  const { settings, can } = useApp();
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
    return <EmptyState title="Reports are restricted" text="Ask the owner or a manager for access." icon="🔒" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">Reports</h2>

      <Segmented
        value={preset}
        onChange={choosePreset}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'custom', label: 'Custom' },
        ]}
      />

      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label mb-1.5">From</span>
            <DateInput value={range.start} onChange={(v) => setRange((r) => ({ ...r, start: v }))} />
          </label>
          <label className="block">
            <span className="label mb-1.5">To</span>
            <DateInput value={range.end} onChange={(v) => setRange((r) => ({ ...r, end: v }))} />
          </label>
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
        <span className="text-[13px] text-ink">Include cancelled orders in totals</span>
        <Toggle checked={includeCancelled} onChange={setIncludeCancelled} label="Include cancelled orders" />
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : error || !data ? (
        <ErrorState text="Could not build the report." onRetry={() => void load()} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5">
            <StatCard label="Total Orders" value={String(data.totals.orders)} />
            <StatCard label="Active" value={String(data.totals.active)} tone="gold" />
            <StatCard label="Delivered" value={String(data.totals.delivered)} tone="ok" />
            <StatCard label="Cancelled" value={String(data.totals.cancelled)} />
            <StatCard label="Overdue" value={`🔴 ${data.totals.overdue}`} tone="bad" />
            <StatCard
              label="Avg Delivery Time"
              value={data.averageDeliveryDays === null ? '—' : `${data.averageDeliveryDays} d`}
            />
            <StatCard
              label="Avg Delay"
              value={data.averageDelayDays === null ? '—' : `${data.averageDelayDays} d`}
              tone={(data.averageDelayDays ?? 0) > 0 ? 'bad' : 'ok'}
            />
            <StatCard label="Expected Gold" value={`${formatWeight(data.totals.expectedWeightMg)} g`} tone="gold" />
            <div className="col-span-2">
              <StatCard label="Actual Gold Weight" value={`${formatWeight(data.totals.actualWeightMg)} g`} tone="gold" />
            </div>
          </section>

          {can('finance.view') ? (
            <Card>
              <CardTitle title="Financial dashboard" subtitle={`${range.start} → ${range.end}`} />
              <dl className="text-[13px]">
                <Row label="Total order value" value={`${settings.currency} ${formatMoney(data.totals.orderValueFils)}`} strong />
                <Row label="Total paid" value={`${settings.currency} ${formatMoney(data.totals.paidFils)}`} />
                <Row label="Payments received in range" value={`${settings.currency} ${formatMoney(data.totals.paymentsReceivedFils)}`} />
                <Row label="Gold exchange value" value={`${settings.currency} ${formatMoney(data.totals.exchangeValueFils)}`} />
                <Row
                  label="Total outstanding"
                  value={`${settings.currency} ${formatMoney(data.totals.outstandingFils)}`}
                  tone={data.totals.outstandingFils > 0 ? 'bad' : 'ok'}
                  strong
                />
                <Row label="Total maker cost" value={`${settings.currency} ${formatMoney(data.totals.makerCostFils)}`} />
                <Row
                  label="Estimated profit"
                  value={`${settings.currency} ${formatMoney(data.totals.estimatedProfitFils)}`}
                  tone={data.totals.estimatedProfitFils >= 0 ? 'ok' : 'bad'}
                  strong
                />
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                Cancelled orders are excluded unless the toggle above is on.
              </p>
            </Card>
          ) : null}

          <Breakdown title="Orders by karat" buckets={data.byKarat} currency={settings.currency} />
          <Breakdown title="Orders by maker" buckets={data.byMaker} currency={settings.currency} />
          <Breakdown title="Orders by traveler" buckets={data.byTraveler} currency={settings.currency} />
          <Breakdown title="Orders by destination" buckets={data.byDestination} currency={settings.currency} />
          <Breakdown title="Orders by category" buckets={data.byCategory} currency={settings.currency} />
          <Breakdown title="Orders by customer" buckets={data.byCustomer.slice(0, 15)} currency={settings.currency} />

          <Card>
            <CardTitle title="Export" subtitle="CSV opens directly in Excel" icon={<Download className="h-4 w-4" />} />
            <div className="grid grid-cols-2 gap-2">
              {EXPORTS.map((e) => (
                <a key={e.key} href={`/api/export/${e.key}`} className="btn-ghost btn-sm">
                  {e.label}
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
