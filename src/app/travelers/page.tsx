'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plane } from 'lucide-react';
import { useApp } from '@/components/providers';
import { EntityPicker } from '@/components/pickers';
import { EmptyState, ErrorState, PullToRefresh, Skeleton } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import { formatWeight } from '@/lib/num';

interface TravelerRow {
  id: string;
  name: string;
  phone: string | null;
  frequentRoute: string | null;
  currentOrders: number;
  currentWeightMg: number;
}

export default function TravelersPage() {
  const { toast } = useApp();
  const [items, setItems] = useState<TravelerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ items: TravelerRow[] }>('/api/directory/travelers');
      setItems(d.items);
      cache.set('travelers', d.items);
      setError(false);
    } catch {
      const cached = cache.get<TravelerRow[]>('travelers');
      if (cached) setItems(cached);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PullToRefresh
      onRefresh={async () => {
        await load();
        toast('Up to date', 'info');
      }}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold text-ink">Travelers</h2>
          <span className="text-[12px] text-muted">{items.length} total</span>
        </div>

        <div key={pickerKey}>
          <EntityPicker
            entity="travelers"
            label="Add or find a traveler"
            value={null}
            onChange={(id) => {
              setPickerKey((k) => k + 1);
              void load();
              if (id) window.location.assign(`/travelers/${id}`);
            }}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : error ? (
          <ErrorState text="Could not load travelers." onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title="No travelers yet" text="Add the people who carry orders to their destination." icon="✈️" />
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.id}>
                <Link href={`/travelers/${t.id}`} className="card flex items-center gap-3 p-3 transition hover:border-gold/50">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-info/15 text-info">
                    <Plane className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">{t.name}</span>
                    <span className="block truncate text-[12px] text-muted">{[t.phone, t.frequentRoute].filter(Boolean).join(' · ') || '—'}</span>
                    <span className="mt-0.5 flex gap-3 text-[12px]">
                      <span className="text-muted">
                        Carrying <span className="num font-semibold text-ink">{t.currentOrders}</span>
                      </span>
                      <span className="num text-muted">{formatWeight(t.currentWeightMg)} g</span>
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
