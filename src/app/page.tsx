'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, OrderCardSkeleton, StatCard } from '@/components/bits';
import { Card, CardTitle, EmptyState, ErrorState, PullToRefresh, useMounted } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import { dubaiClock, dubaiGreeting, dubaiLong, dubaiTimelineStamp, dubaiWeekday } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import type { Dashboard } from '@/lib/insights';

const CACHE_KEY = 'dashboard';

export default function HomePage() {
  const { user, settings, money, toast } = useApp();
  const mounted = useMounted();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Dashboard>('/api/dashboard');
      setData(d);
      cache.set(CACHE_KEY, d);
      setError(false);
    } catch {
      // Offline: show the last snapshot rather than an empty screen.
      const cached = cache.get<Dashboard>(CACHE_KEY);
      if (cached) setData(cached);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return <DashboardSkeleton />;

  const cards = data?.cards;

  return (
    <PullToRefresh
      onRefresh={async () => {
        await load();
        toast('Up to date', 'info');
      }}
    >
      <div className="space-y-4">
        <header>
          <p className="text-[13px] text-muted">
            {mounted ? `${dubaiGreeting()}, ` : ''}
            {user.displayName ?? user.username}
          </p>
          <h2 className="text-[19px] font-extrabold text-ink">{mounted ? dubaiWeekday() : '—'}</h2>
          <p className="num text-[13px] text-muted">
            {mounted ? `${dubaiLong()} · ${dubaiClock()} · Dubai` : '—'}
          </p>
        </header>

        {/* Section 50 — the banner is the first thing the shop sees. */}
        {cards && cards.overdue > 0 ? (
          <Link
            href="/orders?quick=overdue"
            className="flex items-center gap-3 rounded-card border border-st-overdue/60 bg-st-overdue/10 p-4 transition hover:bg-st-overdue/15"
          >
            <AlertTriangle className="h-6 w-6 shrink-0 text-st-overdue" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold uppercase tracking-wide text-st-overdue">🚨 Action Required</p>
              <p className="text-[13px] text-ink">
                {cards.overdue} {cards.overdue === 1 ? 'order is' : 'orders are'} overdue
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-st-overdue" />
          </Link>
        ) : cards ? (
          <div className="flex items-center gap-3 rounded-card border border-ok/40 bg-ok/10 p-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" />
            <p className="text-[14px] font-bold text-ok">✅ No overdue orders — everything is on schedule</p>
          </div>
        ) : null}

        {loading && !data ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState text="Could not load the dashboard." onRetry={() => void load()} />
        ) : cards ? (
          <>
            <section aria-label="Dashboard totals" className="grid grid-cols-2 gap-2.5">
              <StatCard label="Active Orders" value={String(cards.activeOrders)} href="/orders?quick=active" tone="gold" />
              <StatCard label="Overdue" value={`🔴 ${cards.overdue}`} href="/orders?quick=overdue" tone="bad" />
              <StatCard label="Ready" value={String(cards.ready)} href="/orders?quick=ready" tone="ok" />
              <StatCard label="With Travelers" value={String(cards.withTravelers)} href="/orders?quick=traveler" tone="info" />
              <StatCard label="With Makers" value={String(cards.withMakers)} href="/orders?quick=maker" tone="warn" />
              <StatCard label="Arrived" value={String(cards.arrived)} href="/orders?quick=arrived" />
              <StatCard label="Delivered Today" value={String(cards.deliveredToday)} href="/orders?quick=delivered" tone="ok" />
              <StatCard
                label="Balance To Collect"
                value={`${settings.currency} ${formatMoney(cards.outstandingBalanceFils)}`}
                href="/orders?quick=balance"
                tone={cards.outstandingBalanceFils > 0 ? 'bad' : 'ok'}
              />
              <div className="col-span-2">
                <StatCard label="Expected Gold Weight" value={`${formatWeight(cards.expectedGoldMg)} g`} tone="gold" hint="Across all active orders" />
              </div>
            </section>

            {data.urgent.length ? (
              <section>
                <CardTitle title="Urgent Orders" subtitle="Overdue first — automatically" icon={<AlertTriangle className="h-4 w-4" />} />
                <div className="space-y-2.5">
                  {data.urgent.map((o) => (
                    <OrderCard key={o.id} order={o} currency={settings.currency} />
                  ))}
                </div>
              </section>
            ) : null}

            {data.dueTodayOrders.length ? (
              <section>
                <CardTitle title="Today's Orders" subtitle="Due for delivery today" />
                <div className="space-y-2.5">
                  {data.dueTodayOrders.map((o) => (
                    <OrderCard key={o.id} order={o} currency={settings.currency} />
                  ))}
                </div>
              </section>
            ) : null}

            {data.followUps.length ? (
              <Card>
                <CardTitle
                  title="Today's Follow-Up"
                  subtitle={`${data.followUps.length} ${data.followUps.length === 1 ? 'action' : 'actions'} need attention`}
                  icon={<ClipboardList className="h-4 w-4" />}
                  action={
                    <Link href="/follow-up" className="text-[12px] font-bold text-gold">
                      View all
                    </Link>
                  }
                />
                <ul className="divide-y divide-line/70">
                  {data.followUps.slice(0, 5).map((f) => (
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

            {data.notifications.length ? (
              <Card>
                <CardTitle
                  title="Notifications"
                  icon={<Bell className="h-4 w-4" />}
                  action={
                    <Link href="/notifications" className="text-[12px] font-bold text-gold">
                      View all
                    </Link>
                  }
                />
                <ul className="divide-y divide-line/70">
                  {data.notifications.slice(0, 4).map((notif) => (
                    <li key={notif.id}>
                      <Link href={notif.href} className="flex items-start gap-2 py-2.5">
                        <span aria-hidden className="text-[15px]">
                          {notif.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">{notif.title}</span>
                          {notif.body ? <span className="block truncate text-[12px] text-muted">{notif.body}</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card>
              <CardTitle title="Recent Activity" subtitle="Dubai time" />
              {data.activity.length ? (
                <ul className="divide-y divide-line/70">
                  {data.activity.map((a) => (
                    <li key={a.id}>
                      <Link href={`/orders/${a.orderId}`} className="flex items-start gap-2 py-2.5">
                        <span aria-hidden className="text-[15px]">
                          {a.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-ink">
                            <span className="font-semibold">{a.customerName}</span> — {a.text}
                          </span>
                          <span className="num block text-[11px] text-muted">
                            {a.orderNumber} · {dubaiTimelineStamp(a.at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No activity yet" text="Order updates will appear here as your day goes on." icon="🕘" />
              )}
            </Card>

            {cards.activeOrders === 0 ? (
              <EmptyState
                title="No Orders Yet"
                text="Create your first gold order to start tracking it."
                icon="🥇"
                action={
                  <Link href="/orders/new" className="btn-primary">
                    + New Order
                  </Link>
                }
              />
            ) : null}
          </>
        ) : null}

        <p className="pb-2 text-center text-[11px] text-muted">
          All dates and times use Asia/Dubai · {money(0).split(' ')[0]} · weights in grams
        </p>
      </div>
    </PullToRefresh>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-16" />
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
      <OrderCardSkeleton />
      <OrderCardSkeleton />
    </div>
  );
}
