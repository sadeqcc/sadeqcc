'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet } from '@/lib/client';
import { dubaiLong } from '@/lib/date';
import { URGENCY_ICON, type Urgency } from '@/lib/types';
import type { FollowUpItem } from '@/lib/insights';
import { useApp } from '@/components/providers';
import type { DictKey } from '@/i18n/dict';

/** The server sends a stable code; the label is chosen in the reader's language. */
const ACTION_KEYS: Record<string, DictKey> = {
  call_maker: 'fu_call_maker',
  check_ready: 'fu_check_ready',
  confirm_arrival: 'fu_confirm_arrival',
  deliver_order: 'fu_deliver_order',
  contact_customer: 'fu_contact_customer',
  collect_balance: 'fu_collect_balance',
};

const DONE_KEY = 'go.followups.done';

/** Ticking an item is a local, same-day gesture — the underlying order is untouched. */
function readDone(today: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') as { date?: string; keys?: string[] };
    return raw.date === today ? new Set(raw.keys ?? []) : new Set();
  } catch {
    return new Set();
  }
}

export default function FollowUpPage() {
  const { t, lang } = useApp();
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [today, setToday] = useState('');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ followUps: FollowUpItem[]; today: string }>('/api/notifications');
      setItems(d.followUps);
      setToday(d.today);
      setDone(readDone(d.today));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(DONE_KEY, JSON.stringify({ date: today, keys: [...next] }));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const outstanding = items.filter((f) => !done.has(`${f.code}-${f.orderId}`));

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[18px] font-extrabold text-ink">{t('todays_followup')}</h2>
        <p className="num text-[12px] text-muted">{today ? dubaiLong(today, lang) : ''}</p>
      </header>

      {loading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState text={t('could_not_load_followup')} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState title={t('nothing_to_chase')} text={t('nothing_to_chase_hint')} icon="🎉" />
      ) : (
        <Card>
          <CardTitle title={t('followup_open', { n: outstanding.length })} subtitle={t('followup_done', { n: done.size })} />
          <ul className="divide-y divide-line/70">
            {items.map((f) => {
              const key = `${f.code}-${f.orderId}`;
              const isDone = done.has(key);
              return (
                <li key={key} className="flex items-center gap-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle(key)}
                    aria-pressed={isDone}
                    aria-label={isDone ? t('mark_not_done') : t('mark_done')}
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
                      isDone ? 'border-ok bg-ok/15 text-ok' : 'border-line text-muted'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <Link href={`/orders/${f.orderId}`} className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] font-semibold ${isDone ? 'text-muted line-through' : 'text-ink'}`}>
                        <span aria-hidden>{URGENCY_ICON[f.urgency as Urgency]} </span>
                        {ACTION_KEYS[f.code] ? t(ACTION_KEYS[f.code]) : f.action}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {f.orderNumber} · {f.customerName} · {f.detail}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
