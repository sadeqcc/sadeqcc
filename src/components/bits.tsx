'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Clock, Lock, TriangleAlert } from 'lucide-react';
import { aed, grams } from '@/lib/num';
import { dubaiDate } from '@/lib/date';
import type { DictKey } from '@/i18n/dict';
import { useApp } from './providers';

export type Tone = 'matched' | 'over' | 'short' | 'review' | 'draft' | 'locked' | 'none';

const TONE_CLASS: Record<Tone, string> = {
  matched: 'bg-gold/15 text-gold',
  over: 'bg-ok/15 text-ok',
  short: 'bg-bad/15 text-bad',
  review: 'bg-warn/15 text-warn',
  draft: 'bg-muted/15 text-muted',
  locked: 'bg-lock/15 text-lock',
  none: 'bg-surface2 text-muted',
};

export const TONE_DOT: Record<Tone, string> = {
  matched: 'bg-gold',
  over: 'bg-ok',
  short: 'bg-bad',
  review: 'bg-warn',
  draft: 'bg-muted',
  locked: 'bg-lock',
  none: 'bg-transparent',
};

export function toneIcon(tone: Tone, className = 'h-3.5 w-3.5') {
  switch (tone) {
    case 'matched':
      return <Check className={className} />;
    case 'over':
      return <ArrowUp className={className} />;
    case 'short':
      return <ArrowDown className={className} />;
    case 'review':
      return <TriangleAlert className={className} />;
    case 'locked':
      return <Lock className={className} />;
    case 'draft':
      return <Clock className={className} />;
    default:
      return null;
  }
}

export function StatusPill({ tone, label, className = '' }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={`chip ${TONE_CLASS[tone]} ${className}`}>
      {toneIcon(tone)}
      {label}
    </span>
  );
}

/** A surplus is always labelled as needing review — never as profit. */
export function diffTone(diff: number, withinTolerance = false): Tone {
  if (diff === 0) return 'matched';
  if (withinTolerance) return 'review';
  return diff > 0 ? 'over' : 'short';
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'matched':
      return 'matched';
    case 'has_differences':
      return 'short';
    case 'needs_review':
      return 'review';
    case 'finalized':
    case 'locked':
      return 'locked';
    case 'draft':
      return 'draft';
    default:
      return 'none';
  }
}

export function CashDiff({ fils, withinTolerance }: { fils: number; withinTolerance?: boolean }) {
  const { t } = useApp();
  const tone = diffTone(fils, withinTolerance);
  const label =
    fils === 0
      ? t('matched')
      : fils > 0
        ? `${t('surplus_review')} · ${aed(fils)}`
        : `${t('short')} · ${aed(Math.abs(fils))}`;
  return <StatusPill tone={tone} label={label} />;
}

export function GoldDiff({ mg, withinTolerance }: { mg: number; withinTolerance?: boolean }) {
  const { t } = useApp();
  const tone = diffTone(mg, withinTolerance);
  const label =
    mg === 0 ? t('matched') : mg > 0 ? `${t('over')} ${grams(mg)}` : `${t('short')} ${grams(Math.abs(mg))}`;
  return <StatusPill tone={tone} label={label} />;
}

export function KeyValue({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: 'ok' | 'bad' | 'gold' | 'muted';
}) {
  const color =
    tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'gold' ? 'text-gold' : 'text-ink';
  return (
    <div className="row">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`num text-[14px] ${strong ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</span>
    </div>
  );
}

const ACTIVE_DATE = 'sadeq.activeDate';

/** Remembers which business day the user was working on, across app restarts. */
export function useActiveDate(): [string, (d: string) => void, boolean] {
  const [date, setDate] = useState(dubaiDate());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_DATE);
      if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) setDate(saved);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const update = (d: string) => {
    setDate(d);
    try {
      localStorage.setItem(ACTIVE_DATE, d);
    } catch {
      /* ignore */
    }
  };
  return [date, update, ready];
}

export function setActiveDate(d: string): void {
  try {
    localStorage.setItem(ACTIVE_DATE, d);
  } catch {
    /* ignore */
  }
}

export function DateBar({
  date,
  onChange,
  right,
}: {
  date: string;
  onChange: (d: string) => void;
  right?: React.ReactNode;
}) {
  const { t } = useApp();
  const today = dubaiDate();
  return (
    <div className="mb-3 flex items-center gap-2 no-print">
      <input
        type="date"
        className="input num flex-1 py-2.5"
        value={date}
        max={today}
        aria-label={t('date')}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      {date !== today ? (
        <button className="btn-ghost px-3 py-2 text-[13px]" onClick={() => onChange(today)}>
          {t('today')}
        </button>
      ) : null}
      {right}
    </div>
  );
}

export function LockedBanner() {
  const { t } = useApp();
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-lock/40 bg-lock/10 px-3 py-2.5 text-[13px] text-lock">
      <Lock className="h-4 w-4 shrink-0" />
      <span>{t('day_locked')}</span>
    </div>
  );
}

export function sectionLabel(key: string): DictKey {
  const map: Record<string, DictKey> = {
    principal: 'principal',
    debt: 'debts',
    debts: 'debts',
    commission: 'commissions',
    commissions: 'commissions',
    amanat: 'amanat',
    unregistered_sale: 'unregistered_sales',
    unregistered_sales: 'unregistered_sales',
    duplicate_sale: 'duplicate_sales',
    duplicate_sales: 'duplicate_sales',
    system_error: 'system_errors',
    system_errors: 'system_errors',
  };
  return map[key] ?? 'total';
}
