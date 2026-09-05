'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from './providers';
import { CardTitle, DateInput, Field, Modal, NumberInput, Select, Spinner, TextArea, TextInput } from './ui';
import { apiWrite, uuid } from '@/lib/client';
import { dubaiDate, dubaiShort } from '@/lib/date';
import { formatMoney, formatWeight, goldValueFils, parseMoney, parseWeight } from '@/lib/num';
import { balanceOf, BALANCE_KEY } from '@/lib/calc';
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
  const { settings, toast, confirm, can, t } = useApp();
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
      toast(t('enter_amount'), 'error');
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
      toast(t('payment_saved'));
      setAdding(null);
    } catch {
      toast(t('could_not_save_payment'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveExchange = async () => {
    const weightMg = parseWeight(form.weight ?? '') ?? 0;
    if (!weightMg) {
      toast(t('enter_weight'), 'error');
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
      toast(t('exchange_recorded'));
      setAdding(null);
    } catch {
      toast(t('could_not_record_exchange'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Deleting money asks twice: a confirmation dialog plus the PIN inside it.
  const removePayment = async (p: Payment) => {
    const c = await confirm({
      title: t('delete_payment_title'),
      body: t('delete_payment_body', {
        amount: `${settings.currency} ${formatMoney(p.amountFils)}`,
        date: dubaiShort(p.paidOn),
      }),
      danger: true,
      confirmLabel: t('delete_payment_ok'),
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
      toast(t('payment_deleted'));
    } catch {
      toast(t('wrong_pin_or_failed'), 'error');
    }
  };

  const removeExchange = async (x: GoldExchange) => {
    const c = await confirm({
      title: t('delete_exchange_title'),
      body: t('delete_exchange_body', {
        weight: `${formatWeight(x.weightMg)} g`,
        karat: x.karat,
        amount: `${settings.currency} ${formatMoney(x.valueFils)}`,
      }),
      danger: true,
      confirmLabel: t('delete_exchange_ok'),
      requirePin: true,
    });
    if (!c.ok) return;
    try {
      const res = await apiWrite<{ order: OrderView }>(`/api/exchanges/${x.id}?pin=${encodeURIComponent(c.pin ?? '')}`, null, 'DELETE', { queue: false });
      if (res) onChange({ exchanges: exchanges.filter((e) => e.id !== x.id), order: res.order });
      toast(t('exchange_deleted'));
    } catch {
      toast(t('wrong_pin_or_failed'), 'error');
    }
  };

  return (
    <>
      <CardTitle
        title={t('payments')}
        subtitle={`${payments.length === 1 ? t('payment_count_1') : t('payments_count', { n: payments.length })}${
          exchanges.length ? ` · ${t('exchanges_count', { n: exchanges.length })}` : ''
        }`}
        action={<BalanceBadge status={bal.status} />}
      />

      <dl className="mb-3 space-y-1 text-[13px]">
        <Row label={t('total')} value={`${settings.currency} ${formatMoney(bal.totalFils)}`} />
        <Row label={t('payments')} value={`${settings.currency} ${formatMoney(bal.paymentsFils)}`} />
        {bal.exchangeFils ? <Row label={t('gold_exchange_value')} value={`${settings.currency} ${formatMoney(bal.exchangeFils)}`} /> : null}
        <Row label={t('total_paid')} value={`${settings.currency} ${formatMoney(bal.totalPaidFils)}`} strong />
        {bal.creditFils > 0 ? (
          <Row label={t('customer_credit')} value={`${settings.currency} ${formatMoney(bal.creditFils)}`} strong tone="info" />
        ) : (
          <Row
            label={t('remaining_balance')}
            value={`${settings.currency} ${formatMoney(bal.remainingFils)}`}
            strong
            tone={bal.remainingFils > 0 ? 'bad' : 'ok'}
          />
        )}
        <Row label={t('balance_status')} value={t(BALANCE_KEY[bal.status])} />
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
                  aria-label={`${t('delete')} ${formatMoney(p.amountFils)}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 rounded-xl border border-dashed border-line px-3 py-3 text-center text-[13px] text-muted">
          {t('no_payments')}
        </p>
      )}

      {exchanges.length ? (
        <>
          <p className="label mb-1">{t('old_gold')}</p>
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
                    aria-label={t('delete_exchange_ok')}
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
            <Plus className="h-4 w-4" /> {t('add_payment')}
          </button>
          <button type="button" className="btn-ghost btn-sm flex-1" onClick={openExchange}>
            <Plus className="h-4 w-4" /> {t('add_old_gold')}
          </button>
        </div>
      ) : null}

      <Modal
        open={adding === 'payment'}
        onClose={() => setAdding(null)}
        title={t('add_payment')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(null)}>
              {t('cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void savePayment()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t('save_payment')}
            </button>
          </>
        }
      >
        <Field label={t('amount')} required>
          <NumberInput value={form.amount ?? ''} onChange={(v) => set('amount', v)} suffix={settings.currency} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('date')}>
            <DateInput value={form.paidOn ?? today} onChange={(v) => set('paidOn', v)} />
          </Field>
          <Field label={t('method')}>
            <Select
              value={form.method ?? 'Cash'}
              onChange={(v) => set('method', v)}
              options={settings.paymentMethods.map((m) => ({ value: m, label: m }))}
            />
          </Field>
        </div>
        <Field label={t('reference')}>
          <TextInput value={form.reference ?? ''} onChange={(v) => set('reference', v)} />
        </Field>
        <Field label={t('note')}>
          <TextArea value={form.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
        </Field>
        <p className="text-[12px] text-muted">
          {t('remaining_after', {
            amount: `${settings.currency} ${formatMoney(Math.max(bal.remainingFils - (parseMoney(form.amount ?? '') ?? 0), 0))}`,
          })}
        </p>
      </Modal>

      <Modal
        open={adding === 'exchange'}
        onClose={() => setAdding(null)}
        title={t('gold_exchange')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(null)}>
              {t('cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void saveExchange()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t('record_exchange')}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('karat')}>
            <Select
              value={form.karat ?? order.karat}
              onChange={(v) => set('karat', v)}
              options={(settings.karats.length ? settings.karats : [...KARATS]).map((k) => ({ value: k, label: k }))}
            />
          </Field>
          <Field label={t('exchange_weight')} required>
            <NumberInput value={form.weight ?? ''} onChange={(v) => set('weight', v)} suffix="g" autoFocus />
          </Field>
        </div>
        <Field label={t('exchange_rate')}>
          <NumberInput value={form.rate ?? ''} onChange={(v) => set('rate', v)} suffix={settings.currency} />
        </Field>
        <Field label={t('date_received')}>
          <DateInput value={form.receivedOn ?? today} onChange={(v) => set('receivedOn', v)} />
        </Field>
        <Field label={t('notes')}>
          <TextArea value={form.notes ?? ''} onChange={(v) => set('notes', v)} rows={2} />
        </Field>
        <p className="rounded-xl bg-surface2 px-3 py-2 text-[13px]">
          {t('exchange_value', { amount: `${settings.currency} ${formatMoney(exchangeValue)}` })}
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
