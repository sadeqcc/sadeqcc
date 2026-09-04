'use client';

import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardTitle, EmptyState, Field, Modal, NumberInput, Select, TextInput } from './ui';
import { useApp } from './providers';
import { aed, formatCash, parseCash } from '@/lib/num';
import type { CashEntry, CashEntryKind } from '@/lib/types';
import type { DictKey } from '@/i18n/dict';
import { AttachmentPicker } from './attachment';

type FieldKey = 'personName' | 'description' | 'refNo' | 'entryDate' | 'dueDate' | 'note';

interface KindConfig {
  title: DictKey;
  sign: 1 | -1;
  side: 'physical' | 'system';
  fields: { key: FieldKey; label: DictKey; required?: boolean; type?: 'date' }[];
}

export const KIND_CONFIG: Record<CashEntryKind, KindConfig> = {
  principal: {
    title: 'principal',
    sign: 1,
    side: 'physical',
    fields: [
      { key: 'description', label: 'description' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  debt: {
    title: 'debts',
    sign: 1,
    side: 'physical',
    fields: [
      { key: 'personName', label: 'person_name', required: true },
      { key: 'description', label: 'reason' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'dueDate', label: 'due_date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  commission: {
    title: 'commissions',
    sign: 1,
    side: 'physical',
    fields: [
      { key: 'personName', label: 'person_name', required: true },
      { key: 'description', label: 'description' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  amanat: {
    title: 'amanat',
    sign: -1,
    side: 'physical',
    fields: [
      { key: 'personName', label: 'customer_name', required: true },
      { key: 'description', label: 'reason' },
      { key: 'refNo', label: 'ref_no' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  unregistered_sale: {
    title: 'unregistered_sales',
    sign: -1,
    side: 'physical',
    fields: [
      { key: 'personName', label: 'customer_name' },
      { key: 'refNo', label: 'invoice_no' },
      { key: 'description', label: 'description' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  duplicate_sale: {
    title: 'duplicate_sales',
    sign: -1,
    side: 'system',
    fields: [
      { key: 'refNo', label: 'invoice_no', required: true },
      { key: 'description', label: 'reason' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
  system_error: {
    title: 'system_errors',
    sign: -1,
    side: 'system',
    fields: [
      { key: 'refNo', label: 'ref_no' },
      { key: 'description', label: 'reason' },
      { key: 'entryDate', label: 'date', type: 'date' },
      { key: 'note', label: 'note' },
    ],
  },
};

const LARGE_VALUE_FILS = 50_000_000; // AED 500,000

export function EntryDialog({
  open,
  kind,
  initial,
  defaultDate,
  onClose,
  onSubmit,
}: {
  open: boolean;
  kind: CashEntryKind;
  initial?: CashEntry | null;
  defaultDate: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useApp();
  const cfg = KIND_CONFIG[kind];
  const [amount, setAmount] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount(initial ? formatCash(initial.amountFils, false) : '');
    setValues({
      personName: initial?.personName ?? '',
      description: initial?.description ?? '',
      refNo: initial?.refNo ?? '',
      entryDate: initial?.entryDate ?? defaultDate,
      dueDate: initial?.dueDate ?? '',
      note: initial?.note ?? '',
    });
  }, [open, initial, defaultDate]);

  const fils = parseCash(amount);
  const warnLarge = fils !== null && fils > LARGE_VALUE_FILS;

  const submit = async () => {
    if (fils === null || fils <= 0) {
      setError(t('invalid_amount'));
      return;
    }
    for (const f of cfg.fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(t('required'));
        return;
      }
    }
    setBusy(true);
    const body: Record<string, unknown> = { kind, amountFils: amount, entryDate: values.entryDate || defaultDate };
    for (const f of cfg.fields) {
      if (f.key === 'entryDate') continue;
      body[f.key] = values[f.key]?.trim() || null;
    }
    const ok = await onSubmit(body);
    setBusy(false);
    if (ok) onClose();
    else setError(t('error_generic'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${initial ? t('edit') : t('add')} · ${t(cfg.title)}`}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn-primary flex-1" onClick={submit} disabled={busy}>
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={`${t('amount')} (AED)`} error={error} hint={warnLarge ? t('large_value_warning') : undefined}>
        <NumberInput value={amount} onChange={setAmount} autoFocus ariaLabel={t('amount')} />
      </Field>
      <p className={`text-[12px] font-semibold ${cfg.sign === 1 ? 'text-ok' : 'text-bad'}`}>
        {cfg.sign === 1 ? '+' : '−'}{' '}
        {cfg.side === 'physical' ? t('adjusted_physical') : t('adjusted_system')}
      </p>
      {cfg.fields.map((f) => (
        <Field key={f.key} label={t(f.label) + (f.required ? ' *' : '')}>
          {f.type === 'date' ? (
            <input
              type="date"
              className="input num"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          ) : (
            <TextInput
              value={values[f.key] ?? ''}
              onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}
              ariaLabel={t(f.label)}
            />
          )}
        </Field>
      ))}
    </Modal>
  );
}

export function EntrySection({
  kind,
  entries,
  locked,
  defaultDate,
  onAdd,
  onEdit,
  onDelete,
}: {
  kind: CashEntryKind;
  entries: CashEntry[];
  locked: boolean;
  defaultDate: string;
  onAdd: (body: Record<string, unknown>) => Promise<boolean>;
  onEdit: (id: string, body: Record<string, unknown>) => Promise<boolean>;
  onDelete: (entry: CashEntry) => void;
}) {
  const { t } = useApp();
  const cfg = KIND_CONFIG[kind];
  const [dialog, setDialog] = useState<{ open: boolean; entry: CashEntry | null }>({ open: false, entry: null });
  const rows = useMemo(() => entries.filter((e) => e.kind === kind), [entries, kind]);
  const total = rows.reduce((a, e) => a + Number(e.amountFils), 0);

  return (
    <Card>
      <CardTitle
        title={t(cfg.title)}
        subtitle={`${rows.length} · ${aed(total)}`}
        action={
          !locked ? (
            <button
              className="btn-ghost px-3 py-1.5 text-[13px]"
              onClick={() => setDialog({ open: true, entry: null })}
              aria-label={`${t('add')} ${t(cfg.title)}`}
            >
              <Plus className="h-4 w-4" />
              {t('add')}
            </button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState text={t('no_records')} />
      ) : (
        <ul className="space-y-0.5">
          {rows.map((e) => (
            <li key={e.id} className="row">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">
                  {e.personName || e.description || e.refNo || t(cfg.title)}
                </p>
                <p className="truncate text-[11px] text-muted">
                  {[e.refNo, e.description, e.entryDate].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`num text-[14px] font-bold ${cfg.sign === 1 ? 'text-ok' : 'text-bad'}`}>
                  {cfg.sign === 1 ? '+' : '−'}
                  {formatCash(Number(e.amountFils))}
                </span>
                {!locked ? (
                  <>
                    <button
                      className="rounded-lg p-2 text-muted hover:text-gold"
                      onClick={() => setDialog({ open: true, entry: e })}
                      aria-label={t('edit')}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg p-2 text-muted hover:text-bad"
                      onClick={() => onDelete(e)}
                      aria-label={t('delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <EntryDialog
        open={dialog.open}
        kind={kind}
        initial={dialog.entry}
        defaultDate={defaultDate}
        onClose={() => setDialog({ open: false, entry: null })}
        onSubmit={(body) => (dialog.entry ? onEdit(dialog.entry.id, body) : onAdd(body))}
      />
    </Card>
  );
}

export function AdjustmentDialog({
  open,
  initial,
  defaultDate,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: { id: string; name: string; amountFils: number; direction: string; note: string | null; entryDate: string } | null;
  defaultDate: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t } = useApp();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('add_physical');
  const [note, setNote] = useState('');
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setName(initial?.name ?? '');
    setAmount(initial ? formatCash(initial.amountFils, false) : '');
    setDirection(initial?.direction ?? 'add_physical');
    setNote(initial?.note ?? '');
    setAttachmentId(null);
    setEntryDate(initial?.entryDate ?? defaultDate);
  }, [open, initial, defaultDate]);

  const fils = parseCash(amount);
  const preview =
    direction === 'add_physical'
      ? `+ ${t('adjusted_physical')}`
      : direction === 'sub_physical'
        ? `− ${t('adjusted_physical')}`
        : direction === 'add_system'
          ? `+ ${t('adjusted_system')}`
          : `− ${t('adjusted_system')}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('custom_adjustments')}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              if (!name.trim()) return setError(t('name_required'));
              if (fils === null || fils <= 0) return setError(t('invalid_amount'));
              const ok = await onSubmit({ name: name.trim(), amountFils: amount, direction, note: note || null, entryDate, attachmentId });
              if (ok) onClose();
              else setError(t('error_generic'));
            }}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={t('adjustment_name')} error={error}>
        <TextInput value={name} onChange={setName} autoFocus ariaLabel={t('adjustment_name')} />
      </Field>
      <Field label={`${t('amount')} (AED)`}>
        <NumberInput value={amount} onChange={setAmount} ariaLabel={t('amount')} />
      </Field>
      <Field label={t('direction')}>
        <Select
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'add_physical', label: t('add_to_physical') },
            { value: 'sub_physical', label: t('sub_from_physical') },
            { value: 'add_system', label: t('add_to_system') },
            { value: 'sub_system', label: t('sub_from_system') },
          ]}
        />
      </Field>
      <div className="rounded-xl border border-line bg-surface2 px-3 py-2 text-[13px] font-semibold text-gold">
        {preview} · {fils !== null ? aed(fils) : '—'}
      </div>
      <Field label={t('date')}>
        <input type="date" className="input num" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
      </Field>
      <Field label={t('note')}>
        <TextInput value={note} onChange={setNote} ariaLabel={t('note')} />
      </Field>
      <AttachmentPicker value={attachmentId} onChange={setAttachmentId} />
    </Modal>
  );
}
