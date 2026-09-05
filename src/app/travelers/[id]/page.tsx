'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, Phone, Printer } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, StatCard } from '@/components/bits';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui';
import { apiGet, apiWrite, whatsappLink } from '@/lib/client';
import { dubaiShort } from '@/lib/date';
import { formatWeight, phoneDigits } from '@/lib/num';
import type { OrderView } from '@/lib/types';

interface Traveler {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  frequentRoute: string | null;
  idReference: string | null;
  notes: string | null;
}

interface Shipment {
  id: string;
  destination: string;
  departureDate: string | null;
  expectedArrival: string | null;
  arrivedAt: string | null;
  flightNumber: string | null;
  airline: string | null;
  orderCount: number;
  totalWeightMg: number;
}

export default function TravelerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, toast, confirm, can } = useApp();
  const [traveler, setTraveler] = useState<Traveler | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        apiGet<{ item: Traveler; shipments: Shipment[] }>(`/api/directory/travelers/${id}`),
        apiGet<{ orders: OrderView[] }>(`/api/orders?travelerId=${id}&limit=200`),
      ]);
      setTraveler(d.item);
      setShipments(d.shipments);
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
  if (error || !traveler) return <ErrorState text="Could not load this traveler." onRetry={() => void load()} />;

  const inTransit = orders.filter((o) => o.status === 'traveler');
  const totalWeightMg = inTransit.reduce((a, o) => a + (o.actualWeightMg ?? o.expectedWeightMg), 0);
  const phone = phoneDigits(traveler.phone);
  const whatsapp = phoneDigits(traveler.whatsapp ?? traveler.phone);

  /** Section 32 — bulk arrival, behind an explicit confirmation. */
  const markAllArrived = async () => {
    const c = await confirm({
      title: `Mark ${inTransit.length} orders as arrived?`,
      body: 'Each order gets its own timeline entry with today’s Dubai date.',
      confirmLabel: 'Mark all arrived',
    });
    if (!c.ok) return;
    setBusy(true);
    try {
      for (const o of inTransit) {
        await apiWrite(`/api/orders/${o.id}/status`, { toStatus: 'arrived', destination: o.destination }, 'POST', { queue: false });
      }
      toast(`${inTransit.length} orders marked arrived`);
      await load();
    } catch {
      toast('Some orders could not be updated', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-[19px] font-extrabold text-ink">{traveler.name}</h2>
        <p className="text-[13px] text-muted">{[traveler.phone, traveler.frequentRoute, traveler.idReference].filter(Boolean).join(' · ') || '—'}</p>
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
        {inTransit.length ? (
          <Link href={`/print/packing/${id}`} className="btn-ghost btn-sm flex-1">
            <Printer className="h-4 w-4" /> Packing list
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Currently Carrying" value={String(inTransit.length)} tone="info" />
        <StatCard label="Total Weight" value={`${formatWeight(totalWeightMg)} g`} tone="gold" />
      </div>

      {shipments.length ? (
        <Card>
          <CardTitle title="Trips" subtitle="Grouped by destination and departure" />
          <ul className="divide-y divide-line/70">
            {shipments.map((s) => (
              <li key={s.id} className="py-2.5">
                <p className="text-[14px] font-bold text-ink">Dubai → {s.destination}</p>
                <p className="num text-[12px] text-muted">
                  Departs {dubaiShort(s.departureDate)} · Arrives {dubaiShort(s.expectedArrival)}
                  {s.flightNumber ? ` · ${s.flightNumber}` : ''}
                  {s.airline ? ` · ${s.airline}` : ''}
                </p>
                <p className="num text-[12px] text-muted">
                  {s.orderCount} {s.orderCount === 1 ? 'order' : 'orders'} · {formatWeight(s.totalWeightMg)} g
                  {s.arrivedAt ? ` · arrived ${dubaiShort(s.arrivedAt)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {can('order.status') && inTransit.length ? (
        <button type="button" className="btn-ghost w-full" onClick={() => void markAllArrived()} disabled={busy}>
          {busy ? <Spinner /> : null}
          Mark all {inTransit.length} as arrived
        </button>
      ) : null}

      <section>
        <CardTitle title="Orders" subtitle={`${orders.length} in total`} />
        {orders.length === 0 ? (
          <EmptyState title="No orders yet" text="Assign this traveler when moving an order to Traveler." icon="✈️" />
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
