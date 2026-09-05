'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  ClipboardList,
  Hammer,
  LogOut,
  Plane,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { useApp } from '@/components/providers';
import { Card, CardTitle, Modal, SearchInput, Spinner, useDebouncedValue } from '@/components/ui';
import { apiGet, apiWrite } from '@/lib/client';
import { STATUS_LABEL, type OrderView } from '@/lib/types';

const LINKS = [
  { href: '/makers', label: 'Makers', icon: Hammer, hint: 'Workshops and their open jobs' },
  { href: '/travelers', label: 'Travelers', icon: Plane, hint: 'Who is carrying which orders' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, hint: 'Ready, travel and delivery dates' },
  { href: '/follow-up', label: "Today's Follow-Up", icon: ClipboardList, hint: 'What needs action today' },
  { href: '/reports', label: 'Reports', icon: BarChart3, hint: 'Totals, weights and money' },
  { href: '/notifications', label: 'Notifications', icon: Bell, hint: 'Alerts and their settings' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, hint: 'Shop, defaults, backup and security' },
];

interface SearchResults {
  orders: OrderView[];
  customers: { id: string; name: string; phone: string | null }[];
  makers: { id: string; name: string; company: string | null }[];
  travelers: { id: string; name: string; phone: string | null }[];
}

export default function MorePage() {
  const { user, setUser, toast } = useApp();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 250);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!searching || debounced.trim().length < 1) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void apiGet<SearchResults>(`/api/search?q=${encodeURIComponent(debounced.trim())}`)
      .then((d) => {
        if (!cancelled) setResults(d);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, searching]);

  const logout = async () => {
    await apiWrite('/api/auth/logout', {}, 'POST', { queue: false }).catch(() => undefined);
    setUser(null);
    toast('Signed out');
    router.replace('/login');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-[18px] font-extrabold text-ink">More</h2>

      <button type="button" className="btn-ghost w-full justify-start" onClick={() => setSearching(true)}>
        <Search className="h-4 w-4" />
        Search everything
      </button>

      <Card>
        <ul className="divide-y divide-line/70">
          {LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <li key={l.href}>
                <Link href={l.href} className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface2 text-gold">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-ink">{l.label}</span>
                    <span className="block truncate text-[12px] text-muted">{l.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle title="Signed in" icon={<ShieldCheck className="h-4 w-4" />} />
        <p className="text-[14px] font-semibold text-ink">{user?.displayName ?? user?.username}</p>
        <p className="mb-3 text-[12px] capitalize text-muted">{user?.role}</p>
        <button type="button" className="btn-ghost btn-sm w-full" onClick={() => void logout()}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </Card>

      <Modal open={searching} onClose={() => setSearching(false)} title="Search" wide>
        <SearchInput value={q} onChange={setQ} placeholder="Order, customer, phone, maker, traveler…" autoFocus />
        {busy ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-5 w-5" />
          </div>
        ) : null}
        {results ? (
          <div className="space-y-3">
            <Group title="Orders" empty={results.orders.length === 0}>
              {results.orders.map((o) => (
                <Row
                  key={o.id}
                  href={`/orders/${o.id}`}
                  title={`${o.orderNumber} · ${o.customerName}`}
                  sub={`${o.productName} · ${o.karat} · ${STATUS_LABEL[o.status]}`}
                  onGo={() => setSearching(false)}
                />
              ))}
            </Group>
            <Group title="Customers" empty={results.customers.length === 0}>
              {results.customers.map((c) => (
                <Row key={c.id} href={`/customers/${c.id}`} title={c.name} sub={c.phone ?? '—'} onGo={() => setSearching(false)} />
              ))}
            </Group>
            <Group title="Makers" empty={results.makers.length === 0}>
              {results.makers.map((m) => (
                <Row key={m.id} href={`/makers/${m.id}`} title={m.name} sub={m.company ?? '—'} onGo={() => setSearching(false)} />
              ))}
            </Group>
            <Group title="Travelers" empty={results.travelers.length === 0}>
              {results.travelers.map((t) => (
                <Row key={t.id} href={`/travelers/${t.id}`} title={t.name} sub={t.phone ?? '—'} onGo={() => setSearching(false)} />
              ))}
            </Group>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Group({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  if (empty) return null;
  return (
    <div>
      <p className="label mb-1">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({ href, title, sub, onGo }: { href: string; title: string; sub: string; onGo: () => void }) {
  return (
    <li>
      <Link href={href} onClick={onGo} className="block rounded-xl border border-line px-3 py-2 transition hover:border-gold/60">
        <span className="block truncate text-[13px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-muted">{sub}</span>
      </Link>
    </li>
  );
}
