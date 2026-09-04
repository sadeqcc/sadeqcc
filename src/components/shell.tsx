'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Banknote, BarChart3, ChevronLeft, ChevronRight, CloudOff, Coins, Home, Settings, Wifi } from 'lucide-react';
import { useApp } from './providers';
import { dubaiDate, dubaiTime } from '@/lib/date';
import { useMounted } from './ui';

const NAV = [
  { href: '/', key: 'nav_home', icon: Home, emoji: '🏠' },
  { href: '/cash', key: 'nav_cash', icon: Banknote, emoji: '💵' },
  { href: '/gold', key: 'nav_gold', icon: Coins, emoji: '🥇' },
  { href: '/reports', key: 'nav_reports', icon: BarChart3, emoji: '📊' },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, settings, online, pending, dir, user } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(dubaiTime());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  const isAuthScreen = pathname === '/login';
  const Back = dir === 'rtl' ? ChevronRight : ChevronLeft;

  if (isAuthScreen) return <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">{children}</main>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="safe-top sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur no-print">
        <div className="flex items-center gap-2 px-4 py-3">
          {pathname !== '/' ? (
            <button className="rounded-lg p-2 text-muted hover:text-ink" onClick={() => router.back()} aria-label={t('back')}>
              <Back className="h-5 w-5" />
            </button>
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-[15px]">🥇</span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-extrabold tracking-wide text-gold">
              {settings.shopName ? `${settings.shopName} · ` : ''}SADEQ DRAWER
            </h1>
            <p className="truncate text-[11px] text-muted">
              {mounted ? `${dubaiDate()} · ` : ''}
              <span className="num">{clock}</span>
              {user?.displayName ? ` · ${user.displayName}` : ''}
            </p>
          </div>
          {mounted && !online ? (
            <span className="chip bg-warn/15 text-warn" title={t('offline')}>
              <CloudOff className="h-3.5 w-3.5" />
              {pending > 0 ? pending : ''}
            </span>
          ) : mounted && pending > 0 ? (
            <span className="chip bg-info/15 text-info">
              <Wifi className="h-3.5 w-3.5" />
              {pending}
            </span>
          ) : null}
          <Link href="/settings" aria-label={t('nav_settings')} className="rounded-lg p-2 text-muted hover:text-gold">
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-line bg-surface/95 backdrop-blur no-print">
        <ul className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                    active ? 'text-gold' : 'text-muted'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" />
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
