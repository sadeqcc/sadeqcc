'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Wallet } from 'lucide-react';
import { useApp } from '@/components/providers';
import { CustomerFormDialog } from '@/components/customer-form';
import { StatCard } from '@/components/bits';
import { EmptyState, ErrorState, PullToRefresh, SearchInput, Skeleton, Toggle } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import { formatMoney } from '@/lib/num';

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  customerType: string | null;
  tags: string[];
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  totalPurchasesFils: number;
  outstandingFils: number;
  creditFils: number;
}

export default function CustomersPage() {
  const { settings, toast, t, can } = useApp();
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [owingOnly, setOwingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ items: CustomerRow[] }>('/api/directory/customers');
      setItems(d.items);
      cache.set('customers', d.items);
      setError(false);
    } catch {
      const cached = cache.get<CustomerRow[]>('customers');
      if (cached) setItems(cached);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;
    if (owingOnly) list = list.filter((c) => c.outstandingFils > 0);
    if (q) list = list.filter((c) => [c.name, c.phone, c.city, c.country].some((v) => String(v ?? '').toLowerCase().includes(q)));
    return list;
  }, [items, search, owingOnly]);

  const totalOwed = items.reduce((a, c) => a + c.outstandingFils, 0);
  const owingCount = items.filter((c) => c.outstandingFils > 0).length;

  return (
    <PullToRefresh
      onRefresh={async () => {
        await load();
        toast(t('up_to_date'), 'info');
      }}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold text-ink">{t('customers')}</h2>
          <span className="text-[12px] text-muted">{t('customers_total', { n: items.length })}</span>
        </div>

        {/* What the shop is owed across every customer, before any single one. */}
        {items.length ? (
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label={t('total_owed_to_you')}
              value={`${settings.currency} ${formatMoney(totalOwed)}`}
              tone={totalOwed > 0 ? 'bad' : 'ok'}
            />
            <StatCard label={t('customers')} value={String(items.length)} hint={t('customers_owing', { n: owingCount })} tone="gold" />
          </div>
        ) : null}

        {can('customer.manage') ? (
          <button type="button" className="btn-primary w-full" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> {t('add_customer')}
          </button>
        ) : null}

        <SearchInput value={search} onChange={setSearch} placeholder={t('search_customers')} />

        {items.length ? (
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <span className="text-[13px] text-ink">{t('only_owing')}</span>
            <Toggle checked={owingOnly} onChange={setOwingOnly} label={t('only_owing')} />
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : error ? (
          <ErrorState text={t('could_not_load_customers')} onRetry={() => void load()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search || owingOnly ? t('no_matches') : t('empty_customers_title')}
            text={search || owingOnly ? t('no_matches_hint') : t('empty_customers_text')}
            icon="👤"
            action={
              can('customer.manage') ? (
                <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                  <Plus className="h-4 w-4" /> {t('add_customer')}
                </button>
              ) : null
            }
          />
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="card flex items-center gap-3 p-3 transition hover:border-gold/50">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold/15 text-[15px] font-bold text-gold">
                    {c.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-bold text-ink">{c.name}</span>
                      {c.customerType ? <span className="chip shrink-0 bg-surface2 text-muted">{c.customerType}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {[c.phone, [c.city, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px]">
                      <span className="text-muted">
                        {t('total_orders')} <span className="num font-semibold text-ink">{c.totalOrders}</span>
                      </span>
                      {c.outstandingFils > 0 ? (
                        <span className="num font-bold text-bad">
                          {t('owes_you')} {settings.currency} {formatMoney(c.outstandingFils)}
                        </span>
                      ) : c.creditFils > 0 ? (
                        <span className="num font-bold text-info">
                          {t('you_owe')} {settings.currency} {formatMoney(c.creditFils)}
                        </span>
                      ) : (
                        <span className="font-semibold text-ok">{t('settled')}</span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <a href="/api/export/customers" className="btn-ghost btn-sm w-full">
          <Wallet className="h-4 w-4" /> {t('export_customers')}
        </a>
      </div>

      <CustomerFormDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          void load();
        }}
      />
    </PullToRefresh>
  );
}
