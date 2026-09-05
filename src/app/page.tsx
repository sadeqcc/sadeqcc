'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, ClipboardList } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, OrderCardSkeleton, StatCard } from '@/components/bits';
import { Card, CardTitle, EmptyState, ErrorState, PullToRefresh, useMounted } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import { dubaiClock, dubaiHour, dubaiLong, dubaiTimelineStamp, dubaiWeekday } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import type { Dashboard } from '@/lib/insights';

const CACHE_KEY = 'dashboard';

export default function HomePage() {
  const { user, settings, toast, t, lang } = useApp();
  const mounted = useMounted();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const greeting = t(
    mounted && dubaiHour() < 12 ? 'greeting_morning' : mounted && dubaiHour() < 17 ? 'greeting_afternoon' : 'greeting_evening',
  );

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
        toast(t('up_to_date'), 'info');
      }}
    >
      <div className="space-y-4">
        <header>
          <p className="text-[13px] text-muted">
            {mounted ? `${greeting}، ` : ''}
            {user.displayName ?? user.username}
          </p>
          <h2 className="text-[19px] font-extrabold text-ink">{mounted ? dubaiWeekday(new Date(), lang) : '—'}</h2>
          <p className="num text-[13px] text-muted">
            {mounted ? `${dubaiLong(new Date(), lang)} · ${dubaiClock()} · ${t('dubai')}` : '—'}
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
              <p className="text-[14px] font-extrabold uppercase tracking-wide text-st-overdue">🚨 {t('action_required')}</p>
              <p className="text-[13px] text-ink">
                {cards.overdue === 1 ? t('order_overdue_1') : t('orders_overdue_n', { n: cards.overdue })}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-st-overdue" />
          </Link>
        ) : cards ? (
          <div className="flex items-center gap-3 rounded-card border border-ok/40 bg-ok/10 p-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-ok" />
            <p className="text-[14px] font-bold text-ok">✅ {t('no_overdue')}</p>
          </div>
        ) : null}

        {loading && !data ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState text={t('could_not_load_dashboard')} onRetry={() => void load()} />
        ) : cards ? (
          <>
            <section aria-label={t('summary')} className="grid grid-cols-2 gap-2.5">
              <StatCard label={t('card_active')} value={String(cards.activeOrders)} href="/orders?quick=active" tone="gold" />
              <StatCard label={t('card_overdue')} value={`🔴 ${cards.overdue}`} href="/orders?quick=overdue" tone="bad" />
              <StatCard label={t('card_ready')} value={String(cards.ready)} href="/orders?quick=ready" tone="ok" />
              <StatCard label={t('card_travelers')} value={String(cards.withTravelers)} href="/orders?quick=traveler" tone="info" />
              <StatCard label={t('card_makers')} value={String(cards.withMakers)} href="/orders?quick=maker" tone="warn" />
              <StatCard label={t('card_arrived')} value={String(cards.arrived)} href="/orders?quick=arrived" />
              <StatCard label={t('card_delivered_today')} value={String(cards.deliveredToday)} href="/orders?quick=delivered" tone="ok" />
              <StatCard
                label={t('card_balance')}
                value={`${settings.currency} ${formatMoney(cards.outstandingBalanceFils)}`}
                href="/orders?quick=balance"
                tone={cards.outstandingBalanceFils > 0 ? 'bad' : 'ok'}
              />
              <div className="col-span-2">
                <StatCard label={t('card_gold')} value={`${formatWeight(cards.expectedGoldMg)} g`} tone="gold" hint={t('card_gold_hint')} />
              </div>
            </section>

            {data.urgent.length ? (
              <section>
                <CardTitle title={t('urgent_orders')} subtitle={t('urgent_orders_hint')} icon={<AlertTriangle className="h-4 w-4" />} />
                <div className="space-y-2.5">
                  {data.urgent.map((o) => (
                    <OrderCard key={o.id} order={o} currency={settings.currency} />
                  ))}
                </div>
              </section>
            ) : null}

            {data.dueTodayOrders.length ? (
              <section>
                <CardTitle title={t('todays_orders')} subtitle={t('todays_orders_hint')} />
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
                  title={t('todays_followup')}
                  subtitle={t('followup_count', { n: data.followUps.length })}
                  icon={<ClipboardList className="h-4 w-4" />}
                  action={
                    <Link href="/follow-up" className="text-[12px] font-bold text-gold">
                      {t('view_all')}
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
                  title={t('notifications')}
                  icon={<Bell className="h-4 w-4" />}
                  action={
                    <Link href="/notifications" className="text-[12px] font-bold text-gold">
                      {t('view_all')}
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
              <CardTitle title={t('recent_activity')} subtitle={t('recent_activity_hint')} />
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
                <EmptyState title={t('no_activity')} text={t('no_activity_hint')} icon="🕘" />
              )}
            </Card>

            {cards.activeOrders === 0 ? (
              <EmptyState
                title={t('empty_orders_title')}
                text={t('empty_orders_text')}
                icon="🥇"
                action={
                  <Link href="/orders/new" className="btn-primary">
                    + {t('new_order')}
                  </Link>
                }
              />
            ) : null}
          </>
        ) : null}

        <p className="pb-2 text-center text-[11px] text-muted">
          {t('dashboard_footer', { currency: settings.currency })}
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
