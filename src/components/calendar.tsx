'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Coins } from 'lucide-react';
import { useApp } from './providers';
import { TONE_DOT, toneIcon, type Tone } from './bits';
import { daysInMonth, dubaiDate, shiftMonth, weekdayIndex } from '@/lib/date';
import { formatCash } from '@/lib/num';
import type { DayDigest } from '@/lib/history';

function dayTone(d: DayDigest | undefined): Tone {
  if (!d) return 'none';
  if (d.status === 'finalized' || d.status === 'locked') return 'locked';
  if (d.cashDifferenceFils < 0) return 'short';
  if (d.cashDifferenceFils > 0) return 'over';
  if (d.matched && d.status !== 'not_started') return 'matched';
  return 'review';
}

const WEEKDAYS = {
  ar: ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export function MonthCalendar({
  month,
  digests,
  onMonthChange,
  onSelect,
  selected,
}: {
  month: string;
  digests: DayDigest[];
  onMonthChange: (m: string) => void;
  onSelect: (date: string) => void;
  selected: string | null;
}) {
  const { t, lang } = useApp();
  const byDate = new Map(digests.map((d) => [d.date, d]));
  const days = daysInMonth(month);
  const lead = weekdayIndex(days[0]);
  const today = dubaiDate();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button className="btn-ghost h-10 min-h-0 w-10 px-0" aria-label={t('prev_month')} onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <div className="text-center">
          <p className="num text-[15px] font-extrabold text-ink">{month}</p>
          <button className="text-[12px] font-semibold text-gold" onClick={() => onMonthChange(today.slice(0, 7))}>
            {t('today')}
          </button>
        </div>
        <button className="btn-ghost h-10 min-h-0 w-10 px-0" aria-label={t('next_month')} onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted">
        {WEEKDAYS[lang].map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((date) => {
          const digest = byDate.get(date);
          const tone = dayTone(digest);
          const isToday = date === today;
          const isSelected = date === selected;
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              aria-label={date}
              className={`relative flex min-h-[58px] flex-col items-center justify-start gap-0.5 rounded-xl border p-1 transition ${
                isSelected ? 'border-gold bg-gold/10' : isToday ? 'border-info/50 bg-surface2' : 'border-line bg-surface2/60'
              }`}
            >
              <span className="num text-[13px] font-bold text-ink">{Number(date.slice(8))}</span>
              {digest ? (
                <>
                  <span className={`absolute end-1 top-1 h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
                  {digest.cashDifferenceFils !== 0 ? (
                    <span
                      className={`num text-[9px] font-bold ${digest.cashDifferenceFils > 0 ? 'text-ok' : 'text-bad'}`}
                    >
                      {digest.cashDifferenceFils > 0 ? '+' : '−'}
                      {formatCash(Math.abs(digest.cashDifferenceFils), false)}
                    </span>
                  ) : (
                    <span className="text-gold">{toneIcon(tone, 'h-3 w-3')}</span>
                  )}
                  {digest.hasGoldDifference ? <Coins className="h-3 w-3 text-gold/80" /> : null}
                </>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
        {(['short', 'over', 'matched', 'review', 'locked'] as Tone[]).map((tone) => (
          <span key={tone} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
            {tone === 'short'
              ? t('short')
              : tone === 'over'
                ? t('over')
                : tone === 'matched'
                  ? t('matched')
                  : tone === 'review'
                    ? t('st_draft')
                    : t('st_finalized')}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Simple bar chart of daily cash differences — no chart library needed. */
export function DiffChart({ digests }: { digests: DayDigest[] }) {
  const { t } = useApp();
  const rows = digests.filter((d) => d.status !== 'not_started');
  if (!rows.length) return <p className="text-[13px] text-muted">{t('no_record')}</p>;
  const max = Math.max(...rows.map((d) => Math.abs(d.cashDifferenceFils)), 1);

  return (
    <div className="flex h-28 items-center gap-[3px] overflow-x-auto">
      {rows.map((d) => {
        const h = Math.max(3, Math.round((Math.abs(d.cashDifferenceFils) / max) * 46));
        const up = d.cashDifferenceFils > 0;
        return (
          <div key={d.date} className="flex h-full min-w-[10px] flex-1 flex-col items-center justify-center" title={`${d.date}: ${formatCash(d.cashDifferenceFils)}`}>
            <div className="flex h-1/2 w-full items-end justify-center">
              {up ? <div className="w-full rounded-t bg-ok" style={{ height: `${h}px` }} /> : null}
            </div>
            <div className="h-px w-full bg-line" />
            <div className="flex h-1/2 w-full items-start justify-center">
              {!up && d.cashDifferenceFils !== 0 ? <div className="w-full rounded-b bg-bad" style={{ height: `${h}px` }} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
