'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from './providers';
import { CardTitle, DateInput, Field, Modal, NumberInput, Select, Spinner, TextArea, TextInput } from './ui';
import { apiWrite, uuid } from '@/lib/client';
import { dubaiDate, dubaiShort } from '@/lib/date';
import { formatMoney, formatWeight, goldValueFils, parseMoney, parseWeight } from '@/lib/num';
import { balanceOf, BALANCE_LABEL } from '@/lib/calc';
import { KARATS, type GoldExchange, type OrderView, type Payment } from '@/lib/types';
import { BalanceBadge } from './bits';

export function PaymentsPanel({
  order,
  payments,
  exchanges,
  onChange,
}: {
  order: OrderView;
  payments: Payment[];
  exchanges: GoldExchange[];
  onChange: (next: { payments?: Payment[]; exchanges?: GoldExchange[]; order?: Partial<OrderView> }) => void;
}) {
  const { settings, toast, confirm, can } = useApp();
  const today = dubaiDate();
  const [adding, setAdding] = useState<'payment' | 'exchange' | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const bal = balanceOf(order.totalAmountFils, payments, exchanges);

  const openPayment = () => {
    setForm({ paidOn: today, method: settings.paymentMethods[0] ?? 'Cash', amount: '' });
    setAdding('payment');
  };
  const openExchange = () => {
    setForm({ receivedOn: today, karat: order.karat, weight: '', rate: '' });
    setAdding('exchange');
  };

  const exchangeValue = (() => {
    const mg = parseWeight(form.weight ?? '') ?? 0;
    const rate = parseMoney(form.rate ?? '') ?? 0;
    return goldValueFils(mg, rate);
  })();

  const savePayment = async () => {
    const amountFils = parseMoney(form.amount ?? '');
    if (!amountFils) {
      toast('Enter an amount', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await apiWrite<{ payments: Payment[]; order: OrderView }>(
        `/api/orders/${order.id}/payments`,
        {
          id: uuid(),
          amountFils,
          paidOn: form.paidOn || today,
          method: form.method || 'Cash',
          reference: form.reference || null,
          note: form.note || null,
        },
        'POST',
        { label: `Payment for ${order.orderNumber}` },
      );
      if (res) onChange({ payments: res.payments, order: res.order });
      toast('Payment saved');
      setAdding(null);
    } catch {
      toast('Could not save the payment', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveExchange = async () => {
    const weightMg = parseWeight(form.weight ?? '') ?? 0;
    if (!weightMg) {
      toast('Enter the gold weight', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await apiWrite<{ exchanges: GoldExchange[]; order: OrderView }>(
        `/api/orders/${order.id}/exchanges`,
        {
          id: uuid(),
          karat: form.karat || order.karat,
          weightMg,
          rateFilsPerGram: parseMoney(form.rate ?? '') ?? 0,
          valueFils: exchangeValue,
          receivedOn: form.receivedOn || today,
          notes: form.notes || null,
        },
        'POST',
        { label: `Gold exchange for ${order.orderNumber}` },
      );
      if (res) onChange({ exchanges: res.exchanges, order: res.order });
      toast('Exchange recorded');
      setAdding(null);
    } catch {
      toast('Could not record the exchange', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Deleting money asks twice: a confirmation dialog plus the PIN inside it.
  const removePayment = async (p: Payment) => {
    const c = await confirm({
      title: 'Delete this payment?',
      body: `${settings.currency} ${formatMoney(p.amountFils)} on ${dubaiShort(p.paidOn)} will be removed from the balance. The audit log keeps the record.`,
      danger: true,
      confirmLabel: 'Delete payment',
      requirePin: true,
      requireReason: true,
    });
    if (!c.ok) return;
    try {
      const res = await apiWrite<{ payments: Payment[]; order: OrderView }>(
        `/api/payments/${p.id}?pin=${encodeURIComponent(c.pin ?? '')}&reason=${encodeURIComponent(c.reason ?? '')}`,
        null,
        'DELETE',
        { queue: false },
      );
      if (res) onChange({ payments: res.payments, order: res.order });
      toast('Payment deleted');
    } catch {
      toast('Wrong PIN, or the payment could not be deleted', 'error');
    }
  };

  const removeExchange = async (x: GoldExchange) => {
    const c = await confirm({
      title: 'Delete this gold exchange?',
      body: `${formatWeight(x.weightMg)} g of ${x.karat} worth ${settings.currency} ${formatMoney(x.valueFils)} will stop counting toward payment.`,
      danger: true,
      confirmLabel: 'Delete exchange',
      requirePin: true,
    });
    if (!c.ok) return;
    try {
      const res = await apiWrite<{ order: OrderView }>(`/api/exchanges/${x.id}?pin=${encodeURIComponent(c.pin ?? '')}`, null, 'DELETE', { queue: false });
      if (res) onChange({ exchanges: exchanges.filter((e) => e.id !== x.id), order: res.order });
      toast('Exchange deleted');
    } catch {
      toast('Wrong PIN, or the exchange could not be deleted', 'error');
    }
  };

  return (
    <>
      <CardTitle
        title="Payments"
        subtitle={`${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}${exchanges.length ? ` · ${exchanges.length} gold exchange${exchanges.length === 1 ? '' : 's'}` : ''}`}
        action={<BalanceBadge status={bal.status} />}
      />

      <dl className="mb-3 space-y-1 text-[13px]">
        <Row label="Total" value={`${settings.currency} ${formatMoney(bal.totalFils)}`} />
        <Row label="Payments" value={`${settings.currency} ${formatMoney(bal.paymentsFils)}`} />
        {bal.exchangeFils ? <Row label="Gold exchange" value={`${settings.currency} ${formatMoney(bal.exchangeFils)}`} /> : null}
        <Row label="Total paid" value={`${settings.currency} ${formatMoney(bal.totalPaidFils)}`} strong />
        {bal.creditFils > 0 ? (
          <Row label="Customer credit" value={`${settings.currency} ${formatMoney(bal.creditFils)}`} strong tone="info" />
        ) : (
          <Row
            label="Remaining balance"
            value={`${settings.currency} ${formatMoney(bal.remainingFils)}`}
            strong
            tone={bal.remainingFils > 0 ? 'bad' : 'ok'}
          />
        )}
        <Row label="Balance status" value={BALANCE_LABEL[bal.status]} />
      </dl>

      {payments.length ? (
        <ul className="mb-3 divide-y divide-line/70">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="num block text-[14px] font-bold text-ink">
                  {settings.currency} {formatMoney(p.amountFils)}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {dubaiShort(p.paidOn)} · {p.method}
                  {p.reference ? ` · ${p.reference}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
              </span>
              {can('payment.delete') ? (
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted hover:text-bad"
                  onClick={() => void removePayment(p)}
                  aria-label={`Delete payment of ${formatMoney(p.amountFils)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-xl border border-dashed border-line px-3 py-3 text-center text-[13px] text-muted">
          No payments recorded yet.
        </p>
      )}

      {exchanges.length ? (
        <>
          <p className="label mb-1">Old gold taken in exchange</p>
          <ul className="mb-3 divide-y divide-line/70">
            {exchanges.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="num block text-[14px] font-bold text-ink">
                    {formatWeight(x.weightMg)} g · {x.karat}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {dubaiShort(x.receivedOn)} · worth {settings.currency} {formatMoney(x.valueFils)}
                  </span>
                </span>
                {can('payment.delete') ? (
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted hover:text-bad"
                    onClick={() => void removeExchange(x)}
                    aria-label="Delete gold exchange"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {can('payment.create') ? (
        <div className="flex gap-2">
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={openPayment}>
            <Plus className="h-4 w-4" /> Add Payment
          </button>
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={openExchange}>
            <Plus className="h-4 w-4" /> Old Gold
          </button>
        </div>
      ) : null}

      <Modal
        open={adding === 'payment'}
        onClose={() => setAdding(null)}
        title="Add payment"
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void savePayment()} disabled={busy}>
              {busy ? <Spinner /> : null}
              Save payment
            </button>
          </>
        }
      >
        <Field label="Amount" required>
          <NumberInput value={form.amount ?? ''} onChange={(v) => set('amount', v)} suffix={settings.currency} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Date">
            <DateInput value={form.paidOn ?? today} onChange={(v) => set('paidOn', v)} />
          </Field>
          <Field label="Method">
            <Select
              value={form.method ?? 'Cash'}
              onChange={(v) => set('method', v)}
              options={settings.paymentMethods.map((m) => ({ value: m, label: m }))}
            />
          </Field>
        </div>
        <Field label="Reference">
          <TextInput value={form.reference ?? ''} onChange={(v) => set('reference', v)} />
        </Field>
        <Field label="Note">
          <TextArea value={form.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
        </Field>
        <p className="text-[12px] text-muted">
          Remaining after this payment:{' '}
          <span className="num font-bold text-ink">
            {settings.currency} {formatMoney(Math.max(bal.remainingFils - (parseMoney(form.amount ?? '') ?? 0), 0))}
          </span>
        </p>
      </Modal>

      <Modal
        open={adding === 'exchange'}
        onClose={() => setAdding(null)}
        title="Customer gold exchange"
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void saveExchange()} disabled={busy}>
              {busy ? <Spinner /> : null}
              Record exchange
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Karat">
            <Select
              value={form.karat ?? order.karat}
              onChange={(v) => set('karat', v)}
              options={(settings.karats.length ? settings.karats : [...KARATS]).map((k) => ({ value: k, label: k }))}
            />
          </Field>
          <Field label="Weight" required>
            <NumberInput value={form.weight ?? ''} onChange={(v) => set('weight', v)} suffix="g" autoFocus />
          </Field>
        </div>
        <Field label="Rate per gram">
          <NumberInput value={form.rate ?? ''} onChange={(v) => set('rate', v)} suffix={settings.currency} />
        </Field>
        <Field label="Date received">
          <DateInput value={form.receivedOn ?? today} onChange={(v) => set('receivedOn', v)} />
        </Field>
        <Field label="Notes">
          <TextArea value={form.notes ?? ''} onChange={(v) => set('notes', v)} rows={2} />
        </Field>
        <p className="rounded-xl bg-surface2 px-3 py-2 text-[13px]">
          Exchange value{' '}
          <span className="num font-bold text-gold">
            {settings.currency} {formatMoney(exchangeValue)}
          </span>{' '}
          — counted toward what the customer has paid.
        </p>
      </Modal>
    </>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'bad' | 'ok' | 'info' }) {
  const toneClass = tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : tone === 'info' ? 'text-info' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className={strong ? 'font-bold text-ink' : 'text-muted'}>{label}</dt>
      <dd className={`num ${strong ? 'text-[15px] font-extrabold' : 'font-semibold'} ${toneClass}`}>{value}</dd>
    </div>
  );
}
