'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, CloudOff, Home, MoreHorizontal, Package, Plus, RefreshCw, Users } from 'lucide-react';
import { useApp } from './providers';
import { dubaiClock, dubaiDate } from '@/lib/date';
import { useMounted } from './ui';

const NAV = [
  { href: '/', key: 'nav_home', icon: Home },
  { href: '/orders', key: 'nav_orders', icon: Package },
  { href: '/customers', key: 'nav_customers', icon: Users },
  { href: '/more', key: 'nav_more', icon: MoreHorizontal },
] as const;

/** Screens that own their whole viewport — no chrome, no bottom bar. */
const BARE = ['/login'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { settings, online, pending, user, authReady, syncNow, t, dir } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(dubaiClock());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  // Anything that is not the login screen requires a session.
  useEffect(() => {
    if (!authReady) return;
    if (!user && !BARE.includes(pathname)) router.replace('/login');
  }, [authReady, user, pathname, router]);

  const isPrint = pathname.startsWith('/print');
  if (BARE.includes(pathname)) return <main className="mx-auto min-h-dvh w-full max-w-md px-4 py-8">{children}</main>;
  if (isPrint) return <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="safe-top sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur no-print">
        <div className="flex items-center gap-2 px-4 py-3">
          {pathname !== '/' ? (
            <button type="button" className="rounded-lg p-2 text-muted hover:text-ink" onClick={() => router.back()} aria-label={t('back')}>
              {/* The back chevron follows the reading direction. */}
              {dir === 'rtl' ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-[15px]" aria-hidden>
              🥇
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-extrabold tracking-[0.14em] text-gold">{t('app_name')}</h1>
            <p className="truncate text-[11px] text-muted">
              {settings.shopName ? `${settings.shopName} · ` : ''}
              {mounted ? (
                <>
                  <span className="num">{dubaiDate()}</span> · <span className="num">{clock}</span> · {t('dubai')}
                </>
              ) : null}
            </p>
          </div>
          {mounted && !online ? (
            <span className="chip bg-warn/15 text-warn" title={t('offline')}>
              <CloudOff className="h-3.5 w-3.5" />
              {pending > 0 ? pending : t('offline')}
            </span>
          ) : mounted && pending > 0 ? (
            <button type="button" className="chip bg-info/15 text-info" onClick={() => void syncNow()} title={t('sync_queued')}>
              <RefreshCw className="h-3.5 w-3.5" />
              {pending}
            </button>
          ) : null}
        </div>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-2xl border-t border-line bg-surface/95 backdrop-blur no-print">
        <ul className="grid grid-cols-5 items-center">
          {NAV.slice(0, 2).map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={t(item.key)} pathname={pathname} />
          ))}
          <li className="flex justify-center">
            <Link
              href="/orders/new"
              aria-label={t('new_order')}
              className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-gold text-black shadow-pop transition active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </Link>
          </li>
          {NAV.slice(2).map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={t(item.key)} pathname={pathname} />
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pathname: string;
}) {
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <li>
      <Link
        href={href}
        className={`flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
          active ? 'text-gold' : 'text-muted'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className="h-5 w-5" />
        {label}
      </Link>
    </li>
  );
}
