'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, ClipboardCheck, Lightbulb, Lock, TriangleAlert } from 'lucide-react';
import { Card, CardTitle, Skeleton } from '@/components/ui';
import { CashDiff, DateBar, GoldDiff, StatusPill, statusTone, useActiveDate } from '@/components/bits';
import { useApp } from '@/components/providers';
import { useDay } from '@/lib/useDay';
import { addDays, dubaiDate, dubaiStamp, diffDays } from '@/lib/date';
import { TIPS } from '@/i18n/dict';
import { aed } from '@/lib/num';
import { apiGet } from '@/lib/client';
import type { GoldMovement } from '@/lib/types';

export default function HomePage() {
  const { t, lang, settings, user } = useApp();
  const router = useRouter();
  const [date, setDate, ready] = useActiveDate();
  const day = useDay(date);
  const [outstanding, setOutstanding] = useState<GoldMovement[]>([]);

  useEffect(() => {
    if (!user) {
      void apiGet<{ user: unknown }>('/api/auth/me')
        .then((m) => {
          if (!m.user) router.replace('/login');
        })
        .catch(() => undefined);
    }
  }, [user, router]);

  useEffect(() => {
    apiGet<{ outstanding: GoldMovement[] }>(`/api/history?month=${date.slice(0, 7)}`)
      .then((r) => setOutstanding(r.outstanding ?? []))
      .catch(() => undefined);
  }, [date]);

  const tip = useMemo(() => {
    const tips = TIPS[lang];
    const seed = Number(date.replaceAll('-', '')) % tips.length;
    return tips[seed];
  }, [lang, date]);

  const status = day.payload.day?.status ?? 'not_started';
  const s = day.summary;

  const alerts = useMemo(() => {
    const out: { key: string; text: string; tone: 'warn' | 'bad' | 'info' }[] = [];
    if (!settings.alertsEnabled) return out;
    const today = dubaiDate();
    for (const m of outstanding) {
      if (m.expectedReturnDate && m.expectedReturnDate < today) {
        out.push({
          key: `overdue-${m.id}`,
          tone: 'bad',
          text: `${t('mv_overdue')}: ${m.holderName} · ${m.karat}`,
        });
      }
    }
    if (status === 'draft' && diffDays(today, date) >= 1) {
      out.push({ key: 'old-draft', tone: 'warn', text: `${t('st_draft')} · ${date}` });
    }
    if (s.hasDifferences && !day.payload.day?.reasonText) {
      out.push({ key: 'no-reason', tone: 'warn', text: t('reason_required') });
    }
    if (status !== 'finalized' && status !== 'locked' && date < today) {
      out.push({ key: 'not-final', tone: 'info', text: `${t('finalize_drawer')} · ${date}` });
    }
    return out.slice(0, 5);
  }, [outstanding, settings.alertsEnabled, status, date, s.hasDifferences, day.payload.day?.reasonText, t]);

  const primary = (() => {
    if (status === 'finalized' || status === 'locked') return { label: t('review_today'), href: '/reports' };
    if (status === 'not_started') return { label: t('start_check'), href: '/cash' };
    if (s.allMatched && s.touched) return { label: t('finalize_drawer'), href: '/cash#finalize' };
    return { label: t('continue_check'), href: '/cash' };
  })();

  if (!ready || day.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-56" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-b from-surface to-surface2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-extrabold leading-tight tracking-wide text-gold">SADEQ DRAWER</h2>
            <p className="text-[13px] text-muted">{t('home_subtitle')}</p>
          </div>
          <StatusPill tone={statusTone(status)} label={t(`st_${status}` as 'st_draft')} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-muted">
          <div>
            <span className="label">{t('date')}</span>
            <span className="num text-[15px] font-bold text-ink">{date}</span>
          </div>
          <div className="text-end">
            <span className="label">{t('last_saved')}</span>
            <span className="text-[13px] font-semibold text-ink">{dubaiStamp(day.lastSavedAt)}</span>
          </div>
          {settings.employeeName || user?.displayName ? (
            <div className="col-span-2">
              <span className="label">{t('employee')}</span>
              <span className="text-[13px] font-semibold text-ink">{settings.employeeName || user?.displayName}</span>
            </div>
          ) : null}
        </div>
      </Card>

      <DateBar date={date} onChange={setDate} />

      <Card>
        <CardTitle title={t('today_reconciliation')} icon={<ClipboardCheck className="h-4 w-4" />} />
        <div className="space-y-0.5">
          <div className="row">
            <span className="text-[13px] font-semibold text-ink">{t('nav_cash')}</span>
            <CashDiff fils={s.cash.differenceFils} withinTolerance={s.cash.withinTolerance} />
          </div>
          {s.gold.map((g) => (
            <div className="row" key={g.karat}>
              <span className="text-[13px] font-semibold text-ink">{g.karat}</span>
              <GoldDiff mg={g.differenceMg} withinTolerance={g.withinTolerance} />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-muted">
            <span>{t('sections_matched', { a: s.sectionsMatched, b: s.sectionsTotal })}</span>
            <span className="num">{Math.round((s.sectionsMatched / s.sectionsTotal) * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{ width: `${(s.sectionsMatched / s.sectionsTotal) * 100}%` }}
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <button className="btn-primary col-span-2" onClick={() => router.push(primary.href)}>
          {primary.label}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </button>
        <button className="btn-ghost" onClick={() => router.push('/cash')}>
          {t('review_today')}
        </button>
        <button
          className="btn-ghost"
          onClick={() => setDate(addDays(date, -1))}
        >
          <CalendarDays className="h-4 w-4" />
          {t('view_previous')}
        </button>
      </div>

      <Card>
        <CardTitle title={t('quick_summary')} />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface2 p-3">
            <span className="label">{t('cash_difference')}</span>
            <p
              className={`num mt-1 text-[20px] font-extrabold ${
                s.cash.differenceFils === 0 ? 'text-gold' : s.cash.differenceFils > 0 ? 'text-ok' : 'text-bad'
              }`}
            >
              {aed(s.cash.differenceFils)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface2 p-3">
            <span className="label">{t('gold_difference')}</span>
            <p className="num mt-1 text-[20px] font-extrabold text-ink">
              {s.gold.filter((g) => g.differenceMg !== 0).length}/{s.gold.length}
            </p>
          </div>
        </div>
      </Card>

      {settings.tipsEnabled ? (
        <Card className="border-gold/30 bg-gold/5">
          <CardTitle title={t('tip_title')} icon={<Lightbulb className="h-4 w-4" />} />
          <p className="text-[13px] leading-relaxed text-ink">{tip}</p>
        </Card>
      ) : null}

      {alerts.length ? (
        <Card>
          <CardTitle title={t('alerts')} icon={<TriangleAlert className="h-4 w-4" />} />
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li
                key={a.key}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] ${
                  a.tone === 'bad'
                    ? 'border-bad/40 bg-bad/10 text-bad'
                    : a.tone === 'warn'
                      ? 'border-warn/40 bg-warn/10 text-warn'
                      : 'border-info/40 bg-info/10 text-info'
                }`}
              >
                {a.tone === 'info' ? <Lock className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                {a.text}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
