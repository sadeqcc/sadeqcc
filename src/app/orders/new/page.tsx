'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { useApp } from '@/components/providers';
import { EntityPicker, TagPicker, type DirectoryItem } from '@/components/pickers';
import { PendingMediaPicker } from '@/components/media';
import { Card, CardTitle, DateInput, Field, NumberInput, Segmented, Select, Spinner, TextArea, TextInput, useDebouncedCallback } from '@/components/ui';
import { ApiError, apiWrite, drafts } from '@/lib/client';
import { addDays, dubaiDate } from '@/lib/date';
import { formatMoney, formatWeight, ouncePriceToPerGram, parseMoney, parseWeight, percentToBp } from '@/lib/num';
import { priceOrder } from '@/lib/calc';
import { CATEGORIES, DEFAULT_TAGS, KARATS, STYLES } from '@/lib/types';

const DRAFT_KEY = 'order:new';

interface FormState {
  customerId: string | null;
  customerName: string;
  productName: string;
  category: string;
  style: string;
  karat: string;
  expectedWeight: string;
  minimumWeight: string;
  maximumWeight: string;
  goldRateMode: 'per_gram' | 'per_ounce' | 'manual';
  goldRate: string;
  goldValueOverride: string;
  makingChargeMode: 'per_gram' | 'fixed';
  makingCharge: string;
  otherCharges: string;
  discount: string;
  vatPercent: string;
  deposit: string;
  depositMethod: string;
  makerId: string | null;
  travelerId: string | null;
  destination: string;
  referenceNo: string;
  orderDate: string;
  expectedReadyDate: string;
  expectedDeliveryDate: string;
  notes: string;
  tags: string[];
}

const blank = (today: string): FormState => ({
  customerId: null,
  customerName: '',
  productName: '',
  category: 'Necklace',
  style: 'Dubai',
  karat: '21K',
  expectedWeight: '',
  minimumWeight: '',
  maximumWeight: '',
  goldRateMode: 'per_gram',
  goldRate: '',
  goldValueOverride: '',
  makingChargeMode: 'per_gram',
  makingCharge: '',
  otherCharges: '',
  discount: '',
  vatPercent: '',
  deposit: '',
  depositMethod: 'Cash',
  makerId: null,
  travelerId: null,
  destination: '',
  referenceNo: '',
  orderDate: today,
  expectedReadyDate: '',
  expectedDeliveryDate: addDays(today, 7),
  notes: '',
  tags: [],
});

export default function NewOrderPage() {
  const { settings, toast, confirm } = useApp();
  const router = useRouter();
  const today = dubaiDate();

  const [form, setForm] = useState<FormState>(() => blank(today));
  const [advanced, setAdvanced] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ id: string; name: string; preview: string; payload: Record<string, unknown> }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  /* --------------------------------------------------- draft restore */
  useEffect(() => {
    const d = drafts.get<FormState>(DRAFT_KEY);
    if (!d) return;
    void (async () => {
      const c = await confirm({
        title: 'Restore your unsaved order?',
        body: `A draft was auto-saved on this device. Continue where you left off, or start fresh.`,
        confirmLabel: 'Restore draft',
      });
      if (c.ok) {
        setForm({ ...blank(today), ...d.data });
        toast('Draft restored', 'info');
      } else {
        drafts.clear(DRAFT_KEY);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistDraft = useDebouncedCallback((f: FormState) => {
    if (drafts.set(DRAFT_KEY, f)) setSavedAt(new Date().toISOString());
  }, 700);

  useEffect(() => {
    if (dirty) persistDraft(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  /* ------------------------------------------------------- pricing */
  const parsed = useMemo(() => {
    const expectedWeightMg = parseWeight(form.expectedWeight) ?? 0;
    const rateInput = parseMoney(form.goldRate) ?? 0;
    const goldRateFilsPerGram = form.goldRateMode === 'per_ounce' ? ouncePriceToPerGram(rateInput) : rateInput;
    return {
      expectedWeightMg,
      goldRateFilsPerGram,
      goldValueOverrideFils: form.goldRateMode === 'manual' ? parseMoney(form.goldValueOverride) ?? 0 : null,
      makingChargeFils: parseMoney(form.makingCharge) ?? 0,
      otherChargesFils: parseMoney(form.otherCharges) ?? 0,
      discountFils: parseMoney(form.discount) ?? 0,
      vatBp: percentToBp(Number(form.vatPercent || settings.vatPercent || 0)),
      depositFils: parseMoney(form.deposit) ?? 0,
      minimumWeightMg: parseWeight(form.minimumWeight),
      maximumWeightMg: parseWeight(form.maximumWeight),
    };
  }, [form, settings.vatPercent]);

  const pricing = useMemo(
    () =>
      priceOrder({
        expectedWeightMg: parsed.expectedWeightMg,
        goldRateFilsPerGram: parsed.goldRateFilsPerGram,
        goldValueOverrideFils: parsed.goldValueOverrideFils,
        makingChargeMode: form.makingChargeMode,
        makingChargeFils: parsed.makingChargeFils,
        otherChargesFils: parsed.otherChargesFils,
        discountFils: parsed.discountFils,
        vatBp: parsed.vatBp,
      }),
    [parsed, form.makingChargeMode],
  );

  const remaining = Math.max(pricing.totalFils - parsed.depositFils, 0);

  /* -------------------------------------------------------- submit */
  const submit = useCallback(
    async (acknowledgeDuplicate = false) => {
      const nextErrors: Record<string, string> = {};
      if (!form.customerId) nextErrors.customerId = 'Choose or create a customer';
      if (!form.productName.trim()) nextErrors.productName = 'Product name is required';
      if (!parsed.expectedWeightMg) nextErrors.expectedWeight = 'Enter the expected weight';
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        toast('Check the highlighted fields', 'error');
        return;
      }

      setSaving(true);
      try {
        const body = {
          customerId: form.customerId,
          productName: form.productName.trim(),
          category: form.category,
          style: form.style || null,
          karat: form.karat,
          referenceNo: form.referenceNo || null,
          expectedWeightMg: parsed.expectedWeightMg,
          minimumWeightMg: parsed.minimumWeightMg,
          maximumWeightMg: parsed.maximumWeightMg,
          goldRateFilsPerGram: parsed.goldRateFilsPerGram,
          goldRateMode: form.goldRateMode,
          goldValueOverrideFils: parsed.goldValueOverrideFils,
          makingChargeMode: form.makingChargeMode,
          makingChargeFils: parsed.makingChargeFils,
          otherChargesFils: parsed.otherChargesFils,
          discountFils: parsed.discountFils,
          vatBp: parsed.vatBp,
          depositFils: parsed.depositFils || undefined,
          depositMethod: form.depositMethod,
          makerId: form.makerId,
          travelerId: form.travelerId,
          destination: form.destination || null,
          orderDate: form.orderDate,
          expectedReadyDate: form.expectedReadyDate || null,
          expectedDeliveryDate: form.expectedDeliveryDate || null,
          notes: form.notes || null,
          tags: form.tags,
          acknowledgeDuplicate,
        };

        const res = await apiWrite<{ order: { id: string; orderNumber: string } }>('/api/orders', body, 'POST', { queue: false });
        if (!res) throw new Error('no_response');

        // Photos taken before the order existed are attached now.
        for (const m of pendingMedia) {
          await apiWrite(`/api/orders/${res.order.id}/media`, { ...m.payload, orderId: res.order.id }, 'POST', {
            label: 'Order photo',
          });
        }

        drafts.clear(DRAFT_KEY);
        toast(`Order ${res.order.orderNumber} created`);
        router.replace(`/orders/${res.order.id}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'possible_duplicate') {
          const list = (e.extra?.duplicates as { orderNumber: string; orderDate: string }[] | undefined) ?? [];
          const c = await confirm({
            title: 'Possible duplicate order',
            body: `This customer has a similar recent order: ${list.map((d) => `${d.orderNumber} (${d.orderDate})`).join(', ')}. Create it anyway?`,
            confirmLabel: 'Create anyway',
          });
          if (c.ok) await submit(true);
          return;
        }
        if (e instanceof ApiError && e.fields) {
          setErrors(e.fields);
          toast('Check the highlighted fields', 'error');
          return;
        }
        toast('Could not create the order', 'error');
      } finally {
        setSaving(false);
      }
    },
    [form, parsed, pendingMedia, confirm, router, toast],
  );

  return (
    <form
      className="space-y-4 pb-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-extrabold text-ink">New Order</h2>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <Save className="h-3.5 w-3.5" />
          {saving ? 'Saving…' : savedAt ? 'Draft saved' : 'Auto-save on'}
        </span>
      </div>

      {/* Section 47 — only the essentials are shown first. */}
      <Card>
        <CardTitle title="Essentials" subtitle="Enough to open the order at the counter" />
        <div className="space-y-3">
          <EntityPicker
            entity="customers"
            label="Customer"
            required
            value={form.customerId}
            error={errors.customerId}
            onChange={(id, item: DirectoryItem | null) => {
              set('customerId', id);
              set('customerName', item?.name ?? '');
              if (item?.country && !form.destination) set('destination', String(item.city ?? item.country));
            }}
          />

          <Field label="Product name" required error={errors.productName}>
            <TextInput value={form.productName} onChange={(v) => set('productName', v)} placeholder="Indian Necklace" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Karat">
              <Select
                value={form.karat}
                onChange={(v) => set('karat', v)}
                options={(settings.karats.length ? settings.karats : [...KARATS]).map((k) => ({ value: k, label: k }))}
              />
            </Field>
            <Field label="Expected weight" required error={errors.expectedWeight}>
              <NumberInput value={form.expectedWeight} onChange={(v) => set('expectedWeight', v)} suffix="g" placeholder="45.000" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Deposit">
              <NumberInput value={form.deposit} onChange={(v) => set('deposit', v)} suffix={settings.currency} />
            </Field>
            <Field label="Expected delivery">
              <DateInput value={form.expectedDeliveryDate} onChange={(v) => set('expectedDeliveryDate', v)} />
            </Field>
          </div>

          <Field label="Photo">
            <PendingMediaPicker files={pendingMedia} onChange={setPendingMedia} />
          </Field>
        </div>
      </Card>

      <button
        type="button"
        className="btn-ghost w-full"
        onClick={() => setAdvanced((v) => !v)}
        aria-expanded={advanced}
      >
        {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        More Details
      </button>

      {advanced ? (
        <>
          <Card>
            <CardTitle title="Product" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Category">
                  <Select
                    value={form.category}
                    onChange={(v) => set('category', v)}
                    options={(settings.categories.length ? settings.categories : [...CATEGORIES]).map((c) => ({ value: c, label: c }))}
                  />
                </Field>
                <Field label="Style">
                  <Select
                    value={form.style}
                    onChange={(v) => set('style', v)}
                    options={(settings.styles.length ? settings.styles : [...STYLES]).map((s) => ({ value: s, label: s }))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Minimum weight" hint="Optional tolerance band">
                  <NumberInput value={form.minimumWeight} onChange={(v) => set('minimumWeight', v)} suffix="g" />
                </Field>
                <Field label="Maximum weight">
                  <NumberInput value={form.maximumWeight} onChange={(v) => set('maximumWeight', v)} suffix="g" />
                </Field>
              </div>
              {parsed.expectedWeightMg > 0 ? (
                <p className="rounded-xl bg-surface2 px-3 py-2 text-[12px] text-muted">
                  Expected <span className="num font-semibold text-ink">{formatWeight(parsed.expectedWeightMg)} g</span>
                  {parsed.minimumWeightMg !== null && parsed.maximumWeightMg !== null ? (
                    <>
                      {' '}
                      · Range{' '}
                      <span className="num font-semibold text-ink">
                        {formatWeight(parsed.minimumWeightMg)} – {formatWeight(parsed.maximumWeightMg)} g
                      </span>
                    </>
                  ) : null}
                </p>
              ) : null}
              <Field label="Manual reference number" hint="Leave empty to auto-number as GO-YYYY-0001">
                <TextInput value={form.referenceNo} onChange={(v) => set('referenceNo', v)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle title="Price" subtitle="Every total is recalculated live" />
            <div className="space-y-3">
              <Field label="Gold rate type">
                <Segmented
                  value={form.goldRateMode}
                  onChange={(v) => set('goldRateMode', v)}
                  options={[
                    { value: 'per_gram', label: 'Per gram' },
                    { value: 'per_ounce', label: 'Per ounce' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                />
              </Field>

              {form.goldRateMode === 'manual' ? (
                <Field label="Gold value" hint="Type the total gold value directly">
                  <NumberInput value={form.goldValueOverride} onChange={(v) => set('goldValueOverride', v)} suffix={settings.currency} />
                </Field>
              ) : (
                <Field label={form.goldRateMode === 'per_ounce' ? 'Rate per ounce' : 'Rate per gram'}>
                  <NumberInput value={form.goldRate} onChange={(v) => set('goldRate', v)} suffix={settings.currency} />
                </Field>
              )}

              <Field label="Making charge">
                <Segmented
                  value={form.makingChargeMode}
                  onChange={(v) => set('makingChargeMode', v)}
                  options={[
                    { value: 'per_gram', label: 'Per gram' },
                    { value: 'fixed', label: 'Fixed amount' },
                  ]}
                />
              </Field>
              <NumberInput value={form.makingCharge} onChange={(v) => set('makingCharge', v)} suffix={settings.currency} ariaLabel="Making charge amount" />

              <div className="grid grid-cols-2 gap-2">
                <Field label="Other charges">
                  <NumberInput value={form.otherCharges} onChange={(v) => set('otherCharges', v)} suffix={settings.currency} />
                </Field>
                <Field label="Discount">
                  <NumberInput value={form.discount} onChange={(v) => set('discount', v)} suffix={settings.currency} />
                </Field>
              </div>
              <Field label="VAT %" hint={`Shop default ${settings.vatPercent}%`}>
                <NumberInput value={form.vatPercent} onChange={(v) => set('vatPercent', v)} suffix="%" />
              </Field>
              <Field label="Deposit method">
                <Select
                  value={form.depositMethod}
                  onChange={(v) => set('depositMethod', v)}
                  options={settings.paymentMethods.map((m) => ({ value: m, label: m }))}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle title="Assignment" />
            <div className="space-y-3">
              <EntityPicker entity="makers" label="Maker" value={form.makerId} onChange={(id) => set('makerId', id)} />
              <EntityPicker entity="travelers" label="Traveler" value={form.travelerId} onChange={(id) => set('travelerId', id)} />
              <Field label="Destination">
                <TextInput value={form.destination} onChange={(v) => set('destination', v)} placeholder="Bamako, Mali" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Order date">
                  <DateInput value={form.orderDate} onChange={(v) => set('orderDate', v)} />
                </Field>
                <Field label="Expected ready">
                  <DateInput value={form.expectedReadyDate} onChange={(v) => set('expectedReadyDate', v)} />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle title="Notes & tags" />
            <div className="space-y-3">
              <Field label="Notes">
                <TextArea value={form.notes} onChange={(v) => set('notes', v)} placeholder="Anything the shop needs to remember" />
              </Field>
              <Field label="Tags">
                <TagPicker value={form.tags} onChange={(v) => set('tags', v)} suggestions={DEFAULT_TAGS} />
              </Field>
            </div>
          </Card>
        </>
      ) : null}

      <Card>
        <CardTitle title="Summary" />
        <dl className="space-y-1 text-[13px]">
          <Line label="Gold value" value={`${settings.currency} ${formatMoney(pricing.goldValueFils)}`} />
          <Line label="Making charge" value={`${settings.currency} ${formatMoney(pricing.makingFils)}`} />
          {pricing.otherChargesFils ? <Line label="Other charges" value={`${settings.currency} ${formatMoney(pricing.otherChargesFils)}`} /> : null}
          {pricing.discountFils ? <Line label="Discount" value={`− ${settings.currency} ${formatMoney(pricing.discountFils)}`} /> : null}
          {pricing.vatFils ? <Line label="VAT" value={`${settings.currency} ${formatMoney(pricing.vatFils)}`} /> : null}
          <Line label="Total" value={`${settings.currency} ${formatMoney(pricing.totalFils)}`} strong />
          <Line label="Deposit" value={`${settings.currency} ${formatMoney(parsed.depositFils)}`} />
          <Line label="Remaining" value={`${settings.currency} ${formatMoney(remaining)}`} strong tone={remaining > 0 ? 'bad' : 'ok'} />
        </dl>
        {!form.expectedDeliveryDate ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-[12px] text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No expected delivery date — this order will not appear in the overdue checks.
          </p>
        ) : null}
      </Card>

      <div className="sticky bottom-24 z-30">
        <button type="submit" className="btn-primary w-full shadow-pop" disabled={saving}>
          {saving ? <Spinner /> : null}
          Create Order
        </button>
      </div>
    </form>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'bad' | 'ok' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className={strong ? 'font-bold text-ink' : 'text-muted'}>{label}</dt>
      <dd className={`num ${strong ? 'text-[15px] font-extrabold' : 'font-semibold'} ${tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}
