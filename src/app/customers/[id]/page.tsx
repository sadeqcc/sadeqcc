'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, StatCard, Tag } from '@/components/bits';
import { LedgerPanel } from '@/components/ledger';
import { Card, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { apiGet, whatsappLink } from '@/lib/client';
import { formatMoney, phoneDigits } from '@/lib/num';
import type { CustomerAccount, LedgerEntry, OrderView } from '@/lib/types';

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

interface Bundle {
  item: Customer;
  account: CustomerAccount;
  ledger: LedgerEntry[];
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, t } = useApp();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        apiGet<Bundle>(`/api/directory/customers/${id}`),
        apiGet<{ orders: OrderView[] }>(`/api/orders?customerId=${id}&limit=200`),
      ]);
      setCustomer(d.item);
      setAccount(d.account);
      setLedger(d.ledger ?? []);
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
  if (error || !customer) return <ErrorState text={t('could_not_load_customer')} onRetry={() => void load()} />;

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
            <Phone className="h-4 w-4" /> {t('call')}
          </a>
        ) : null}
        {whatsapp ? (
          <a href={whatsappLink(whatsapp)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm flex-1">
            <MessageCircle className="h-4 w-4" /> {t('whatsapp')}
          </a>
        ) : null}
      </div>

      {account ? (
        <>
          <Card>
            <LedgerPanel
              customerId={id}
              account={account}
              entries={ledger}
              onChange={({ entries, account: next }) => {
                setLedger(entries);
                setAccount(next);
              }}
            />
          </Card>

          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label={t('total_orders')} value={String(account.totalOrders)} />
            <StatCard label={t('active_orders')} value={String(account.activeOrders)} tone="gold" />
            <StatCard label={t('delivered_orders')} value={String(account.deliveredOrders)} tone="ok" />
            <StatCard label={t('total_purchases')} value={`${settings.currency} ${formatMoney(account.ordersTotalFils)}`} tone="gold" />
          </div>
        </>
      ) : null}

      {customer.notes ? (
        <Card>
          <CardTitle title={t('notes')} />
          <p className="whitespace-pre-wrap text-[13px] text-ink">{customer.notes}</p>
        </Card>
      ) : null}

      <section>
        <CardTitle title={t('order_history')} subtitle={orders.length === 1 ? t('order_count_1') : t('orders_count', { n: orders.length })} />
        {orders.length === 0 ? (
          <EmptyState title={t('empty_orders_title')} text={t('no_orders_customer')} icon="🥇" />
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
