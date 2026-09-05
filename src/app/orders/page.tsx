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

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: '🔴 Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'maker', label: 'Maker' },
  { key: 'ready', label: 'Ready' },
  { key: 'traveler', label: 'Traveler' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'balance', label: 'Balance Due' },
] as const;

const SORTS = [
  { value: 'priority', label: 'Priority (overdue first)' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'delivery', label: 'Expected delivery' },
  { value: 'weight_desc', label: 'Largest weight' },
  { value: 'weight_asc', label: 'Smallest weight' },
  { value: 'balance', label: 'Highest balance' },
  { value: 'customer', label: 'Customer name' },
];

const EMPTY_STATES: Record<string, { title: string; text: string; icon: string }> = {
  overdue: { title: '🎉 No Overdue Orders', text: 'Everything is on schedule.', icon: '🎉' },
  ready: { title: 'No Orders Ready', text: 'Orders will appear here when makers finish them.', icon: '✅' },
  traveler: { title: 'No Orders Travelling', text: 'Assign a traveler when an order is ready to move.', icon: '✈️' },
  arrived: { title: 'No Arrived Orders', text: 'Arrived orders wait here until the customer receives them.', icon: '📍' },
  balance: { title: 'No Outstanding Balances', text: 'Every order is fully paid.', icon: '🟢' },
  all: { title: 'No Orders Yet', text: 'Create your first gold order.', icon: '🥇' },
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
  const { settings, toast } = useApp();
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
        toast('Up to date', 'info');
      }}
    >
      <div className="space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search orders, customers, phone, maker…" />

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
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => setShowFilters(true)}>
            <Filter className="h-4 w-4" />
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          <div className="flex-1">
            <Select value={sort} onChange={setSort} options={SORTS} ariaLabel="Sort orders" />
          </div>
        </div>

        <p className="text-[12px] text-muted">
          {loading ? 'Loading…' : `${total} ${total === 1 ? 'order' : 'orders'}`}
          {sort === 'priority' ? ' · overdue pinned to the top' : ''}
        </p>

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState text="Could not load orders." onRetry={() => void load(0)} />
        ) : orders.length === 0 ? (
          <EmptyState
            title={empty.title}
            text={empty.text}
            icon={empty.icon}
            action={
              <Link href="/orders/new" className="btn-primary">
                <Plus className="h-4 w-4" /> New Order
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
                Load more ({orders.length} of {total})
              </button>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filters"
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
              Clear all
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => setShowFilters(false)}>
              Apply
            </button>
          </>
        }
      >
        <FilterRow label="Karat">
          <Select
            value={filters.karat}
            onChange={(v) => setFilters((f) => ({ ...f, karat: v }))}
            placeholder="Any karat"
            options={options.karats.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label="Category">
          <Select
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
            placeholder="Any category"
            options={options.categories.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label="Style">
          <Select
            value={filters.style}
            onChange={(v) => setFilters((f) => ({ ...f, style: v }))}
            placeholder="Any style"
            options={options.styles.map((k) => ({ value: k, label: k }))}
          />
        </FilterRow>
        <FilterRow label="Maker">
          <Select
            value={filters.makerId}
            onChange={(v) => setFilters((f) => ({ ...f, makerId: v }))}
            placeholder="Any maker"
            options={options.makers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FilterRow>
        <FilterRow label="Traveler">
          <Select
            value={filters.travelerId}
            onChange={(v) => setFilters((f) => ({ ...f, travelerId: v }))}
            placeholder="Any traveler"
            options={options.travelers.map((m) => ({ value: m.id, label: m.name }))}
          />
        </FilterRow>
        <FilterRow label="Destination">
          <Select
            value={filters.destination}
            onChange={(v) => setFilters((f) => ({ ...f, destination: v }))}
            placeholder="Any destination"
            options={options.destinations.map((d) => ({ value: d, label: d }))}
          />
        </FilterRow>
        <FilterRow label="Payment status">
          <Select
            value={filters.balance}
            onChange={(v) => setFilters((f) => ({ ...f, balance: v }))}
            placeholder="Any payment status"
            options={[
              { value: 'due', label: 'Balance due' },
              { value: 'paid', label: 'Paid in full' },
              { value: 'partial', label: 'Partially paid' },
              { value: 'unpaid', label: 'Nothing paid' },
            ]}
          />
        </FilterRow>
        <div className="grid grid-cols-2 gap-2">
          <FilterRow label="Delivery from">
            <input
              className="input num"
              type="date"
              value={filters.deliveryFrom}
              onChange={(e) => setFilters((f) => ({ ...f, deliveryFrom: e.target.value }))}
            />
          </FilterRow>
          <FilterRow label="Delivery to">
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
