'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, StatCard } from '@/components/bits';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet, whatsappLink } from '@/lib/client';
import { formatMoney, formatWeight, phoneDigits } from '@/lib/num';
import type { OrderView } from '@/lib/types';

interface Maker {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  location: string | null;
  specialty: string | null;
  notes: string | null;
}

export default function MakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, can } = useApp();
  const [maker, setMaker] = useState<Maker | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        apiGet<{ item: Maker; stats: Record<string, number> }>(`/api/directory/makers/${id}`),
        apiGet<{ orders: OrderView[] }>(`/api/orders?makerId=${id}&limit=100`),
      ]);
      setMaker(d.item);
      setStats(d.stats);
      setOrders(o.orders);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-96" />;
  if (error || !maker) return <ErrorState text="Could not load this maker." onRetry={() => void load()} />;

  const active = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  const late = active.filter((o) => o.isOverdue || (o.status === 'maker' && o.expectedReadyDate && o.expectedReadyDate < new Date().toISOString().slice(0, 10)));
  const phone = phoneDigits(maker.phone);
  const whatsapp = phoneDigits(maker.whatsapp ?? maker.phone);

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[19px] font-extrabold text-ink">{maker.name}</h2>
        <p className="text-[13px] text-muted">{[maker.company, maker.specialty, maker.location].filter(Boolean).join(' · ') || '—'}</p>
      </header>

      <div className="flex gap-2 no-print">
        {phone ? (
          <a href={`tel:${phone}`} className="btn-ghost btn-sm flex-1">
            <Phone className="h-4 w-4" /> Call
          </a>
        ) : null}
        {whatsapp ? (
          <a href={whatsappLink(whatsapp)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex-1">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Active Orders" value={String(active.length)} tone="gold" />
        <StatCard label="Overdue" value={`🔴 ${late.length}`} tone="bad" />
        <StatCard label="Ready" value={String(orders.filter((o) => o.status === 'ready').length)} tone="ok" />
        <StatCard label="Expected Weight" value={`${formatWeight(stats.activeWeightMg ?? 0)} g`} tone="gold" />
        {can('finance.view') ? (
          <div className="col-span-2">
            <StatCard label="Total Maker Cost" value={`${settings.currency} ${formatMoney(stats.totalCostFils ?? 0)}`} />
          </div>
        ) : null}
      </div>

      {maker.notes ? (
        <Card>
          <CardTitle title="Notes" />
          <p className="whitespace-pre-wrap text-[13px] text-ink">{maker.notes}</p>
        </Card>
      ) : null}

      <section>
        <CardTitle title="Orders" subtitle={`${orders.length} in total`} />
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" text="Assign this maker when moving an order to Maker." icon="🔨" />
        ) : (
          <div className="space-y-2.5">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} currency={settings.currency} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
