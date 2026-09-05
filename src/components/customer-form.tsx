'use client';

import { useState } from 'react';
import { useApp } from './providers';
import { Field, Modal, Select, Spinner, TextArea, TextInput } from './ui';
import { TagPicker } from './pickers';
import { apiWrite, uuid } from '@/lib/client';
import { CUSTOMER_TYPES, DEFAULT_TAGS } from '@/lib/types';

/** Adding a customer straight from the customers screen, not only inside an order. */
export function CustomerFormDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { t, toast } = useApp();
  const [f, setF] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name?.trim()) {
      toast(t('customer_required'), 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await apiWrite<{ item: { id: string; name: string } }>(
        '/api/directory/customers',
        {
          id: uuid(),
          name: f.name.trim(),
          phone: f.phone || null,
          whatsapp: f.whatsapp || f.phone || null,
          country: f.country || null,
          city: f.city || null,
          customerType: f.customerType || 'New Customer',
          instagram: f.instagram || null,
          notes: f.notes || null,
          tags,
        },
        'POST',
        { queue: false },
      );
      if (res?.item) {
        toast(t('customer_saved'));
        setF({});
        setTags([]);
        onClose();
        onSaved(res.item.id);
      }
    } catch {
      toast(t('could_not_save'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('add_customer')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={busy || !f.name?.trim()}>
            {busy ? <Spinner /> : null}
            {t('save')}
          </button>
        </>
      }
    >
      <Field label={t('name')} required>
        <TextInput value={f.name ?? ''} onChange={(v) => set('name', v)} autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('phone')}>
          <TextInput value={f.phone ?? ''} onChange={(v) => set('phone', v)} type="tel" inputMode="tel" />
        </Field>
        <Field label={t('whatsapp')}>
          <TextInput value={f.whatsapp ?? ''} onChange={(v) => set('whatsapp', v)} type="tel" inputMode="tel" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('country')}>
          <TextInput value={f.country ?? ''} onChange={(v) => set('country', v)} />
        </Field>
        <Field label={t('city')}>
          <TextInput value={f.city ?? ''} onChange={(v) => set('city', v)} />
        </Field>
      </div>
      <Field label={t('customer_type')}>
        <Select
          value={f.customerType ?? 'New Customer'}
          onChange={(v) => set('customerType', v)}
          options={CUSTOMER_TYPES.map((c) => ({ value: c, label: c }))}
        />
      </Field>
      <Field label={t('tags')}>
        <TagPicker value={tags} onChange={setTags} suggestions={DEFAULT_TAGS} />
      </Field>
      <Field label={t('notes')}>
        <TextArea value={f.notes ?? ''} onChange={(v) => set('notes', v)} rows={2} />
      </Field>
    </Modal>
  );
}
