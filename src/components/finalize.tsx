'use client';

import React, { useState } from 'react';
import { Lock, TriangleAlert } from 'lucide-react';
import { Field, Modal, TextInput } from './ui';
import { useApp } from './providers';
import { aed, grams } from '@/lib/num';
import { DIFFERENCE_REASONS } from '@/lib/types';
import type { DaySummary } from '@/lib/calc';
import { apiWrite } from '@/lib/client';
import type { DictKey } from '@/i18n/dict';

const REASON_LABELS: Record<string, DictKey> = {
  unregistered_sale: 'unregistered_sales',
  duplicate_entry: 'duplicate_sales',
  counting_mistake: 'count_vs_manual',
  customer_deposit: 'amanat',
  debt: 'debts',
  commission: 'commissions',
  gold_with_person: 'gold_with_others',
  borrowed_gold: 'third_party_gold',
  system_mistake: 'system_errors',
  other: 'reason',
};

export function FinalizeDialog({
  open,
  onClose,
  dayId,
  summary,
  initialReason,
  initialReasons,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  dayId: string | null;
  summary: DaySummary;
  initialReason: string | null;
  initialReasons: string[];
  onDone: () => void;
}) {
  const { t, toast } = useApp();
  const [reason, setReason] = useState(initialReason ?? '');
  const [reasons, setReasons] = useState<string[]>(initialReasons);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setReason(initialReason ?? '');
      setReasons(initialReasons);
      setError(null);
    }
  }, [open, initialReason, initialReasons]);

  const hasDiff = summary.hasDifferences;

  const finalize = async () => {
    if (!dayId) return;
    if (hasDiff && reason.trim().length < 3) {
      setError(t('reason_required'));
      return;
    }
    setBusy(true);
    try {
      await apiWrite('/api/day/finalize', { dayId, confirm: true, reasonText: reason || null, differenceReasons: reasons, notes: notes || null }, 'POST', { queue: false });
      toast(t('st_finalized'), 'ok');
      onDone();
      onClose();
    } catch (e) {
      const code = (e as Error).message;
      setError(code === 'reason_required' ? t('reason_required') : code === 'system_cash_required' ? t('system_cash') : t('error_generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('finalize_title')}
      wide
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary flex-1" onClick={finalize} disabled={busy}>
            <Lock className="h-4 w-4" />
            {t('finalize_confirm')}
          </button>
        </>
      }
    >
      <p className="text-[13px] text-muted">{t('finalize_summary')}</p>

      <div className="rounded-xl border border-line bg-surface2 p-3">
        <div className="flex items-center justify-between border-b border-line/60 py-1.5">
          <span className="text-[13px] font-semibold text-ink">{t('cash_difference')}</span>
          <span
            className={`num text-[15px] font-bold ${
              summary.cash.differenceFils === 0 ? 'text-gold' : summary.cash.differenceFils > 0 ? 'text-ok' : 'text-bad'
            }`}
          >
            {aed(summary.cash.differenceFils)}
          </span>
        </div>
        {summary.gold.map((g) => (
          <div key={g.karat} className="flex items-center justify-between border-b border-line/60 py-1.5 last:border-0">
            <span className="text-[13px] text-muted">{g.karat}</span>
            <span
              className={`num text-[14px] font-semibold ${
                g.differenceMg === 0 ? 'text-gold' : g.differenceMg > 0 ? 'text-ok' : 'text-bad'
              }`}
            >
              {grams(g.differenceMg)}
            </span>
          </div>
        ))}
      </div>

      {hasDiff ? (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('reason_required')}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DIFFERENCE_REASONS.map((r) => {
              const active = reasons.includes(r);
              return (
                <button
                  key={r}
                  onClick={() => setReasons((list) => (active ? list.filter((x) => x !== r) : [...list, r]))}
                  className={`chip border ${active ? 'border-gold bg-gold/15 text-gold' : 'border-line bg-surface2 text-muted'}`}
                >
                  {t(REASON_LABELS[r])}
                </button>
              );
            })}
          </div>
          <Field label={t('difference_reason')} error={error}>
            <textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </>
      ) : null}

      <Field label={t('note')}>
        <TextInput value={notes} onChange={setNotes} ariaLabel={t('note')} />
      </Field>
    </Modal>
  );
}

export { REASON_LABELS };
