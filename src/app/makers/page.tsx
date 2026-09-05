'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { useApp } from '@/components/providers';
import { EntityPicker } from '@/components/pickers';
import { EmptyState, ErrorState, PullToRefresh, Skeleton } from '@/components/ui';
import { apiGet, cache } from '@/lib/client';
import { formatWeight } from '@/lib/num';

interface MakerRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  specialty: string | null;
  location: string | null;
  activeOrders: number;
  readyOrders: number;
  lateOrders: number;
  expectedWeightMg: number;
}

export default function MakersPage() {
  const { toast, t } = useApp();
  const [items, setItems] = useState<MakerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ items: MakerRow[] }>('/api/directory/makers');
      setItems(d.items);
      cache.set('makers', d.items);
      setError(false);
    } catch {
      const cached = cache.get<MakerRow[]>('makers');
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
        toast(t('up_to_date'), 'info');
      }}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-extrabold text-ink">{t('makers')}</h2>
          <span className="text-[12px] text-muted">{t('customers_total', { n: items.length })}</span>
        </div>

        {/* The picker doubles as the "add maker" entry point. */}
        <div key={pickerKey}>
          <EntityPicker
            entity="makers"
            label={t('add_find_maker')}
            value={null}
            onChange={(id) => {
              setPickerKey((k) => k + 1);
              void load();
              if (id) window.location.assign(`/makers/${id}`);
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
          <ErrorState text={t('could_not_load_makers')} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('empty_makers_title')} text={t('empty_makers_text')} icon="🔨" />
        ) : (
          <ul className="space-y-2">
            {items.map((m) => (
              <li key={m.id}>
                <Link href={`/makers/${m.id}`} className="card flex items-center gap-3 p-3 transition hover:border-gold/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink">{m.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[m.company, m.specialty, m.location].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-[12px]">
                      <span className="text-muted">
                        {t('active_orders')} <span className="num font-semibold text-ink">{m.activeOrders}</span>
                      </span>
                      <span className="text-muted">
                        {t('ready_orders')} <span className="num font-semibold text-ok">{m.readyOrders}</span>
                      </span>
                      {m.lateOrders > 0 ? <span className="num font-bold text-bad">🔴 {m.lateOrders} {t('late_orders')}</span> : null}
                      <span className="num text-muted">{formatWeight(m.expectedWeightMg)} g</span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link href="/orders?quick=maker" className="btn-ghost w-full">
          <Plus className="h-4 w-4" /> {t('view_maker_orders')}
        </Link>
      </div>
    </PullToRefresh>
  );
}
