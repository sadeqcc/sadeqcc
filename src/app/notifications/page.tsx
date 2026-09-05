'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton, Toggle } from '@/components/ui';
import { useApp } from '@/components/providers';
import { apiGet } from '@/lib/client';
import type { FollowUpItem, Notification } from '@/lib/insights';

function labels() {
  return {
    overdue: 'Order overdue',
    dueToday: 'Delivery today',
    dueTomorrow: 'Delivery tomorrow',
    makerDeadline: 'Maker deadline passed',
    travelerDeparture: 'Traveler departure today',
    travelerArrival: 'Traveler arrival today',
    balance: 'Outstanding balance',
    ready: 'Order ready',
    arrived: 'Order arrived',
  };
}

export default function NotificationsPage() {
  const { settings, setSettings, can } = useApp();
  const [items, setItems] = useState<Notification[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ notifications: Notification[]; followUps: FollowUpItem[] }>('/api/notifications');
      setItems(d.notifications);
      setFollowUps(d.followUps);
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

  const names = labels();

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">Notifications</h2>

      {loading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorState text="Could not load notifications." onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nothing needs attention" text="Overdue orders, deadlines and balances will show up here." icon="✅" />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.href}
                className={`card flex items-start gap-3 p-3 transition hover:border-gold/50 ${
                  n.severity === 'high' ? 'border-st-overdue/50' : ''
                }`}
              >
                <span aria-hidden className="text-[18px]">
                  {n.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">{n.title}</span>
                  {n.body ? <span className="block truncate text-[12px] text-muted">{n.body}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {followUps.length ? (
        <Card>
          <CardTitle title="Today's Follow-Up" subtitle={`${followUps.length} actions`} />
          <ul className="divide-y divide-line/70">
            {followUps.slice(0, 12).map((f) => (
              <li key={`${f.code}-${f.orderId}`}>
                <Link href={`/orders/${f.orderId}`} className="flex items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{f.action}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {f.orderNumber} · {f.customerName} · {f.detail}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {can('settings.manage') ? (
        <Card>
          <CardTitle title="Notification settings" subtitle="Choose what the shop is told about" />
          <ul className="divide-y divide-line/70">
            {(Object.keys(names) as (keyof typeof names)[]).map((key) => (
              <li key={key} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[13px] text-ink">{names[key]}</span>
                <Toggle
                  checked={settings.notifications[key]}
                  label={names[key]}
                  onChange={(v) => void setSettings({ notifications: { [key]: v } })}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
