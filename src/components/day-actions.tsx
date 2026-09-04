'use client';

import { useState } from 'react';
import { CopyPlus, Lock, Unlock } from 'lucide-react';
import { useApp } from './providers';
import { apiWrite } from '@/lib/client';
import { addDays } from '@/lib/date';

/** A finalized day stays locked until the PIN and a written reason are given. */
export function LockedBar({ dayId, onUnlocked }: { dayId: string | null; onUnlocked: () => void }) {
  const { t, confirm, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!dayId) return;
    const res = await confirm({
      title: t('edit_finalized'),
      body: t('day_locked'),
      confirmLabel: t('confirm'),
      requirePin: true,
      requireReason: true,
    });
    if (!res.ok) return;
    setBusy(true);
    try {
      await apiWrite('/api/day/unlock', { dayId, pin: res.pin, reason: res.reason }, 'POST', { queue: false });
      toast(t('saved'), 'ok');
      onUnlocked();
    } catch (e) {
      toast((e as Error).message === 'bad_pin' ? t('bad_pin') : t('error_generic'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-lock/40 bg-lock/10 px-3 py-2.5 no-print">
      <Lock className="h-4 w-4 shrink-0 text-lock" />
      <span className="flex-1 text-[13px] text-lock">{t('day_locked')}</span>
      <button className="btn-ghost h-9 min-h-0 px-3 text-[12px]" onClick={() => void unlock()} disabled={busy}>
        <Unlock className="h-3.5 w-3.5" />
        {t('edit_finalized')}
      </button>
    </div>
  );
}

/** Starts a day from yesterday's carry-over balances (never its sales). */
export function CopyPreviousButton({
  date,
  disabled,
  onDone,
}: {
  date: string;
  disabled?: boolean;
  onDone: () => void;
}) {
  const { t, confirm, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (disabled) return null;

  return (
    <button
      className="btn-ghost mb-3 w-full text-[13px] no-print"
      disabled={busy}
      onClick={async () => {
        const res = await confirm({
          title: t('duplicate_prev_day'),
          body: `${addDays(date, -1)} → ${date}`,
          confirmLabel: t('confirm'),
        });
        if (!res.ok) return;
        setBusy(true);
        try {
          const r = await apiWrite<{ copied: number }>('/api/day/duplicate', { toDate: date, confirm: true }, 'POST', { queue: false });
          toast(`${t('saved')} · ${r?.copied ?? 0}`, 'ok');
          onDone();
        } catch (e) {
          const code = (e as Error).message;
          toast(code === 'source_not_found' ? t('no_record') : code === 'target_not_empty' ? t('error_generic') : t('error_generic'), 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <CopyPlus className="h-4 w-4" />
      {t('duplicate_prev_day')}
    </button>
  );
}
