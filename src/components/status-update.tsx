'use client';

import { useMemo, useState } from 'react';
import { useApp } from './providers';
import { EntityPicker } from './pickers';
import { DateInput, Field, Modal, NumberInput, Select, Spinner, TextArea, TextInput } from './ui';
import { ApiError, apiWrite } from '@/lib/client';
import { dubaiDate } from '@/lib/date';
import { formatMoney, formatWeight, parseMoney, parseWeight } from '@/lib/num';
import { compareWeight, WEIGHT_VERDICT_KEY } from '@/lib/calc';
import {
  CANCEL_REASONS,
  DELIVERY_METHODS,
  QUALITY_CHECKS,
  STATUS_ICON,
  STATUS_KEY,
  type OrderStatus,
  type OrderView,
} from '@/lib/types';

/**
 * One dialog drives every status move. Each target status asks only for what it
 * genuinely needs, and the previous history is never rewritten.
 */
export function StatusUpdateDialog({
  order,
  target,
  onClose,
  onUpdated,
}: {
  order: OrderView;
  target: OrderStatus | null;
  onClose: () => void;
  onUpdated: (order: OrderView) => void;
}) {
  const { settings, toast, confirm, t } = useApp();
  const today = dubaiDate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [makerId, setMakerId] = useState<string | null>(order.makerId);
  const [travelerId, setTravelerId] = useState<string | null>(order.travelerId);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const actualWeightMg = parseWeight(form.actualWeight ?? '') ?? order.actualWeightMg;
  const weightCheck = useMemo(
    () =>
      actualWeightMg === null
        ? null
        : compareWeight(order.expectedWeightMg, actualWeightMg, {
            minimumMg: order.minimumWeightMg,
            maximumMg: order.maximumWeightMg,
            toleranceMg: settings.defaultToleranceMg,
          }),
    [actualWeightMg, order, settings.defaultToleranceMg],
  );

  const finalPaymentFils = parseMoney(form.finalPayment ?? '') ?? 0;
  const remainingAfterFinal = Math.max(order.remainingBalanceFils - finalPaymentFils, 0);

  const submit = async (acknowledgeBalance = false) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        toStatus: target,
        note: form.note || null,
        acknowledgeBalance,
      };

      if (target === 'maker') {
        body.makerId = makerId;
        body.sentToMakerDate = form.sentToMakerDate || today;
        body.expectedReadyDate = form.expectedReadyDate || order.expectedReadyDate;
        body.makerReference = form.makerReference || null;
        body.makerCostFils = parseMoney(form.makerCost ?? '') ?? null;
        body.makerNotes = form.makerNotes || null;
      }
      if (target === 'ready') {
        body.actualWeightMg = actualWeightMg;
        body.readyDate = form.readyDate || today;
        body.makerCostFils = parseMoney(form.makerCost ?? '') ?? null;
        body.qualityCheck = form.qualityCheck || null;
      }
      if (target === 'traveler') {
        body.travelerId = travelerId;
        body.destination = form.destination || order.destination;
        body.departureDate = form.departureDate || null;
        body.expectedArrival = form.expectedArrival || null;
        body.flightNumber = form.flightNumber || null;
        body.airline = form.airline || null;
        body.packageRef = form.packageRef || null;
      }
      if (target === 'arrived') {
        body.arrivalDate = form.arrivalDate || today;
        body.arrivalTime = form.arrivalTime || null;
        body.destination = form.destination || order.destination;
        body.receivedBy = form.receivedBy || null;
      }
      if (target === 'delivered') {
        body.deliveredDate = form.deliveredDate || today;
        body.deliveredTime = form.deliveredTime || null;
        body.receivedBy = form.receivedBy || null;
        body.deliveryMethod = form.deliveryMethod || 'Shop Pickup';
        if (finalPaymentFils > 0) {
          body.finalPaymentFils = finalPaymentFils;
          body.finalPaymentMethod = form.finalPaymentMethod || 'Cash';
        }
      }
      if (target === 'cancelled') {
        if (!form.cancelReason) {
          setError(t('choose_cancel_reason'));
          setBusy(false);
          return;
        }
        body.cancelReason = form.cancelReason;
        body.cancelNote = form.cancelNote || null;
      }

      const res = await apiWrite<{ order: OrderView }>(`/api/orders/${order.id}/status`, body, 'POST', { queue: false });
      if (res) {
        onUpdated(res.order);
        toast(t('moved_to', { status: t(STATUS_KEY[target]) }));
        onClose();
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'balance_outstanding') {
        const outstanding = Number(e.extra?.remainingBalanceFils ?? order.remainingBalanceFils);
        const c = await confirm({
          title: t('balance_warning_title'),
          body: `⚠ ${t('balance_warning_body', { amount: `${settings.currency} ${formatMoney(outstanding)}` })}`,
          confirmLabel: t('deliver_anyway'),
          danger: true,
        });
        if (c.ok) await submit(true);
        return;
      }
      if (e instanceof ApiError) {
        setError(
          e.code === 'maker_required'
            ? t('choose_maker_first')
            : e.code === 'traveler_required'
              ? t('choose_traveler_first')
              : e.code === 'actual_weight_required'
                ? t('enter_actual_weight')
                : e.code === 'cancel_reason_required'
                  ? t('choose_cancel_reason')
                  : t('could_not_update_status'),
        );
      } else {
        setError(t('could_not_update_status'));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!target) return null;
  const returningToMaker = target === 'maker' && order.status === 'ready';

  return (
    <Modal
      open
      onClose={onClose}
      title={`${STATUS_ICON[target]} ${returningToMaker ? t('return_to_maker') : t('move_to', { status: t(STATUS_KEY[target]) })}`}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className={target === 'cancelled' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            onClick={() => void submit(false)}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            {t('confirm')}
          </button>
        </>
      }
    >
      {returningToMaker ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
          {t('return_to_maker_note')}
        </p>
      ) : null}

      {target === 'maker' ? (
        <>
          <EntityPicker entity="makers" label={t('maker')} required value={makerId} onChange={setMakerId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('sent_to_maker')}>
              <DateInput value={form.sentToMakerDate ?? today} onChange={(v) => set('sentToMakerDate', v)} />
            </Field>
            <Field label={t('expected_ready')}>
              <DateInput value={form.expectedReadyDate ?? order.expectedReadyDate ?? ''} onChange={(v) => set('expectedReadyDate', v)} />
            </Field>
          </div>
          <Field label={t('maker_reference')}>
            <TextInput value={form.makerReference ?? order.makerReference ?? ''} onChange={(v) => set('makerReference', v)} />
          </Field>
          <Field label={t('maker_cost')}>
            <NumberInput value={form.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
          </Field>
          <Field label={t('maker_notes')}>
            <TextArea value={form.makerNotes ?? ''} onChange={(v) => set('makerNotes', v)} />
          </Field>
        </>
      ) : null}

      {target === 'ready' ? (
        <>
          <Field label={t('actual_weight')} required hint={t('expected_is', { weight: `${formatWeight(order.expectedWeightMg)} g` })}>
            <NumberInput
              value={form.actualWeight ?? (order.actualWeightMg !== null ? formatWeight(order.actualWeightMg, false) : '')}
              onChange={(v) => set('actualWeight', v)}
              suffix="g"
              autoFocus
            />
          </Field>
          {weightCheck ? (
            <p
              className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${
                weightCheck.verdict === 'within'
                  ? 'bg-ok/10 text-ok'
                  : weightCheck.verdict === 'slight'
                    ? 'bg-warn/10 text-warn'
                    : 'bg-bad/10 text-bad'
              }`}
            >
              {t('difference')} {weightCheck.differenceMg >= 0 ? '+' : '−'}
              {formatWeight(Math.abs(weightCheck.differenceMg))} g · {t(WEIGHT_VERDICT_KEY[weightCheck.verdict])}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('ready_date')}>
              <DateInput value={form.readyDate ?? today} onChange={(v) => set('readyDate', v)} />
            </Field>
            <Field label={t('maker_cost')}>
              <NumberInput value={form.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label={t('quality_check')}>
            <Select
              value={form.qualityCheck ?? ''}
              onChange={(v) => set('qualityCheck', v)}
              placeholder={t('not_checked')}
              options={QUALITY_CHECKS.map((q) => ({ value: q, label: q }))}
            />
          </Field>
        </>
      ) : null}

      {target === 'traveler' ? (
        <>
          <EntityPicker entity="travelers" label={t('traveler')} required value={travelerId} onChange={setTravelerId} />
          <Field label={t('destination')} required>
            <TextInput value={form.destination ?? order.destination ?? ''} onChange={(v) => set('destination', v)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('departure')}>
              <DateInput value={form.departureDate ?? ''} onChange={(v) => set('departureDate', v)} />
            </Field>
            <Field label={t('expected_arrival')}>
              <DateInput value={form.expectedArrival ?? ''} onChange={(v) => set('expectedArrival', v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('flight')}>
              <TextInput value={form.flightNumber ?? ''} onChange={(v) => set('flightNumber', v)} />
            </Field>
            <Field label={t('airline')}>
              <TextInput value={form.airline ?? ''} onChange={(v) => set('airline', v)} />
            </Field>
          </div>
          <Field label={t('package_ref')}>
            <TextInput value={form.packageRef ?? ''} onChange={(v) => set('packageRef', v)} />
          </Field>
        </>
      ) : null}

      {target === 'arrived' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('arrival_date')}>
              <DateInput value={form.arrivalDate ?? today} onChange={(v) => set('arrivalDate', v)} />
            </Field>
            <Field label={t('arrival_time')}>
              <input className="input num" type="time" value={form.arrivalTime ?? ''} onChange={(e) => set('arrivalTime', e.target.value)} aria-label={t('arrival_time')} />
            </Field>
          </div>
          <Field label={t('destination')}>
            <TextInput value={form.destination ?? order.destination ?? ''} onChange={(v) => set('destination', v)} />
          </Field>
          <Field label={t('received_by')}>
            <TextInput value={form.receivedBy ?? ''} onChange={(v) => set('receivedBy', v)} />
          </Field>
        </>
      ) : null}

      {target === 'delivered' ? (
        <>
          <div className="rounded-xl border border-line bg-surface2 p-3 text-[13px]">
            <div className="flex justify-between py-0.5">
              <span className="text-muted">{t('total')}</span>
              <span className="num font-semibold text-ink">
                {settings.currency} {formatMoney(order.totalAmountFils)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted">{t('total_paid')}</span>
              <span className="num font-semibold text-ink">
                {settings.currency} {formatMoney(order.totalPaidFils)}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <span className="font-bold text-ink">{t('remaining')}</span>
              <span className={`num font-extrabold ${remainingAfterFinal > 0 ? 'text-bad' : 'text-ok'}`}>
                {settings.currency} {formatMoney(remainingAfterFinal)}
              </span>
            </div>
          </div>
          {remainingAfterFinal > 0 ? (
            <p className="rounded-xl bg-bad/10 px-3 py-2 text-[12px] font-semibold text-bad">
              ⚠ {t('balance_chip_warning', { amount: `${settings.currency} ${formatMoney(remainingAfterFinal)}` })}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('delivered_date')}>
              <DateInput value={form.deliveredDate ?? today} onChange={(v) => set('deliveredDate', v)} />
            </Field>
            <Field label={t('delivered_time')}>
              <input className="input num" type="time" value={form.deliveredTime ?? ''} onChange={(e) => set('deliveredTime', e.target.value)} aria-label={t('delivered_time')} />
            </Field>
          </div>
          <Field label={t('received_by')}>
            <TextInput value={form.receivedBy ?? order.customerName} onChange={(v) => set('receivedBy', v)} />
          </Field>
          <Field label={t('delivery_method')}>
            <Select
              value={form.deliveryMethod ?? 'Shop Pickup'}
              onChange={(v) => set('deliveryMethod', v)}
              options={DELIVERY_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </Field>
          {order.remainingBalanceFils > 0 ? (
            <>
              <Field label={t('final_payment')} hint={t('final_payment_hint')}>
                <NumberInput value={form.finalPayment ?? ''} onChange={(v) => set('finalPayment', v)} suffix={settings.currency} />
              </Field>
              <Field label={t('payment_method')}>
                <Select
                  value={form.finalPaymentMethod ?? 'Cash'}
                  onChange={(v) => set('finalPaymentMethod', v)}
                  options={settings.paymentMethods.map((m) => ({ value: m, label: m }))}
                />
              </Field>
            </>
          ) : null}
        </>
      ) : null}

      {target === 'cancelled' ? (
        <>
          <Field label={t('cancel_reason')} required>
            <Select
              value={form.cancelReason ?? ''}
              onChange={(v) => set('cancelReason', v)}
              placeholder={t('choose_reason')}
              options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))}
            />
          </Field>
          <Field label={t('cancel_details')}>
            <TextArea value={form.cancelNote ?? ''} onChange={(v) => set('cancelNote', v)} />
          </Field>
          <p className="rounded-xl bg-surface2 px-3 py-2 text-[12px] text-muted">
            {t('cancel_note_hint')}
          </p>
        </>
      ) : null}

      <Field label={t('timeline_note')}>
        <TextArea value={form.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
      </Field>

      {error ? <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] font-semibold text-bad">{error}</p> : null}
    </Modal>
  );
}
