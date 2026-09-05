'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet } from '@/lib/client';
import { daysInMonth, dubaiDate, dubaiShort, monthKey, shiftMonth, weekdayIndex } from '@/lib/date';
import { STATUS_KEY, type OrderStatus, type Urgency } from '@/lib/types';
import { useApp } from '@/components/providers';
import type { DictKey } from '@/i18n/dict';

interface Entry {
  date: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  kind: 'ready' | 'delivery' | 'departure' | 'arrival';
  status: OrderStatus;
  urgency: Urgency;
}

const KIND_LABEL: Record<Entry['kind'], DictKey> = {
  ready: 'cal_ready',
  delivery: 'cal_delivery',
  departure: 'cal_departure',
  arrival: 'cal_arrival',
};

const KIND_DOT: Record<Entry['kind'], string> = {
  ready: 'bg-st-ready',
  delivery: 'bg-gold',
  departure: 'bg-st-traveler',
  arrival: 'bg-st-arrived',
};

/** Sunday-first, as the shop's week runs. */
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

export default function CalendarPage() {
  const { t, lang } = useApp();
  const weekdayFmt = new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });
  const weekdays = WEEKDAY_INDEXES.map((i) => weekdayFmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
  const today = dubaiDate();
  const [month, setMonth] = useState(() => monthKey(today));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ entries: Entry[] }>(`/api/calendar?month=${month}`);
      setEntries(d.entries);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const cur = m.get(e.date);
      if (cur) cur.push(e);
      else m.set(e.date, [e]);
    }
    return m;
  }, [entries]);

  const days = daysInMonth(month);
  const leading = weekdayIndex(days[0]);
  const selectedEntries = byDate.get(selected) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={t('prev_month')}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="num text-[16px] font-extrabold text-ink">{month}</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label={t('next_month')}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <ErrorState text={t('could_not_load_calendar')} onRetry={() => void load()} />
      ) : loading ? (
        <Skeleton className="h-64" />
      ) : (
        <Card>
          <ol className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-muted">
            {weekdays.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ol>
          <ol className="grid grid-cols-7 gap-1">
            {Array.from({ length: leading }).map((_, i) => (
              <li key={`pad-${i}`} />
            ))}
            {days.map((d) => {
              const list = byDate.get(d) ?? [];
              const isToday = d === today;
              const isSelected = d === selected;
              const overdue = list.some((e) => e.kind === 'delivery' && (e.urgency === 'critical' || e.urgency === 'high' || e.urgency === 'late'));
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-current={isToday ? 'date' : undefined}
                    className={`flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg border text-[12px] transition ${
                      isSelected ? 'border-gold bg-gold/10' : isToday ? 'border-gold/50' : 'border-line'
                    } ${overdue ? 'bg-st-overdue/10' : ''}`}
                  >
                    <span className={`num font-semibold ${isToday ? 'text-gold' : 'text-ink'}`}>{Number(d.slice(8))}</span>
                    {list.length ? (
                      <span className="flex gap-0.5" aria-hidden>
                        {[...new Set(list.map((e) => e.kind))].slice(0, 4).map((k) => (
                          <span key={k} className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[k]}`} />
                        ))}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
            {(Object.keys(KIND_LABEL) as Entry['kind'][]).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${KIND_DOT[k]}`} aria-hidden />
                {t(KIND_LABEL[k])}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle
          title={dubaiShort(selected)}
          subtitle={selectedEntries.length === 1 ? t('entry_count_1') : t('entries_count', { n: selectedEntries.length })}
        />
        {selectedEntries.length === 0 ? (
          <EmptyState title={t('nothing_scheduled')} text={t('nothing_scheduled_hint')} icon="📅" />
        ) : (
          <ul className="divide-y divide-line/70">
            {selectedEntries.map((e, i) => (
              <li key={`${e.orderId}-${e.kind}-${i}`}>
                <Link href={`/orders/${e.orderId}`} className="flex items-center gap-2 py-2.5">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {e.customerName} · {e.productName}
                    </span>
                    <span className="num block truncate text-[12px] text-muted">
                      {e.orderNumber} · {t(KIND_LABEL[e.kind])} · {t(STATUS_KEY[e.status])}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
