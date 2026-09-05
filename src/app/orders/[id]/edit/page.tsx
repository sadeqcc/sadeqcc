'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Save } from 'lucide-react';
import { useApp } from '@/components/providers';
import { EntityPicker, TagPicker } from '@/components/pickers';
import { Card, CardTitle, DateInput, ErrorState, Field, NumberInput, Segmented, Select, Skeleton, Spinner, TextArea, TextInput } from '@/components/ui';
import { ApiError, apiGet, apiWrite } from '@/lib/client';
import { formatMoney, formatWeight, ouncePriceToPerGram, parseMoney, parseWeight, percentToBp } from '@/lib/num';
import { priceOrder } from '@/lib/calc';
import { CATEGORIES, DEFAULT_TAGS, KARATS, QUALITY_CHECKS, STYLES, type OrderView } from '@/lib/types';

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, toast, confirm, can } = useApp();
  const router = useRouter();

  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const [makerId, setMakerId] = useState<string | null>(null);
  const [travelerId, setTravelerId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [rateMode, setRateMode] = useState<'per_gram' | 'per_ounce' | 'manual'>('per_gram');
  const [makingMode, setMakingMode] = useState<'per_gram' | 'fixed'>('per_gram');

  const set = (k: string, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const load = useCallback(async () => {
    try {
      const d = await apiGet<{ order: OrderView }>(`/api/orders/${id}`);
      const o = d.order;
      setOrder(o);
      setCustomerId(o.customerId);
      setMakerId(o.makerId);
      setTravelerId(o.travelerId);
      setTags(o.tags);
      setRateMode(o.goldRateMode);
      setMakingMode(o.makingChargeMode);
      setF({
        productName: o.productName,
        category: o.category,
        style: o.style ?? '',
        karat: o.karat,
        referenceNo: o.referenceNo ?? '',
        expectedWeight: formatWeight(o.expectedWeightMg, false),
        minimumWeight: o.minimumWeightMg === null ? '' : formatWeight(o.minimumWeightMg, false),
        maximumWeight: o.maximumWeightMg === null ? '' : formatWeight(o.maximumWeightMg, false),
        actualWeight: o.actualWeightMg === null ? '' : formatWeight(o.actualWeightMg, false),
        goldRate: formatMoney(o.goldRateFilsPerGram, false),
        goldValueOverride: o.goldValueOverrideFils === null ? '' : formatMoney(o.goldValueOverrideFils, false),
        makingCharge: formatMoney(o.makingChargeFils, false),
        otherCharges: formatMoney(o.otherChargesFils, false),
        discount: formatMoney(o.discountFils, false),
        vatPercent: String(o.vatBp / 100),
        makerCost: formatMoney(o.makerCostFils, false),
        makerReference: o.makerReference ?? '',
        makerNotes: o.makerNotes ?? '',
        destination: o.destination ?? '',
        orderDate: o.orderDate,
        expectedReadyDate: o.expectedReadyDate ?? '',
        expectedDeliveryDate: o.expectedDeliveryDate ?? '',
        readyDate: o.readyDate ?? '',
        arrivalDate: o.arrivalDate ?? '',
        deliveredDate: o.deliveredDate ?? '',
        qualityCheck: o.qualityCheck ?? '',
        receivedBy: o.receivedBy ?? '',
        notes: o.notes ?? '',
      });
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-96" />;
  if (error || !order) return <ErrorState text="Could not load this order." onRetry={() => void load()} />;

  const rateInput = parseMoney(f.goldRate ?? '') ?? 0;
  const goldRateFilsPerGram = rateMode === 'per_ounce' ? ouncePriceToPerGram(rateInput) : rateInput;
  const expectedWeightMg = parseWeight(f.expectedWeight ?? '') ?? 0;
  const actualWeightMg = f.actualWeight ? parseWeight(f.actualWeight) : null;

  const preview = priceOrder({
    expectedWeightMg,
    actualWeightMg,
    goldRateFilsPerGram,
    goldValueOverrideFils: rateMode === 'manual' ? parseMoney(f.goldValueOverride ?? '') ?? 0 : null,
    makingChargeMode: makingMode,
    makingChargeFils: parseMoney(f.makingCharge ?? '') ?? 0,
    otherChargesFils: parseMoney(f.otherCharges ?? '') ?? 0,
    discountFils: parseMoney(f.discount ?? '') ?? 0,
    vatBp: percentToBp(Number(f.vatPercent || 0)),
  });

  const save = async () => {
    // Changing a stored weight or price is an audited edit, so a reason is asked for.
    const c = await confirm({
      title: 'Save changes?',
      body: 'The previous values are written to the audit log before they are replaced.',
      confirmLabel: 'Save changes',
      requireReason: true,
    });
    if (!c.ok) return;

    setSaving(true);
    try {
      await apiWrite(
        `/api/orders/${id}`,
        {
          customerId: customerId ?? order.customerId,
          productName: f.productName,
          category: f.category,
          style: f.style || null,
          karat: f.karat,
          referenceNo: f.referenceNo || null,
          expectedWeightMg,
          minimumWeightMg: f.minimumWeight ? parseWeight(f.minimumWeight) : null,
          maximumWeightMg: f.maximumWeight ? parseWeight(f.maximumWeight) : null,
          actualWeightMg,
          goldRateFilsPerGram,
          goldRateMode: rateMode,
          goldValueOverrideFils: rateMode === 'manual' ? parseMoney(f.goldValueOverride ?? '') ?? 0 : null,
          makingChargeMode: makingMode,
          makingChargeFils: parseMoney(f.makingCharge ?? '') ?? 0,
          otherChargesFils: parseMoney(f.otherCharges ?? '') ?? 0,
          discountFils: parseMoney(f.discount ?? '') ?? 0,
          vatBp: percentToBp(Number(f.vatPercent || 0)),
          makerId,
          makerReference: f.makerReference || null,
          makerCostFils: parseMoney(f.makerCost ?? '') ?? 0,
          makerNotes: f.makerNotes || null,
          travelerId,
          destination: f.destination || null,
          orderDate: f.orderDate,
          expectedReadyDate: f.expectedReadyDate || null,
          expectedDeliveryDate: f.expectedDeliveryDate || null,
          readyDate: f.readyDate || null,
          arrivalDate: f.arrivalDate || null,
          deliveredDate: f.deliveredDate || null,
          qualityCheck: f.qualityCheck || null,
          receivedBy: f.receivedBy || null,
          notes: f.notes || null,
          tags,
          reason: c.reason,
        },
        'PATCH',
        { queue: false },
      );
      toast('Order updated');
      router.replace(`/orders/${id}`);
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'forbidden' ? 'You do not have permission to edit orders' : 'Could not save the changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    const c = await confirm({
      title: 'Archive this order?',
      body: 'The order and its whole history stay in the database — it just leaves the active lists.',
      danger: true,
      confirmLabel: 'Archive order',
      requireReason: true,
    });
    if (!c.ok) return;
    try {
      await apiWrite(`/api/orders/${id}?reason=${encodeURIComponent(c.reason ?? '')}`, null, 'DELETE', { queue: false });
      toast('Order archived');
      router.replace('/orders');
    } catch {
      toast('Could not archive the order', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-[18px] font-extrabold text-ink">
        Edit {order.orderNumber}
      </h2>

      <Card>
        <CardTitle title="Order" />
        <div className="space-y-3">
          <EntityPicker entity="customers" label="Customer" required value={customerId} onChange={(cid) => setCustomerId(cid)} />
          <Field label="Product name" required>
            <TextInput value={f.productName ?? ''} onChange={(v) => set('productName', v)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <Select value={f.category ?? ''} onChange={(v) => set('category', v)} options={(settings.categories.length ? settings.categories : [...CATEGORIES]).map((c) => ({ value: c, label: c }))} />
            </Field>
            <Field label="Style">
              <Select value={f.style ?? ''} onChange={(v) => set('style', v)} placeholder="No style" options={(settings.styles.length ? settings.styles : [...STYLES]).map((s) => ({ value: s, label: s }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Karat">
              <Select value={f.karat ?? ''} onChange={(v) => set('karat', v)} options={(settings.karats.length ? settings.karats : [...KARATS]).map((k) => ({ value: k, label: k }))} />
            </Field>
            <Field label="Reference no.">
              <TextInput value={f.referenceNo ?? ''} onChange={(v) => set('referenceNo', v)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title="Weight" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Expected weight" required>
              <NumberInput value={f.expectedWeight ?? ''} onChange={(v) => set('expectedWeight', v)} suffix="g" />
            </Field>
            <Field label="Actual weight">
              <NumberInput value={f.actualWeight ?? ''} onChange={(v) => set('actualWeight', v)} suffix="g" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Minimum">
              <NumberInput value={f.minimumWeight ?? ''} onChange={(v) => set('minimumWeight', v)} suffix="g" />
            </Field>
            <Field label="Maximum">
              <NumberInput value={f.maximumWeight ?? ''} onChange={(v) => set('maximumWeight', v)} suffix="g" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title="Price" subtitle={`Total updates to ${settings.currency} ${formatMoney(preview.totalFils)}`} />
        <div className="space-y-3">
          <Segmented
            value={rateMode}
            onChange={setRateMode}
            options={[
              { value: 'per_gram', label: 'Per gram' },
              { value: 'per_ounce', label: 'Per ounce' },
              { value: 'manual', label: 'Manual' },
            ]}
          />
          {rateMode === 'manual' ? (
            <Field label="Gold value">
              <NumberInput value={f.goldValueOverride ?? ''} onChange={(v) => set('goldValueOverride', v)} suffix={settings.currency} />
            </Field>
          ) : (
            <Field label={rateMode === 'per_ounce' ? 'Rate per ounce' : 'Rate per gram'}>
              <NumberInput value={f.goldRate ?? ''} onChange={(v) => set('goldRate', v)} suffix={settings.currency} />
            </Field>
          )}
          <Segmented
            value={makingMode}
            onChange={setMakingMode}
            options={[
              { value: 'per_gram', label: 'Making per gram' },
              { value: 'fixed', label: 'Making fixed' },
            ]}
          />
          <NumberInput value={f.makingCharge ?? ''} onChange={(v) => set('makingCharge', v)} suffix={settings.currency} ariaLabel="Making charge" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Other charges">
              <NumberInput value={f.otherCharges ?? ''} onChange={(v) => set('otherCharges', v)} suffix={settings.currency} />
            </Field>
            <Field label="Discount">
              <NumberInput value={f.discount ?? ''} onChange={(v) => set('discount', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label="VAT %">
            <NumberInput value={f.vatPercent ?? ''} onChange={(v) => set('vatPercent', v)} suffix="%" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title="Maker & traveler" />
        <div className="space-y-3">
          <EntityPicker entity="makers" label="Maker" value={makerId} onChange={setMakerId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Maker reference">
              <TextInput value={f.makerReference ?? ''} onChange={(v) => set('makerReference', v)} />
            </Field>
            <Field label="Maker cost">
              <NumberInput value={f.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label="Maker notes">
            <TextArea value={f.makerNotes ?? ''} onChange={(v) => set('makerNotes', v)} rows={2} />
          </Field>
          <EntityPicker entity="travelers" label="Traveler" value={travelerId} onChange={setTravelerId} />
          <Field label="Destination">
            <TextInput value={f.destination ?? ''} onChange={(v) => set('destination', v)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title="Dates" />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Order date">
            <DateInput value={f.orderDate ?? ''} onChange={(v) => set('orderDate', v)} />
          </Field>
          <Field label="Expected ready">
            <DateInput value={f.expectedReadyDate ?? ''} onChange={(v) => set('expectedReadyDate', v)} />
          </Field>
          <Field label="Expected delivery">
            <DateInput value={f.expectedDeliveryDate ?? ''} onChange={(v) => set('expectedDeliveryDate', v)} />
          </Field>
          <Field label="Ready date">
            <DateInput value={f.readyDate ?? ''} onChange={(v) => set('readyDate', v)} />
          </Field>
          <Field label="Arrival date">
            <DateInput value={f.arrivalDate ?? ''} onChange={(v) => set('arrivalDate', v)} />
          </Field>
          <Field label="Delivered date">
            <DateInput value={f.deliveredDate ?? ''} onChange={(v) => set('deliveredDate', v)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title="Other" />
        <div className="space-y-3">
          <Field label="Quality check">
            <Select value={f.qualityCheck ?? ''} onChange={(v) => set('qualityCheck', v)} placeholder="Not checked" options={QUALITY_CHECKS.map((q) => ({ value: q, label: q }))} />
          </Field>
          <Field label="Received by">
            <TextInput value={f.receivedBy ?? ''} onChange={(v) => set('receivedBy', v)} />
          </Field>
          <Field label="Notes">
            <TextArea value={f.notes ?? ''} onChange={(v) => set('notes', v)} />
          </Field>
          <Field label="Tags">
            <TagPicker value={tags} onChange={setTags} suggestions={DEFAULT_TAGS} />
          </Field>
        </div>
      </Card>

      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>

      {can('order.delete') ? (
        <button type="button" className="btn-danger w-full" onClick={() => void archive()}>
          <Archive className="h-4 w-4" />
          Archive order
        </button>
      ) : null}
    </div>
  );
}
