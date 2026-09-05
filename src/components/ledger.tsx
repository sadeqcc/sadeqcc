'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from './providers';
import { CardTitle, DateInput, Field, Modal, NumberInput, Select, Spinner, TextArea, TextInput } from './ui';
import { apiWrite, uuid } from '@/lib/client';
import { dubaiDate, dubaiShort } from '@/lib/date';
import { formatMoney, parseMoney } from '@/lib/num';
import { LEDGER_DIRECTION, LEDGER_KINDS, LEDGER_KIND_KEY, type CustomerAccount, type LedgerEntry, type LedgerKind } from '@/lib/types';

/**
 * The customer's statement: what their orders still owe, what they owe outside
 * any order, and the one number that matters — the net balance.
 */
export function LedgerPanel({
  customerId,
  account,
  entries,
  onChange,
}: {
  customerId: string;
  account: CustomerAccount;
  entries: LedgerEntry[];
  onChange: (next: { entries: LedgerEntry[]; account: CustomerAccount }) => void;
}) {
  const { settings, t, toast, confirm, can } = useApp();
  const today = dubaiDate();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<LedgerKind>('payment');
  const [f, setF] = useState<Record<string, string>>({ entryDate: today });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const money = (v: number) => `${settings.currency} ${formatMoney(v)}`;

  const open = (k: LedgerKind) => {
    setKind(k);
    setF({ entryDate: today, method: settings.paymentMethods[0] ?? 'Cash', amount: '' });
    setAdding(true);
  };

  const save = async () => {
    const amountFils = parseMoney(f.amount ?? '');
    if (!amountFils || amountFils <= 0) {
      toast(t('enter_amount'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await apiWrite<{ entries: LedgerEntry[]; account: CustomerAccount }>(
        `/api/customers/${customerId}/ledger`,
        {
          id: uuid(),
          kind,
          amountFils,
          entryDate: f.entryDate || today,
          method: kind === 'payment' ? f.method || null : null,
          reference: f.reference || null,
          note: f.note || null,
        },
        'POST',
        { label: 'Customer account entry' },
      );
      if (res) onChange(res);
      toast(t('entry_saved'));
      setAdding(false);
    } catch {
      toast(t('could_not_save_entry'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: LedgerEntry) => {
    const c = await confirm({
      title: t('delete_entry_title'),
      body: t('delete_entry_body', { amount: money(e.amountFils), date: dubaiShort(e.entryDate) }),
      danger: true,
      confirmLabel: t('delete_entry_ok'),
      requirePin: true,
    });
    if (!c.ok) return;
    try {
      const res = await apiWrite<{ entries: LedgerEntry[]; account: CustomerAccount }>(
        `/api/ledger/${e.id}?pin=${encodeURIComponent(c.pin ?? '')}&reason=${encodeURIComponent(c.reason ?? '')}`,
        null,
        'DELETE',
        { queue: false },
      );
      if (res) onChange(res);
      toast(t('entry_deleted'));
    } catch {
      toast(t('wrong_pin_or_failed'), 'error');
    }
  };

  return (
    <>
      <CardTitle title={t('statement')} subtitle={t('account_hint')} />

      {/* The headline number, before any of the detail behind it. */}
      <div
        className={`rounded-xl border p-3 ${
          account.netBalanceFils > 0
            ? 'border-bad/40 bg-bad/5'
            : account.creditFils > 0
              ? 'border-info/40 bg-info/5'
              : 'border-ok/40 bg-ok/5'
        }`}
      >
        <p className="label">
          {account.netBalanceFils > 0 ? t('owes_you') : account.creditFils > 0 ? t('you_owe') : t('net_balance')}
        </p>
        <p
          className={`num mt-1 text-[26px] font-extrabold leading-none ${
            account.netBalanceFils > 0 ? 'text-bad' : account.creditFils > 0 ? 'text-info' : 'text-ok'
          }`}
        >
          {money(account.netBalanceFils > 0 ? account.netBalanceFils : account.creditFils)}
        </p>
        {account.netBalanceFils === 0 && account.creditFils === 0 ? (
          <p className="mt-1 text-[12px] text-muted">{t('clear_account')}</p>
        ) : null}
      </div>

      <dl className="mt-3 text-[13px]">
        <Row label={t('orders_total')} value={money(account.ordersTotalFils)} />
        <Row label={t('paid_on_orders')} value={money(account.ordersPaidFils)} />
        <Row label={t('remaining_on_orders')} value={money(account.ordersRemainingFils)} tone={account.ordersRemainingFils > 0 ? 'bad' : undefined} />
        {account.ledgerDebitFils ? <Row label={t('other_charges_total')} value={money(account.ledgerDebitFils)} tone="bad" /> : null}
        {account.ledgerCreditFils ? <Row label={t('payments_on_account')} value={money(account.ledgerCreditFils)} tone="ok" /> : null}
      </dl>

      {can('payment.create') ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => open('payment')}>
            <Plus className="h-4 w-4" /> {t('ledger_payment')}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => open('charge')}>
            <Plus className="h-4 w-4" /> {t('ledger_charge')}
          </button>
        </div>
      ) : null}

      <p className="label mt-4 mb-1">{t('account')}</p>
      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-[13px] text-muted">{t('no_entries')}</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className={`num block text-[14px] font-bold ${e.direction === 'debit' ? 'text-bad' : 'text-ok'}`}>
                  {e.direction === 'debit' ? '+' : '−'} {money(e.amountFils)}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {t(LEDGER_KIND_KEY[e.kind])} · {dubaiShort(e.entryDate)}
                  {e.method ? ` · ${e.method}` : ''}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
              {can('payment.delete') ? (
                <button
                  type="button"
                  className="rounded-lg p-2 text-muted hover:text-bad"
                  onClick={() => void remove(e)}
                  aria-label={t('delete_entry_ok')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={t('new_entry')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setAdding(false)}>
              {t('cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t('save')}
            </button>
          </>
        }
      >
        <Field label={t('entry_type')} hint={t(`${LEDGER_KIND_KEY[kind]}_hint` as never)}>
          <Select
            value={kind}
            onChange={(v) => setKind(v as LedgerKind)}
            options={LEDGER_KINDS.map((k) => ({ value: k, label: t(LEDGER_KIND_KEY[k]) }))}
          />
        </Field>
        <Field label={t('amount')} required>
          <NumberInput value={f.amount ?? ''} onChange={(v) => set('amount', v)} suffix={settings.currency} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('date')}>
            <DateInput value={f.entryDate ?? today} onChange={(v) => set('entryDate', v)} />
          </Field>
          {kind === 'payment' ? (
            <Field label={t('method')}>
              <Select
                value={f.method ?? 'Cash'}
                onChange={(v) => set('method', v)}
                options={settings.paymentMethods.map((m) => ({ value: m, label: m }))}
              />
            </Field>
          ) : (
            <Field label={t('reference')}>
              <TextInput value={f.reference ?? ''} onChange={(v) => set('reference', v)} />
            </Field>
          )}
        </div>
        <Field label={t('note')}>
          <TextArea value={f.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
        </Field>
        <p className="rounded-xl bg-surface2 px-3 py-2 text-[12px] text-muted">
          {LEDGER_DIRECTION[kind] === 'debit' ? '↑' : '↓'} {t('net_balance')} ·{' '}
          <span className="num font-bold text-ink">
            {money(
              LEDGER_DIRECTION[kind] === 'debit'
                ? account.netBalanceFils + (parseMoney(f.amount ?? '') ?? 0)
                : Math.max(account.netBalanceFils - (parseMoney(f.amount ?? '') ?? 0), 0),
            )}
          </span>
        </p>
      </Modal>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className={`num font-semibold ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
