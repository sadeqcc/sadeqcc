'use client';

import { useMemo, useState } from 'react';
import { Coins, Scale } from 'lucide-react';
import { Card, CardTitle, Field, NumberInput, Skeleton } from '@/components/ui';
import { DateBar, GoldDiff, KeyValue, useActiveDate } from '@/components/bits';
import { LockedBar } from '@/components/day-actions';
import { useApp } from '@/components/providers';
import { AddButton, MovementDialog, MovementList, ReturnDialog } from '@/components/gold';
import { useDay } from '@/lib/useDay';
import { formatGold, grams, parseGold } from '@/lib/num';
import type { GoldMovement } from '@/lib/types';

const ASHRAF = { name: 'Ashraf', type: 'ashraf' as const };

export default function GoldPage() {
  const { t, toast, confirm, settings } = useApp();
  const [date, setDate, ready] = useActiveDate();
  const day = useDay(date);
  const [open, setOpen] = useState<{ karat: string; direction: 'out' | 'in'; fixed?: { name: string; type: 'ashraf' } } | null>(null);
  const [returning, setReturning] = useState<GoldMovement | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const karats = settings.karats;
  const rowByKarat = useMemo(() => {
    const map: Record<string, { systemMg: number; drawerMg: number }> = {};
    for (const r of day.payload.goldRows) map[r.karat] = { systemMg: Number(r.systemMg), drawerMg: Number(r.drawerMg) };
    return map;
  }, [day.payload.goldRows]);

  const deleteMovement = async (m: GoldMovement) => {
    const res = await confirm({ title: t('confirm_delete'), body: t('confirm_delete_body'), danger: true, confirmLabel: t('delete') });
    if (!res.ok) return;
    const okDel = await day.deleteRecord('gold_movements', m.id, res.reason);
    if (okDel) {
      toast(t('deleted'), 'ok', async () => {
        await day.patchRecord('gold_movements', m.id, { restore: true, reason: 'undo' });
        toast(t('undone'), 'ok');
      });
    }
  };

  if (!ready || day.loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    );
  }

  const inbound = day.payload.movements.filter((m) => m.direction === 'in');

  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={setDate} right={day.saving ? <span className="chip bg-surface2 text-muted">{t('saving')}</span> : null} />
      {day.locked ? <LockedBar dayId={day.payload.day?.id ?? null} onUnlocked={() => void day.refresh()} /> : null}

      {day.summary.gold.map((g) => {
        const row = rowByKarat[g.karat] ?? { systemMg: 0, drawerMg: 0 };
        const isOpen = expanded === g.karat;
        const karatMovements = day.payload.movements.filter((m) => m.karat === g.karat && m.direction === 'out');
        return (
          <Card key={g.karat}>
            <CardTitle
              title={g.karat}
              icon={<Coins className="h-4 w-4" />}
              action={<GoldDiff mg={g.differenceMg} withinTolerance={g.withinTolerance} />}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t('system_weight')} (g)`}>
                <NumberInput
                  value={row.systemMg ? formatGold(row.systemMg, false) : ''}
                  disabled={day.locked}
                  ariaLabel={`${g.karat} ${t('system_weight')}`}
                  onChange={(v) => {
                    const mg = parseGold(v);
                    if (mg !== null || v === '') void day.saveGold(g.karat, { systemMg: v === '' ? 0 : mg! });
                  }}
                />
              </Field>
              <Field label={`${t('drawer_weight')} (g)`}>
                <NumberInput
                  value={row.drawerMg ? formatGold(row.drawerMg, false) : ''}
                  disabled={day.locked}
                  ariaLabel={`${g.karat} ${t('drawer_weight')}`}
                  onChange={(v) => {
                    const mg = parseGold(v);
                    if (mg !== null || v === '') void day.saveGold(g.karat, { drawerMg: v === '' ? 0 : mg! });
                  }}
                />
              </Field>
            </div>

            <div className="mt-2 rounded-xl border border-line bg-surface2 p-3">
              <KeyValue label={t('drawer_weight')} value={formatGold(g.drawerMg)} />
              {g.karat === '21K' ? (
                <KeyValue label={`+ ${t('with_ashraf')}`} value={formatGold(g.withAshrafMg)} tone="ok" />
              ) : null}
              <KeyValue
                label={`+ ${t('gold_with_others')}`}
                value={formatGold(g.outTotalMg - (g.karat === '21K' ? g.withAshrafMg : 0))}
                tone="ok"
              />
              <KeyValue label={`− ${t('third_party_gold')}`} value={formatGold(g.thirdPartyMg)} tone="bad" />
              <KeyValue label={t('accounted_weight')} value={formatGold(g.accountedMg)} strong tone="gold" />
              <KeyValue label={t('system_weight')} value={formatGold(g.systemMg)} />
              <KeyValue
                label={t('difference')}
                value={formatGold(g.differenceMg)}
                strong
                tone={g.differenceMg === 0 ? 'gold' : g.differenceMg > 0 ? 'ok' : 'bad'}
              />
            </div>

            {g.karat === '21K' ? (
              <div className="mt-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] font-bold text-gold">{t('with_ashraf')}</span>
                  <span className="num text-[14px] font-extrabold text-gold">{grams(g.withAshrafMg)}</span>
                </div>
                <p className="mb-2 text-[11px] text-muted">{t('total_with_ashraf')}</p>
                {!day.locked ? (
                  <AddButton label={`+ ${t('with_ashraf')}`} onClick={() => setOpen({ karat: '21K', direction: 'out', fixed: ASHRAF })} />
                ) : null}
              </div>
            ) : null}

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="btn-ghost text-[13px]" onClick={() => setExpanded(isOpen ? null : g.karat)}>
                <Scale className="h-4 w-4" />
                {t('movements')} ({karatMovements.length})
              </button>
              {!day.locked ? (
                <button className="btn-ghost text-[13px]" onClick={() => setOpen({ karat: g.karat, direction: 'out' })}>
                  {t('add_person_location')}
                </button>
              ) : null}
            </div>

            {isOpen ? (
              <ul className="mt-2 space-y-2">
                {karatMovements.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-line py-4 text-center text-[13px] text-muted">
                    {t('no_movements')}
                  </li>
                ) : (
                  karatMovements.map((m) => (
                    <li key={m.id}>
                      <MovementList
                        title=""
                        movements={[m]}
                        locked={day.locked}
                        onReturn={setReturning}
                        onDelete={deleteMovement}
                      />
                    </li>
                  ))
                )}
              </ul>
            ) : null}

            {!day.locked ? (
              <div className="mt-2">
                <AddButton label={t('add_third_party')} onClick={() => setOpen({ karat: g.karat, direction: 'in' })} />
              </div>
            ) : null}
          </Card>
        );
      })}

      <MovementList
        title={t('third_party_gold')}
        movements={inbound}
        locked={day.locked}
        onReturn={setReturning}
        onDelete={deleteMovement}
      />

      <MovementDialog
        open={!!open}
        karat={open?.karat ?? karats[0]}
        direction={open?.direction ?? 'out'}
        fixedHolder={open?.fixed}
        defaultDate={date}
        onClose={() => setOpen(null)}
        onSubmit={(body) => day.addRecord('gold_movements', body)}
      />

      <ReturnDialog
        open={!!returning}
        movement={returning}
        onClose={() => setReturning(null)}
        onSubmit={(id, mg, d) => day.returnMovement(id, mg, d)}
      />
    </div>
  );
}
