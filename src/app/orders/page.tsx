'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter, Plus } from 'lucide-react';
import { useApp } from '@/components/providers';
import { OrderCard, OrderCardSkeleton } from '@/components/bits';
import { EmptyState, ErrorState, Modal, PullToRefresh, SearchInput, Select, Spinner, useDebouncedValue } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import type { OrderView } from '@/lib/types';
import type { DictKey } from '@/i18n/dict';

const QUICK_FILTERS = [
  { key: 'all', label: 'filter_all', icon: '' },
  { key: 'overdue', label: 'filter_overdue', icon: '🔴 ' },
  { key: 'today', label: 'filter_today', icon: '' },
  { key: 'tomorrow', label: 'filter_tomorrow', icon: '' },
  { key: 'maker', label: 'filter_maker', icon: '' },
  { key: 'ready', label: 'filter_ready', icon: '' },
  { key: 'traveler', label: 'filter_traveler', icon: '' },
  { key: 'arrived', label: 'filter_arrived', icon: '' },
  { key: 'delivered', label: 'filter_delivered', icon: '' },
  { key: 'balance', label: 'filter_balance', icon: '' },
] as const satisfies readonly { key: string; label: DictKey; icon: string }[];

const SORTS = [
  { value: 'priority', label: 'sort_priority' },
  { value: 'newest', label: 'sort_newest' },
  { value: 'oldest', label: 'sort_oldest' },
  { value: 'delivery', label: 'sort_delivery' },
  { value: 'weight_desc', label: 'sort_weight_desc' },
  { value: 'weight_asc', label: 'sort_weight_asc' },
  { value: 'balance', label: 'sort_balance' },
  { value: 'customer', label: 'sort_customer' },
] as const satisfies readonly { value: string; label: DictKey }[];

const EMPTY_STATES: Record<string, { title: DictKey; text: DictKey; icon: string }> = {
  overdue: { title: 'empty_overdue_title', text: 'empty_overdue_text', icon: '🎉' },
  ready: { title: 'empty_ready_title', text: 'empty_ready_text', icon: '✅' },
  traveler: { title: 'empty_traveler_title', text: 'empty_traveler_text', icon: '✈️' },
  arrived: { title: 'empty_arrived_title', text: 'empty_arrived_text', icon: '📍' },
  balance: { title: 'empty_balance_title', text: 'empty_balance_text', icon: '🟢' },
  all: { title: 'empty_orders_title', text: 'empty_orders_text', icon: '🥇' },
};

const PAGE_SIZE = 25;

interface Options {
  karats: string[];
  categories: string[];
  styles: string[];
  makers: { id: string; name: string }[];
  travelers: { id: string; name: string }[];
  destinations: string[];
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <OrdersList />
    </Suspense>
  );
}

function OrdersList() {
  const { settings, toast, t } = useApp();
  const router = useRouter();
  const params = useSearchParams();

  const quick = params.get('quick') ?? 'all';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(search, 250);
  const [sort, setSort] = useState(params.get('sort') ?? 'priority');
  const [filters, setFilters] = useState({
    karat: params.get('karat') ?? '',
    category: params.get('category') ?? '',
    style: params.get('style') ?? '',
    makerId: params.get('makerId') ?? '',
    travelerId: params.get('travelerId') ?? '',
    destination: params.get('destination') ?? '',
    customerId: params.get('customerId') ?? '',
    balance: params.get('balance') ?? '',
    deliveryFrom: params.get('deliveryFrom') ?? '',
    deliveryTo: params.get('deliveryTo') ?? '',
  });

  const [orders, setOrders] = useState<OrderView[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [options, setOptions] = useState<Options>({
    karats: settings.karats,
    categories: settings.categories,
    styles: settings.styles,
    makers: [],
    travelers: [],
    destinations: settings.destinations,
  });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (quick !== 'all') p.set('quick', quick);
    if (debounced.trim()) p.set('q', debounced.trim());
    if (sort) p.set('sort', sort);
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    return p;
  }, [quick, debounced, sort, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const load = useCallback(
    async (nextOffset = 0) => {
      const p = new URLSearchParams(query);
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(nextOffset));
      if (nextOffset === 0) setLoading(true);
      else setLoadingMore(true);
      try {
        const d = await apiGet<{ orders: OrderView[]; total: number }>(`/api/orders?${p.toString()}`);
        setOrders((prev) => (nextOffset === 0 ? d.orders : [...prev, ...d.orders]));
        setTotal(d.total);
        setOffset(nextOffset);
        setError(false);
        if (nextOffset === 0) cache.set(`orders:${query.toString()}`, d.orders);
      } catch {
        const cached = nextOffset === 0 ? cache.get<OrderView[]>(`orders:${query.toString()}`) : null;
        if (cached) setOrders(cached);
        else setError(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [query],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  // Filter pickers are populated from the shop's own directory.
  useEffect(() => {
    void (async () => {
      try {
        const [makers, travelers] = await Promise.all([
          apiGet<{ items: { id: string; name: string }[] }>('/api/directory/makers'),
          apiGet<{ items: { id: string; name: string }[] }>('/api/directory/travelers'),
        ]);
        setOptions((o) => ({ ...o, makers: makers.items, travelers: travelers.items }));
      } catch {
        /* pickers stay empty offline */
      }
    })();
  }, []);

  const setQuick = (key: string) => {
    const p = new URLSearchParams(query);
    if (key === 'all') p.delete('quick');
    else p.set('quick', key);
    router.replace(`/orders?${p.toString()}`);
  };

  const empty = EMPTY_STATES[quick] ?? EMPTY_STATES.all;

  return (
    <PullToRefresh
      onRefresh={async () => {
        await load(0);
        toast(t('up_to_date'), 'info');
      }}
    >
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('search_orders')} />

        <div className="scroll-x no-print">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuick(f.key)}
              className={`chip shrink-0 whitespace-nowrap border px-3 py-2 normal-case tracking-normal ${
                quick === f.key ? 'border-gold bg-gold text-black' : 'border-line bg-surface2 text-muted'
              }`}
              aria-pressed={quick === f.key}
            >
              {f.icon}
              {t(f.label)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => setShowFilters(true)}>
            <Filter className="h-4 w-4" />
            {t('filters')}{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          <div className="flex-1">
            <Select
              value={sort}
              onChange={setSort}
              options={SORTS.map((o) => ({ value: o.value, label: t(o.label) }))}
              ariaLabel={t('sort_label')}
            />
          </div>
        </div>

        <p className="text-[12px] text-muted">
          {loading ? t('loading') : total === 1 ? t('order_count_1') : t('orders_count', { n: total })}
          {sort === 'priority' ? ` · ${t('overdue_pinned')}` : ''}
        </p>

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState text={t('could_not_load_orders')} onRetry={() => void load(0)} />
        ) : orders.length === 0 ? (
          <EmptyState
            title={t(empty.title)}
            text={t(empty.text)}
            icon={empty.icon}
            action={
              <Link href="/orders/new" className="btn-primary">
                <Plus className="h-4 w-4" /> {t('new_order')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="space-y-2.5">
              {orders.map((o) => (
                <OrderCard key={o.id} order={o} currency={settings.currency} />
              ))}
            </div>
            {orders.length < total ? (
              <button type="button" className="btn-ghost w-full" onClick={() => void load(offset + PAGE_SIZE)} disabled={loadingMore}>
                {loadingMore ? <Spinner /> : null}
                {t('load_more', { shown: orders.length, total })}
              </button>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title={t('filters')}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() =>
                setFilters({
                  karat: '', category: '', style: '', makerId: '', travelerId: '',
                  destination: '', customerId: '', balance: '', deliveryFrom: '', deliveryTo: '',
                })
              }
            >
              {t('clear_all')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => setShowFilters(false)}>
              {t('apply')}
            </button>
          </>
        }
      >
        <FilterRow label={t('karat')}>
          <Select
            value={filters.karat}
            onChange={(v) => setFilters((f) => ({ ...f, karat: v }))}
            placeholder={t('any_karat')}
            options={options.karats.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label={t('category')}>
          <Select
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
            placeholder={t('any_category')}
            options={options.categories.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label={t('style')}>
          <Select
            value={filters.style}
            onChange={(v) => setFilters((f) => ({ ...f, style: v }))}
            placeholder={t('any_style')}
            options={options.styles.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label={t('maker')}>
          <Select
            value={filters.makerId}
            onChange={(v) => setFilters((f) => ({ ...f, makerId: v }))}
            placeholder={t('any_maker')}
            options={options.makers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FilterRow>
        <FilterRow label={t('traveler')}>
          <Select
            value={filters.travelerId}
            onChange={(v) => setFilters((f) => ({ ...f, travelerId: v }))}
            placeholder={t('any_traveler')}
            options={options.travelers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FilterRow>
        <FilterRow label={t('destination')}>
          <Select
            value={filters.destination}
            onChange={(v) => setFilters((f) => ({ ...f, destination: v }))}
            placeholder={t('any_destination')}
            options={options.destinations.map((d) => ({ value: d, label: d }))}
          />
        </FilterRow>
        <FilterRow label={t('payment_status')}>
          <Select
            value={filters.balance}
            onChange={(v) => setFilters((f) => ({ ...f, balance: v }))}
            placeholder={t('any_payment')}
            options={[
              { value: 'due', label: t('balance_due') },
              { value: 'paid', label: t('paid_in_full') },
              { value: 'partial', label: t('balance_partial') },
              { value: 'unpaid', label: t('nothing_paid') },
            ]}
          />
        </FilterRow>
        <div className="grid grid-cols-2 gap-2">
          <FilterRow label={t('delivery_from')}>
            <input
              className="input num"
              type="date"
              value={filters.deliveryFrom}
              onChange={(e) => setFilters((f) => ({ ...f, deliveryFrom: e.target.value }))}
            />
          </FilterRow>
          <FilterRow label={t('delivery_to')}>
            <input
              className="input num"
              type="date"
              value={filters.deliveryTo}
              onChange={(e) => setFilters((f) => ({ ...f, deliveryTo: e.target.value }))}
            />
          </FilterRow>
        </div>
      </Modal>
    </PullToRefresh>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  );
}
