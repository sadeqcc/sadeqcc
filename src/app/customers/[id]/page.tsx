'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, StatCard, Tag } from '@/components/bits';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet, whatsappLink } from '@/lib/client';
import { formatMoney, phoneDigits } from '@/lib/num';
import type { OrderView } from '@/lib/types';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  country: string | null;
  city: string | null;
  customerType: string | null;
  instagram: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
}

interface Stats {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalPurchasesFils: number;
  outstandingFils: number;
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings } = useApp();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        apiGet<{ item: Customer; stats: Stats }>(`/api/directory/customers/${id}`),
        apiGet<{ orders: OrderView[] }>(`/api/orders?customerId=${id}&limit=100`),
      ]);
      setCustomer(d.item);
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
  if (error || !customer) return <ErrorState text="Could not load this customer." onRetry={() => void load()} />;

  const phone = phoneDigits(customer.phone);
  const whatsapp = phoneDigits(customer.whatsapp ?? customer.phone);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gold/15 text-[20px] font-bold text-gold">
          {customer.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[19px] font-extrabold text-ink">{customer.name}</h2>
          <p className="truncate text-[13px] text-muted">
            {[customer.customerType, customer.phone, [customer.city, customer.country].filter(Boolean).join(', ')]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
          {customer.tags.length ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {customer.tags.map((t) => (
                <li key={t}>
                  <Tag name={t} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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

      {stats ? (
        <div className="grid grid-cols-2 gap-2.5">
          <StatCard label="Total Orders" value={String(stats.totalOrders)} />
          <StatCard label="Active" value={String(stats.activeOrders)} tone="gold" />
          <StatCard label="Delivered" value={String(stats.deliveredOrders)} tone="ok" />
          <StatCard
            label="Outstanding"
            value={`${settings.currency} ${formatMoney(stats.outstandingFils)}`}
            tone={stats.outstandingFils > 0 ? 'bad' : 'ok'}
          />
          <div className="col-span-2">
            <StatCard label="Total Purchases" value={`${settings.currency} ${formatMoney(stats.totalPurchasesFils)}`} tone="gold" />
          </div>
        </div>
      ) : null}

      {customer.notes ? (
        <Card>
          <CardTitle title="Notes" />
          <p className="whitespace-pre-wrap text-[13px] text-ink">{customer.notes}</p>
        </Card>
      ) : null}

      <section>
        <CardTitle title="Order history" subtitle={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`} />
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" text="This customer has no orders on record." icon="🥇" />
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
