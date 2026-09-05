'use client';

import { useMemo, useState } from 'react';
import { useApp } from './providers';
import { EntityPicker } from './pickers';
import { DateInput, Field, Modal, NumberInput, Select, Spinner, TextArea, TextInput } from './ui';
import { ApiError, apiWrite } from '@/lib/client';
import { dubaiDate } from '@/lib/date';
import { formatMoney, formatWeight, parseMoney, parseWeight } from '@/lib/num';
import { compareWeight, WEIGHT_VERDICT_LABEL } from '@/lib/calc';
import {
  CANCEL_REASONS,
  DELIVERY_METHODS,
  QUALITY_CHECKS,
  STATUS_ICON,
  STATUS_LABEL,
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
  const { settings, toast, confirm } = useApp();
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
          setError('Choose a cancellation reason.');
          setBusy(false);
          return;
        }
        body.cancelReason = form.cancelReason;
        body.cancelNote = form.cancelNote || null;
      }

      const res = await apiWrite<{ order: OrderView }>(`/api/orders/${order.id}/status`, body, 'POST', { queue: false });
      if (res) {
        onUpdated(res.order);
        toast(`Order moved to ${STATUS_LABEL[target]}`);
        onClose();
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'balance_outstanding') {
        const outstanding = Number(e.extra?.remainingBalanceFils ?? order.remainingBalanceFils);
        const c = await confirm({
          title: 'Customer still has a balance',
          body: `⚠ ${settings.currency} ${formatMoney(outstanding)} is still outstanding. Deliver anyway?`,
          confirmLabel: 'Deliver anyway',
          danger: true,
        });
        if (c.ok) await submit(true);
        return;
      }
      if (e instanceof ApiError) {
        setError(
          e.code === 'maker_required'
            ? 'Choose a maker first.'
            : e.code === 'traveler_required'
              ? 'Choose a traveler first.'
              : e.code === 'actual_weight_required'
                ? 'Enter the actual weight.'
                : e.code === 'cancel_reason_required'
                  ? 'Choose a cancellation reason.'
                  : 'Could not update the status.',
        );
      } else {
        setError('Could not update the status.');
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
      title={`${STATUS_ICON[target]} ${returningToMaker ? 'Return to maker' : `Move to ${STATUS_LABEL[target]}`}`}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={target === 'cancelled' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
            onClick={() => void submit(false)}
            disabled={busy}
          >
            {busy ? <Spinner /> : null}
            Confirm
          </button>
        </>
      }
    >
      {returningToMaker ? (
        <p className="rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
          The Ready event stays in the timeline — this is recorded as a return, not a correction.
        </p>
      ) : null}

      {target === 'maker' ? (
        <>
          <EntityPicker entity="makers" label="Maker" required value={makerId} onChange={setMakerId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Sent to maker">
              <DateInput value={form.sentToMakerDate ?? today} onChange={(v) => set('sentToMakerDate', v)} />
            </Field>
            <Field label="Expected ready">
              <DateInput value={form.expectedReadyDate ?? order.expectedReadyDate ?? ''} onChange={(v) => set('expectedReadyDate', v)} />
            </Field>
          </div>
          <Field label="Maker reference">
            <TextInput value={form.makerReference ?? order.makerReference ?? ''} onChange={(v) => set('makerReference', v)} />
          </Field>
          <Field label="Maker cost">
            <NumberInput value={form.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
          </Field>
          <Field label="Maker notes">
            <TextArea value={form.makerNotes ?? ''} onChange={(v) => set('makerNotes', v)} />
          </Field>
        </>
      ) : null}

      {target === 'ready' ? (
        <>
          <Field label="Actual weight" required hint={`Expected ${formatWeight(order.expectedWeightMg)} g`}>
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
              Difference {weightCheck.differenceMg >= 0 ? '+' : '−'}
              {formatWeight(Math.abs(weightCheck.differenceMg))} g · {WEIGHT_VERDICT_LABEL[weightCheck.verdict]}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ready date">
              <DateInput value={form.readyDate ?? today} onChange={(v) => set('readyDate', v)} />
            </Field>
            <Field label="Maker cost">
              <NumberInput value={form.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label="Quality check">
            <Select
              value={form.qualityCheck ?? ''}
              onChange={(v) => set('qualityCheck', v)}
              placeholder="Not checked"
              options={QUALITY_CHECKS.map((q) => ({ value: q, label: q }))}
            />
          </Field>
        </>
      ) : null}

      {target === 'traveler' ? (
        <>
          <EntityPicker entity="travelers" label="Traveler" required value={travelerId} onChange={setTravelerId} />
          <Field label="Destination" required>
            <TextInput value={form.destination ?? order.destination ?? ''} onChange={(v) => set('destination', v)} placeholder="Bamako, Mali" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Departure date">
              <DateInput value={form.departureDate ?? ''} onChange={(v) => set('departureDate', v)} />
            </Field>
            <Field label="Expected arrival">
              <DateInput value={form.expectedArrival ?? ''} onChange={(v) => set('expectedArrival', v)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Flight number">
              <TextInput value={form.flightNumber ?? ''} onChange={(v) => set('flightNumber', v)} />
            </Field>
            <Field label="Airline">
              <TextInput value={form.airline ?? ''} onChange={(v) => set('airline', v)} />
            </Field>
          </div>
          <Field label="Bag / package reference">
            <TextInput value={form.packageRef ?? ''} onChange={(v) => set('packageRef', v)} />
          </Field>
        </>
      ) : null}

      {target === 'arrived' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Arrival date">
              <DateInput value={form.arrivalDate ?? today} onChange={(v) => set('arrivalDate', v)} />
            </Field>
            <Field label="Arrival time">
              <input className="input num" type="time" value={form.arrivalTime ?? ''} onChange={(e) => set('arrivalTime', e.target.value)} aria-label="Arrival time" />
            </Field>
          </div>
          <Field label="Destination">
            <TextInput value={form.destination ?? order.destination ?? ''} onChange={(v) => set('destination', v)} />
          </Field>
          <Field label="Received by">
            <TextInput value={form.receivedBy ?? ''} onChange={(v) => set('receivedBy', v)} placeholder="Who took delivery locally" />
          </Field>
        </>
      ) : null}

      {target === 'delivered' ? (
        <>
          <div className="rounded-xl border border-line bg-surface2 p-3 text-[13px]">
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Total</span>
              <span className="num font-semibold text-ink">
                {settings.currency} {formatMoney(order.totalAmountFils)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted">Paid</span>
              <span className="num font-semibold text-ink">
                {settings.currency} {formatMoney(order.totalPaidFils)}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <span className="font-bold text-ink">Remaining</span>
              <span className={`num font-extrabold ${remainingAfterFinal > 0 ? 'text-bad' : 'text-ok'}`}>
                {settings.currency} {formatMoney(remainingAfterFinal)}
              </span>
            </div>
          </div>
          {remainingAfterFinal > 0 ? (
            <p className="rounded-xl bg-bad/10 px-3 py-2 text-[12px] font-semibold text-bad">
              ⚠ Customer still has {settings.currency} {formatMoney(remainingAfterFinal)} balance
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Delivered date">
              <DateInput value={form.deliveredDate ?? today} onChange={(v) => set('deliveredDate', v)} />
            </Field>
            <Field label="Delivered time">
              <input className="input num" type="time" value={form.deliveredTime ?? ''} onChange={(e) => set('deliveredTime', e.target.value)} aria-label="Delivered time" />
            </Field>
          </div>
          <Field label="Received by">
            <TextInput value={form.receivedBy ?? order.customerName} onChange={(v) => set('receivedBy', v)} />
          </Field>
          <Field label="Delivery method">
            <Select
              value={form.deliveryMethod ?? 'Shop Pickup'}
              onChange={(v) => set('deliveryMethod', v)}
              options={DELIVERY_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </Field>
          {order.remainingBalanceFils > 0 ? (
            <>
              <Field label="Final payment" hint="Recorded as a real payment in the history">
                <NumberInput value={form.finalPayment ?? ''} onChange={(v) => set('finalPayment', v)} suffix={settings.currency} />
              </Field>
              <Field label="Payment method">
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
          <Field label="Cancellation reason" required>
            <Select
              value={form.cancelReason ?? ''}
              onChange={(v) => set('cancelReason', v)}
              placeholder="Choose a reason"
              options={CANCEL_REASONS.map((r) => ({ value: r, label: r }))}
            />
          </Field>
          <Field label="Details">
            <TextArea value={form.cancelNote ?? ''} onChange={(v) => set('cancelNote', v)} />
          </Field>
          <p className="rounded-xl bg-surface2 px-3 py-2 text-[12px] text-muted">
            Cancelled orders are kept forever and excluded from financial totals.
          </p>
        </>
      ) : null}

      <Field label="Note for the timeline">
        <TextArea value={form.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
      </Field>

      {error ? <p className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] font-semibold text-bad">{error}</p> : null}
    </Modal>
  );
}
