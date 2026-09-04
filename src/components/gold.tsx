'use client';

import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { Card, CardTitle, EmptyState, Field, Modal, NumberInput, Select, TextInput } from './ui';
import { useApp } from './providers';
import { formatGold, grams, parseGold } from '@/lib/num';
import { HOLDER_TYPES, type GoldMovement, type HolderType } from '@/lib/types';
import { remainingMg } from '@/lib/calc';
import { AttachmentPicker } from './attachment';
import type { DictKey } from '@/i18n/dict';

export const holderLabel = (t: (k: DictKey) => string, ht: string) => t(`ht_${ht}` as DictKey);

export function MovementDialog({
  open,
  onClose,
  onSubmit,
  karat,
  direction,
  defaultDate,
  fixedHolder,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<boolean>;
  karat: string;
  direction: 'out' | 'in';
  defaultDate: string;
  fixedHolder?: { name: string; type: HolderType };
}) {
  const { t } = useApp();
  const [holderName, setHolderName] = useState(fixedHolder?.name ?? '');
  const [holderType, setHolderType] = useState<HolderType>(fixedHolder?.type ?? (direction === 'in' ? 'person' : 'person'));
  const [weight, setWeight] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(defaultDate);
  const [expected, setExpected] = useState('');
  const [reason, setReason] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setHolderName(fixedHolder?.name ?? '');
    setHolderType(fixedHolder?.type ?? 'person');
    setWeight('');
    setDeliveryDate(defaultDate);
    setExpected('');
    setReason('');
    setRefNo('');
    setNote('');
    setAttachmentId(null);
    setError(null);
  }, [open, fixedHolder, defaultDate]);

  const submit = async () => {
    if (!holderName.trim()) return setError(t('name_required'));
    const mg = parseGold(weight);
    if (mg === null || mg <= 0) return setError(t('invalid_weight'));
    setBusy(true);
    const ok = await onSubmit({
      karat,
      direction,
      holderType,
      holderName: holderName.trim(),
      weightMg: weight,
      deliveryDate,
      expectedReturnDate: expected || null,
      reason: reason || null,
      refNo: refNo || null,
      note: note || null,
      attachmentId,
    });
    setBusy(false);
    if (ok) onClose();
    else setError(t('error_generic'));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${direction === 'out' ? t('gold_with_others') : t('third_party_gold')} · ${karat}`}
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
      <Field label={direction === 'out' ? t('holder_name') : t('owner_name')} error={error}>
        <TextInput value={holderName} onChange={setHolderName} autoFocus ariaLabel={t('holder_name')} />
      </Field>
      {direction === 'out' ? (
        <Field label={t('holder_type')}>
          <Select
            value={holderType}
            onChange={(v) => setHolderType(v as HolderType)}
            options={HOLDER_TYPES.map((h) => ({ value: h, label: holderLabel(t, h) }))}
          />
        </Field>
      ) : null}
      <Field label={t('weight_g')}>
        <NumberInput value={weight} onChange={setWeight} ariaLabel={t('weight_g')} />
      </Field>
      <Field label={t('delivery_date')}>
        <input type="date" className="input num" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
      </Field>
      <Field label={t('expected_return')}>
        <input type="date" className="input num" value={expected} onChange={(e) => setExpected(e.target.value)} />
      </Field>
      <Field label={t('reason')}>
        <TextInput value={reason} onChange={setReason} ariaLabel={t('reason')} />
      </Field>
      <Field label={t('ref_no')}>
        <TextInput value={refNo} onChange={setRefNo} ariaLabel={t('ref_no')} />
      </Field>
      <Field label={t('note')}>
        <TextInput value={note} onChange={setNote} ariaLabel={t('note')} />
      </Field>
      <AttachmentPicker value={attachmentId} onChange={setAttachmentId} />
      <p className={`text-[12px] font-semibold ${direction === 'out' ? 'text-ok' : 'text-bad'}`}>
        {direction === 'out' ? `+ ${t('accounted_weight')}` : `− ${t('accounted_weight')}`}
      </p>
    </Modal>
  );
}

export function ReturnDialog({
  open,
  movement,
  onClose,
  onSubmit,
}: {
  open: boolean;
  movement: GoldMovement | null;
  onClose: () => void;
  onSubmit: (id: string, mg: number, date: string) => Promise<boolean>;
}) {
  const { t } = useApp();
  const [weight, setWeight] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !movement) return;
    setWeight(formatGold(remainingMg(movement), false));
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }, [open, movement]);

  if (!movement) return null;
  const rest = remainingMg(movement);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mark_returned')}
      footer={
        <>
          <button className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              const mg = parseGold(weight);
              if (mg === null || mg <= 0) return setError(t('invalid_weight'));
              if (mg > rest) return setError(t('invalid_weight'));
              const ok = await onSubmit(movement.id, mg, date);
              if (ok) onClose();
              else setError(t('error_generic'));
            }}
          >
            {t('save')}
          </button>
        </>
      }
    >
      <div className="rounded-xl border border-line bg-surface2 p-3 text-[13px]">
        <p className="font-semibold text-ink">
          {movement.holderName} · {movement.karat}
        </p>
        <p className="num text-muted">
          {t('remaining')}: {grams(rest)}
        </p>
      </div>
      <Field label={t('returned_weight')} error={error}>
        <NumberInput value={weight} onChange={setWeight} autoFocus ariaLabel={t('returned_weight')} />
      </Field>
      <Field label={t('date')}>
        <input type="date" className="input num" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function MovementRow({
  m,
  onReturn,
  onDelete,
  locked,
}: {
  m: GoldMovement;
  onReturn: (m: GoldMovement) => void;
  onDelete: (m: GoldMovement) => void;
  locked?: boolean;
}) {
  const { t } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const overdue = m.status !== 'returned' && m.expectedReturnDate && m.expectedReturnDate < today;
  const rest = remainingMg(m);
  const inbound = m.direction === 'in';

  return (
    <li className={`rounded-xl border p-3 ${inbound ? 'border-bad/30 bg-bad/5' : 'border-line bg-surface2'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[13px] font-bold text-ink">
            {inbound ? <ArrowDownLeft className="h-3.5 w-3.5 text-bad" /> : <ArrowUpRight className="h-3.5 w-3.5 text-ok" />}
            {m.holderName}
            <span className="chip bg-surface text-muted">{holderLabel(t, m.holderType)}</span>
          </p>
          <p className="truncate text-[11px] text-muted">
            {m.karat} · {m.deliveryDate}
            {m.expectedReturnDate ? ` → ${m.expectedReturnDate}` : ''}
            {m.reason ? ` · ${m.reason}` : ''}
          </p>
        </div>
        <div className="text-end">
          <p className={`num text-[15px] font-extrabold ${inbound ? 'text-bad' : 'text-ok'}`}>
            {inbound ? '−' : '+'}
            {formatGold(rest)} g
          </p>
          {Number(m.returnedMg) > 0 ? (
            <p className="num text-[11px] text-muted">
              {t('returned_weight')}: {formatGold(Number(m.returnedMg))}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={`chip ${
            overdue
              ? 'bg-bad/15 text-bad'
              : m.status === 'returned'
                ? 'bg-ok/15 text-ok'
                : m.status === 'partially_returned'
                  ? 'bg-warn/15 text-warn'
                  : 'bg-info/15 text-info'
          }`}
        >
          {overdue ? t('mv_overdue') : t(`mv_${m.status}` as DictKey)}
        </span>
        <div className="flex-1" />
        {m.status !== 'returned' && !locked ? (
          <button className="btn-ghost h-9 min-h-0 px-3 text-[12px]" onClick={() => onReturn(m)}>
            <Undo2 className="h-3.5 w-3.5" />
            {t('mark_returned')}
          </button>
        ) : null}
        {!locked ? (
          <button className="rounded-lg p-2 text-muted hover:text-bad" aria-label={t('delete')} onClick={() => onDelete(m)}>
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function MovementList({
  movements,
  onReturn,
  onDelete,
  locked,
  title,
  action,
}: {
  movements: GoldMovement[];
  onReturn: (m: GoldMovement) => void;
  onDelete: (m: GoldMovement) => void;
  locked?: boolean;
  title: string;
  action?: React.ReactNode;
}) {
  const { t } = useApp();
  return (
    <Card>
      <CardTitle title={title} subtitle={`${movements.length}`} action={action} />
      {movements.length === 0 ? (
        <EmptyState text={t('no_movements')} />
      ) : (
        <ul className="space-y-2">
          {movements.map((m) => (
            <MovementRow key={m.id} m={m} onReturn={onReturn} onDelete={onDelete} locked={locked} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="btn-ghost w-full text-[13px]" onClick={onClick}>
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}
