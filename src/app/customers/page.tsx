'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { useApp } from '@/components/providers';
import { EmptyState, ErrorState, PullToRefresh, SearchInput, Skeleton } from '@/components/ui';
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
}

export default function CustomersPage() {
  const { settings, toast, t } = useApp();
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
    if (!q) return items;
    return items.filter((c) => [c.name, c.phone, c.city, c.country].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [items, search]);

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

        <SearchInput value={search} onChange={setSearch} placeholder={t('search_customers')} />

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
            title={search ? t('no_matches') : t('empty_customers_title')}
            text={search ? t('no_matches_hint') : t('empty_customers_text')}
            icon="👤"
            action={
              <Link href="/orders/new" className="btn-primary">
                <Plus className="h-4 w-4" /> {t('new_order')}
              </Link>
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
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]">
                      <span className="text-muted">
                        {t('total_orders')} <span className="num font-semibold text-ink">{c.totalOrders}</span>
                      </span>
                      <span className="text-muted">
                        {t('active_orders')} <span className="num font-semibold text-ink">{c.activeOrders}</span>
                      </span>
                      {c.outstandingFils > 0 ? (
                        <span className="num font-bold text-bad">
                          {settings.currency} {formatMoney(c.outstandingFils)}
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
      </div>
    </PullToRefresh>
  );
}
