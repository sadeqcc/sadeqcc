'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '@/components/providers';
import { ErrorState, Skeleton } from '@/components/ui';
import { apiGet } from '@/lib/client';
import { dubaiShort, dubaiStamp } from '@/lib/date';
import { formatWeight } from '@/lib/num';
import type { OrderView } from '@/lib/types';

interface Traveler {
  id: string;
  name: string;
  phone: string | null;
  idReference: string | null;
}

/** Section 34 — the packing list carries no customer money at all. */
export default function PackingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, t } = useApp();
  const [traveler, setTraveler] = useState<Traveler | null>(null);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, o] = await Promise.all([
        apiGet<{ item: Traveler }>(`/api/directory/travelers/${id}`),
        apiGet<{ orders: OrderView[] }>(`/api/orders?travelerId=${id}&status=traveler&limit=200`),
      ]);
      setTraveler(t.item);
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
  if (error || !traveler) return <ErrorState text={t('could_not_load_packing')} onRetry={() => void load()} />;

  const totalWeightMg = orders.reduce((a, o) => a + (o.actualWeightMg ?? o.expectedWeightMg), 0);
  const destinations = [...new Set(orders.map((o) => o.destination).filter(Boolean))].join(', ');

  return (
    <div className="space-y-4">
      <button type="button" className="btn-primary w-full no-print" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> {t('print')}
      </button>

      <article className="card card-pad print-block">
        <header className="mb-4 border-b border-line pb-3">
          <h1 className="text-[20px] font-extrabold text-ink">{settings.shopName || 'Gold Orders'}</h1>
          <p className="mt-2 text-[14px] font-bold uppercase tracking-wide text-gold">{t('print_packing_title')}</p>
          <p className="mt-1 text-[13px] text-ink">
            <span className="font-semibold">{traveler.name}</span>
            {traveler.phone ? ` · ${traveler.phone}` : ''}
            {traveler.idReference ? ` · ID ${traveler.idReference}` : ''}
          </p>
          <p className="num text-[12px] text-muted">
            {t('destination')}: {destinations || '—'} ·{' '}
            {t('packing_meta', { n: orders.length, weight: `${formatWeight(totalWeightMg)} g` })}
          </p>
        </header>

        {orders.length === 0 ? (
          <p className="text-[13px] text-muted">{t('not_carrying')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 text-start font-semibold">#</th>
                  <th className="py-1 text-start font-semibold">{t('order')}</th>
                  <th className="py-1 text-start font-semibold">{t('customer')}</th>
                  <th className="py-1 text-start font-semibold">{t('product')}</th>
                  <th className="py-1 text-start font-semibold">{t('karat')}</th>
                  <th className="py-1 text-end font-semibold">{t('weight')}</th>
                  <th className="py-1 text-start font-semibold">{t('destination')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={o.id} className="border-t border-line/60">
                    <td className="num py-1.5">{i + 1}</td>
                    <td className="num py-1.5">{o.orderNumber}</td>
                    <td className="py-1.5">{o.customerName}</td>
                    <td className="py-1.5">{o.productName}</td>
                    <td className="py-1.5">{o.karat}</td>
                    <td className="num py-1.5 text-end">{formatWeight(o.actualWeightMg ?? o.expectedWeightMg)} g</td>
                    <td className="py-1.5">{o.destination ?? '—'}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-line font-bold">
                  <td className="py-1.5" colSpan={5}>
                    {t('total')}
                  </td>
                  <td className="num py-1.5 text-end">{formatWeight(totalWeightMg)} g</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-10 flex gap-8 text-[12px] text-muted">
          <span className="flex-1 border-t border-line pt-1">{t('traveler')}</span>
          <span className="flex-1 border-t border-line pt-1">{t('shop_signature')}</span>
          <span className="flex-1 border-t border-line pt-1">{t('date')} {dubaiShort(new Date().toISOString().slice(0, 10))}</span>
        </div>

        <footer className="mt-4 border-t border-line pt-2 text-[11px] text-muted">
          {t('printed_at', { stamp: dubaiStamp(new Date()) })}
        </footer>
      </article>
    </div>
  );
}
