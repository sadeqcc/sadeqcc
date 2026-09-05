'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { useApp } from './providers';
import { Field, Modal, SearchInput, Select, Spinner, TextInput } from './ui';
import { apiGet, apiWrite, uuid } from '@/lib/client';
import { CUSTOMER_TYPES, MAKER_SPECIALTIES, COMMON_ROUTES } from '@/lib/types';

export interface DirectoryItem {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  company?: string | null;
  country?: string | null;
  city?: string | null;
  customerType?: string | null;
  specialty?: string | null;
  frequentRoute?: string | null;
  [key: string]: unknown;
}

type Entity = 'customers' | 'makers' | 'travelers';

const TITLES: Record<Entity, { picker: string; create: string; empty: string }> = {
  customers: { picker: 'Choose customer', create: 'New customer', empty: 'No customers yet' },
  makers: { picker: 'Choose maker', create: 'New maker', empty: 'No makers yet' },
  travelers: { picker: 'Choose traveler', create: 'New traveler', empty: 'No travelers yet' },
};

/**
 * One picker for all three directories. Searching an existing record is the
 * default path, so duplicates are not created by accident.
 */
export function EntityPicker({
  entity,
  value,
  onChange,
  label,
  required,
  error,
}: {
  entity: Entity;
  value: string | null;
  onChange: (id: string | null, item: DirectoryItem | null) => void;
  label: string;
  required?: boolean;
  error?: string | null;
}) {
  const { toast, can } = useApp();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: DirectoryItem[] }>(`/api/directory/${entity}`);
      setItems(d.items);
    } catch {
      toast('Could not load the list', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Loaded once so the chosen record can be shown by name, not just by id.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.name, i.phone, i.whatsapp, i.company, i.city, i.country].some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [items, search]);

  const create = async () => {
    if (!draft.name?.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: uuid(), name: draft.name.trim() };
      for (const [k, v] of Object.entries(draft)) if (k !== 'name' && v) body[k] = v;
      if (entity === 'customers' && !body.whatsapp && body.phone) body.whatsapp = body.phone;
      const res = await apiWrite<{ item: DirectoryItem }>(`/api/directory/${entity}`, body, 'POST', { queue: false });
      if (res?.item) {
        setItems((list) => [res.item, ...list]);
        onChange(res.item.id, res.item);
        toast(`${res.item.name} added`);
        setCreating(false);
        setOpen(false);
        setDraft({});
      }
    } catch {
      toast('Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const canCreate = entity === 'customers' ? can('customer.manage') : can('directory.manage');

  return (
    <>
      <Field label={label} required={required} error={error}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`input flex items-center justify-between text-start ${selected ? 'text-ink' : 'text-muted'}`}
        >
          <span className="truncate">{selected ? selected.name : `Select ${entity.slice(0, -1)}`}</span>
          <Search className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </Field>

      <Modal open={open} onClose={() => setOpen(false)} title={TITLES[entity].picker}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or phone" autoFocus />

        {canCreate ? (
          <button type="button" className="btn-ghost btn-sm w-full" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {TITLES[entity].create}
          </button>
        ) : null}

        {value ? (
          <button
            type="button"
            className="btn-quiet btn-sm w-full"
            onClick={() => {
              onChange(null, null);
              setOpen(false);
            }}
          >
            Clear selection
          </button>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-6 w-6" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">{search ? 'No matches' : TITLES[entity].empty}</p>
        ) : (
          <ul className="max-h-[46vh] space-y-1 overflow-y-auto">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-start transition hover:border-gold/60"
                  onClick={() => {
                    onChange(i.id, i);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{i.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[i.phone, i.company, i.city ?? i.country, i.specialty, i.frequentRoute].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                  {value === i.id ? <Check className="h-4 w-4 shrink-0 text-gold" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={TITLES[entity].create}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={() => void create()} disabled={saving || !draft.name?.trim()}>
              {saving ? <Spinner /> : null}
              Save
            </button>
          </>
        }
      >
        <Field label="Name" required>
          <TextInput value={draft.name ?? ''} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} autoFocus />
        </Field>
        <Field label="Phone">
          <TextInput value={draft.phone ?? ''} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} inputMode="tel" type="tel" />
        </Field>
        <Field label="WhatsApp" hint="Leave empty to reuse the phone number">
          <TextInput value={draft.whatsapp ?? ''} onChange={(v) => setDraft((d) => ({ ...d, whatsapp: v }))} inputMode="tel" type="tel" />
        </Field>

        {entity === 'customers' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Country">
                <TextInput value={draft.country ?? ''} onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
              </Field>
              <Field label="City">
                <TextInput value={draft.city ?? ''} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
              </Field>
            </div>
            <Field label="Customer type">
              <Select
                value={draft.customerType ?? 'New Customer'}
                onChange={(v) => setDraft((d) => ({ ...d, customerType: v }))}
                options={CUSTOMER_TYPES.map((c) => ({ value: c, label: c }))}
              />
            </Field>
          </>
        ) : null}

        {entity === 'makers' ? (
          <>
            <Field label="Company / workshop">
              <TextInput value={draft.company ?? ''} onChange={(v) => setDraft((d) => ({ ...d, company: v }))} />
            </Field>
            <Field label="Specialty">
              <Select
                value={draft.specialty ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, specialty: v }))}
                placeholder="No specialty"
                options={MAKER_SPECIALTIES.map((s) => ({ value: s, label: s }))}
              />
            </Field>
            <Field label="Location">
              <TextInput value={draft.location ?? ''} onChange={(v) => setDraft((d) => ({ ...d, location: v }))} />
            </Field>
          </>
        ) : null}

        {entity === 'travelers' ? (
          <>
            <Field label="Frequent route">
              <Select
                value={draft.frequentRoute ?? ''}
                onChange={(v) => setDraft((d) => ({ ...d, frequentRoute: v }))}
                placeholder="No usual route"
                options={COMMON_ROUTES.map((r) => ({ value: r, label: r }))}
              />
            </Field>
            <Field label="ID reference">
              <TextInput value={draft.idReference ?? ''} onChange={(v) => setDraft((d) => ({ ...d, idReference: v }))} />
            </Field>
          </>
        ) : null}
      </Modal>
    </>
  );
}

/** Multi-select tags with free entry, used on orders and customers. */
export function TagPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: readonly string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t].slice(0, 20));
    setDraft('');
  };
  return (
    <div className="space-y-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <li key={t}>
              <button
                type="button"
                className="chip bg-gold/15 text-gold normal-case tracking-normal"
                onClick={() => onChange(value.filter((x) => x !== t))}
                aria-label={`Remove tag ${t}`}
              >
                {t} ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={draft}
          placeholder="Add a tag"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
        />
        <button type="button" className="btn-ghost btn-sm" onClick={() => add(draft)}>
          Add
        </button>
      </div>
      <div className="scroll-x">
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <button
              key={s}
              type="button"
              className="chip shrink-0 whitespace-nowrap border border-line bg-surface2 text-muted normal-case tracking-normal"
              onClick={() => add(s)}
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}
