'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, Calculator, Lock, Plus, Sparkles, Trash2, Pencil } from 'lucide-react';
import { Card, CardTitle, EmptyState, Field, NumberInput, Segmented, Skeleton } from '@/components/ui';
import { CashDiff, DateBar, KeyValue, useActiveDate } from '@/components/bits';
import { CopyPreviousButton, LockedBar } from '@/components/day-actions';
import { useApp } from '@/components/providers';
import { AdjustmentDialog, EntrySection } from '@/components/cash-entry';
import { DenominationCounter, denomTotal } from '@/components/denominations';
import { FinalizeDialog, REASON_LABELS } from '@/components/finalize';
import { useDay } from '@/lib/useDay';
import { aed, formatCash, parseCash } from '@/lib/num';
import { CASH_ENTRY_KINDS, DIFFERENCE_REASONS, type CashEntry, type CashEntryKind } from '@/lib/types';
import type { DictKey } from '@/i18n/dict';

const SUGGESTION_LABELS: Record<string, string> = {
  maybe_unregistered_sale: 'unregistered_sales',
  maybe_deposit_not_deducted: 'amanat',
  maybe_duplicate_entry: 'duplicate_sales',
  maybe_counting_mistake: 'count_vs_manual',
  similar_entry_value: 'difference',
};

export default function CashPage() {
  const { t, toast, confirm } = useApp();
  const [date, setDate, ready] = useActiveDate();
  const day = useDay(date);
  const [showCalc, setShowCalc] = useState(false);
  const [adjDialog, setAdjDialog] = useState<{ open: boolean; item: null | { id: string; name: string; amountFils: number; direction: string; note: string | null; entryDate: string } }>({ open: false, item: null });
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const [systemCash, setSystemCash] = useState('');
  const [manualCash, setManualCash] = useState('');

  const d = day.payload.day;
  const s = day.summary.cash;

  useEffect(() => {
    if (!d) {
      setSystemCash('');
      setManualCash('');
      return;
    }
    setSystemCash(d.systemCashFils === null ? '' : formatCash(d.systemCashFils, false));
    setManualCash(d.physicalMode === 'total' ? formatCash(d.physicalCashFils, false) : '');
  }, [d?.id, d?.systemCashFils, d?.physicalMode, d?.physicalCashFils]);

  useEffect(() => {
    if (window.location.hash === '#finalize' && d && !day.locked) setFinalizeOpen(true);
  }, [d, day.locked]);

  const mode = (d?.physicalMode ?? 'total') as 'total' | 'count';
  const denoms = d?.denominations ?? {};
  const countedTotal = useMemo(() => denomTotal(denoms), [denoms]);

  const deleteEntry = async (e: CashEntry) => {
    const res = await confirm({ title: t('confirm_delete'), body: t('confirm_delete_body'), danger: true, confirmLabel: t('delete') });
    if (!res.ok) return;
    const ok = await day.deleteRecord('cash_entries', e.id, res.reason);
    if (ok) {
      toast(t('deleted'), 'ok', async () => {
        await day.patchRecord('cash_entries', e.id, { restore: true, reason: 'undo' });
        toast(t('undone'), 'ok');
      });
    }
  };

  if (!ready || day.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DateBar
        date={date}
        onChange={setDate}
        right={
          day.saving ? <span className="chip bg-surface2 text-muted">{t('saving')}</span> : null
        }
      />
      {day.locked ? (
        <LockedBar dayId={d?.id ?? null} onUnlocked={() => void day.refresh()} />
      ) : (
        <CopyPreviousButton date={date} disabled={day.payload.entries.length > 0} onDone={() => void day.refresh()} />
      )}

      <Card>
        <CardTitle title={t('system_cash')} subtitle={t('system_cash_hint')} icon={<Banknote className="h-4 w-4" />} />
        <NumberInput
          value={systemCash}
          disabled={day.locked}
          ariaLabel={t('system_cash')}
          onChange={(v) => {
            setSystemCash(v);
            const f = parseCash(v);
            if (f !== null || v === '') void day.saveDay({ systemCashFils: v === '' ? null : v });
          }}
        />
      </Card>

      <Card>
        <CardTitle title={t('physical_cash')} />
        <Segmented
          value={mode}
          onChange={(m) => void day.saveDay({ physicalMode: m, physicalCashFils: m === 'count' ? formatCash(countedTotal, false) : manualCash || '0' }, true)}
          options={[
            { value: 'total', label: t('enter_total') },
            { value: 'count', label: t('count_notes') },
          ]}
        />
        <div className="mt-3">
          {mode === 'total' ? (
            <Field label={`${t('manual_total')} (AED)`}>
              <NumberInput
                value={manualCash}
                disabled={day.locked}
                ariaLabel={t('physical_cash')}
                onChange={(v) => {
                  setManualCash(v);
                  const f = parseCash(v);
                  if (f !== null || v === '') void day.saveDay({ physicalCashFils: v === '' ? '0' : v });
                }}
              />
            </Field>
          ) : (
            <>
              <DenominationCounter
                value={denoms}
                disabled={day.locked}
                onChange={(next) => {
                  const total = denomTotal(next);
                  void day.saveDay({ denominations: next, physicalCashFils: formatCash(total, false) });
                }}
              />
              {parseCash(manualCash) !== null && parseCash(manualCash) !== countedTotal ? (
                <p className="mt-2 text-[12px] font-semibold text-warn">
                  {t('count_vs_manual')}: {aed(countedTotal - (parseCash(manualCash) ?? 0))}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Card>

      {CASH_ENTRY_KINDS.map((kind: CashEntryKind) => (
        <EntrySection
          key={kind}
          kind={kind}
          entries={day.payload.entries}
          locked={day.locked}
          defaultDate={date}
          onAdd={(body) => day.addRecord('cash_entries', body)}
          onEdit={(id, body) => day.patchRecord('cash_entries', id, body)}
          onDelete={deleteEntry}
        />
      ))}

      <Card>
        <CardTitle
          title={t('custom_adjustments')}
          subtitle={`${day.payload.adjustments.length}`}
          action={
            !day.locked ? (
              <button className="btn-ghost px-3 py-1.5 text-[13px]" onClick={() => setAdjDialog({ open: true, item: null })}>
                <Plus className="h-4 w-4" />
                {t('add')}
              </button>
            ) : null
          }
        />
        {day.payload.adjustments.length === 0 ? (
          <EmptyState text={t('no_records')} />
        ) : (
          <ul className="space-y-0.5">
            {day.payload.adjustments.map((a) => {
              const positive = a.direction.startsWith('add');
              const sideLabel = a.direction.endsWith('physical') ? t('adjusted_physical') : t('adjusted_system');
              return (
                <li key={a.id} className="row">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-ink">{a.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {positive ? '+' : '−'} {sideLabel} · {a.createdBy ? '' : ''}
                      {a.note ? ` · ${a.note}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={`num text-[14px] font-bold ${positive ? 'text-ok' : 'text-bad'}`}>
                      {positive ? '+' : '−'}
                      {formatCash(Number(a.amountFils))}
                    </span>
                    {!day.locked ? (
                      <>
                        <button
                          className="rounded-lg p-2 text-muted hover:text-gold"
                          aria-label={t('edit')}
                          onClick={() =>
                            setAdjDialog({
                              open: true,
                              item: {
                                id: a.id,
                                name: a.name,
                                amountFils: Number(a.amountFils),
                                direction: a.direction,
                                note: a.note,
                                entryDate: a.entryDate,
                              },
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg p-2 text-muted hover:text-bad"
                          aria-label={t('delete')}
                          onClick={async () => {
                            const res = await confirm({ title: t('confirm_delete'), body: t('confirm_delete_body'), danger: true, confirmLabel: t('delete') });
                            if (!res.ok) return;
                            const okDel = await day.deleteRecord('cash_adjustments', a.id, res.reason);
                            if (okDel) {
                              toast(t('deleted'), 'ok', async () => {
                                await day.patchRecord('cash_adjustments', a.id, { restore: true, reason: 'undo' });
                                toast(t('undone'), 'ok');
                              });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------ result */}
      <Card className="border-gold/40">
        <CardTitle title={t('difference')} icon={<Calculator className="h-4 w-4" />} />
        <div className="mb-3 flex flex-col items-center gap-2 rounded-xl border border-line bg-surface2 py-4">
          <span
            className={`num text-[30px] font-extrabold ${
              s.differenceFils === 0 ? 'text-gold' : s.differenceFils > 0 ? 'text-ok' : 'text-bad'
            }`}
          >
            {aed(s.differenceFils)}
          </span>
          <CashDiff fils={s.differenceFils} withinTolerance={s.withinTolerance} />
        </div>

        <button className="btn-ghost w-full" onClick={() => setShowCalc((v) => !v)}>
          {showCalc ? t('hide_calculation') : t('show_calculation')}
        </button>

        {showCalc ? (
          <div className="mt-3 rounded-xl border border-line bg-surface2 p-3">
            <KeyValue label={t('physical_cash')} value={formatCash(s.physicalCashFils)} />
            {s.lines
              .filter((l) => l.side === 'physical' && l.amountFils !== 0)
              .map((l) => (
                <KeyValue
                  key={l.key}
                  label={`${l.sign === 1 ? '+' : '−'} ${t(l.label as DictKey)}`}
                  value={formatCash(l.amountFils)}
                  tone={l.sign === 1 ? 'ok' : 'bad'}
                />
              ))}
            {s.adjustPhysicalAdd ? <KeyValue label={`+ ${t('custom_adjustments')}`} value={formatCash(s.adjustPhysicalAdd)} tone="ok" /> : null}
            {s.adjustPhysicalSub ? <KeyValue label={`− ${t('custom_adjustments')}`} value={formatCash(s.adjustPhysicalSub)} tone="bad" /> : null}
            <KeyValue label={t('adjusted_physical')} value={formatCash(s.adjustedPhysicalFils)} strong tone="gold" />

            <div className="my-2 h-px bg-line" />

            <KeyValue label={t('system_cash')} value={formatCash(s.systemCashFils)} />
            {s.lines
              .filter((l) => l.side === 'system' && l.amountFils !== 0)
              .map((l) => (
                <KeyValue key={l.key} label={`− ${t(l.label as DictKey)}`} value={formatCash(l.amountFils)} tone="bad" />
              ))}
            {s.adjustSystemAdd ? <KeyValue label={`+ ${t('custom_adjustments')}`} value={formatCash(s.adjustSystemAdd)} tone="ok" /> : null}
            {s.adjustSystemSub ? <KeyValue label={`− ${t('custom_adjustments')}`} value={formatCash(s.adjustSystemSub)} tone="bad" /> : null}
            <KeyValue label={t('adjusted_system')} value={formatCash(s.adjustedSystemFils)} strong tone="gold" />

            <div className="my-2 h-px bg-line" />
            <KeyValue
              label={t('difference')}
              value={formatCash(s.differenceFils)}
              strong
              tone={s.differenceFils === 0 ? 'gold' : s.differenceFils > 0 ? 'ok' : 'bad'}
            />
          </div>
        ) : null}

        {s.differenceFils !== 0 ? (
          <button className="btn-ghost mt-2 w-full" onClick={() => setReviewOpen((v) => !v)}>
            <Sparkles className="h-4 w-4" />
            {t('review_difference')}
          </button>
        ) : null}

        {reviewOpen && s.differenceFils !== 0 ? (
          <div className="mt-3 space-y-3 rounded-xl border border-line bg-surface2 p-3">
            <p className="text-[12px] text-muted">{t('suggestion_note')}</p>
            <ul className="space-y-1.5">
              {day.suggestions
                .filter((x) => x.scope === 'cash')
                .map((x, i) => (
                  <li key={`${x.key}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-[12px] text-info">
                    <span>{t((SUGGESTION_LABELS[x.key] ?? 'difference') as DictKey)}</span>
                    <span className="num font-bold">{aed(x.amountFils ?? 0)}</span>
                  </li>
                ))}
            </ul>
            <div className="flex flex-wrap gap-1.5">
              {DIFFERENCE_REASONS.map((r) => {
                const list = (d?.differenceReasons ?? []) as string[];
                const active = list.includes(r);
                return (
                  <button
                    key={r}
                    disabled={day.locked}
                    onClick={() =>
                      void day.saveDay(
                        { differenceReasons: active ? list.filter((x) => x !== r) : [...list, r] },
                        true,
                      )
                    }
                    className={`chip border ${active ? 'border-gold bg-gold/15 text-gold' : 'border-line bg-surface text-muted'}`}
                  >
                    {t(REASON_LABELS[r] as DictKey)}
                  </button>
                );
              })}
            </div>
            <Field label={t('difference_reason')}>
              <textarea
                className="input min-h-[70px]"
                disabled={day.locked}
                value={d?.reasonText ?? ''}
                onChange={(e) => void day.saveDay({ reasonText: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-2 pb-2">
        <button className="btn-ghost" onClick={() => void day.refresh()}>
          {t('recalculate')}
        </button>
        <button
          className="btn-primary"
          disabled={day.locked || !d}
          onClick={() => setFinalizeOpen(true)}
        >
          <Lock className="h-4 w-4" />
          {t('finalize_drawer')}
        </button>
      </div>

      <AdjustmentDialog
        open={adjDialog.open}
        initial={adjDialog.item}
        defaultDate={date}
        onClose={() => setAdjDialog({ open: false, item: null })}
        onSubmit={(body) =>
          adjDialog.item
            ? day.patchRecord('cash_adjustments', adjDialog.item.id, body)
            : day.addRecord('cash_adjustments', body)
        }
      />

      <FinalizeDialog
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        dayId={d?.id ?? null}
        summary={day.summary}
        initialReason={d?.reasonText ?? null}
        initialReasons={(d?.differenceReasons ?? []) as string[]}
        onDone={() => void day.refresh()}
      />
    </div>
  );
}
