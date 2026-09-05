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
  const { settings, toast, confirm, can, t } = useApp();
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
  if (error || !order) return <ErrorState text={t('could_not_load_order')} onRetry={() => void load()} />;

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
      title: t('save_changes_title'),
      body: t('save_changes_body'),
      confirmLabel: t('save_changes'),
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
      toast(t('order_updated'));
      router.replace(`/orders/${id}`);
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'forbidden' ? t('no_permission_edit') : t('could_not_save_changes'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    const c = await confirm({
      title: t('archive_title'),
      body: t('archive_body'),
      danger: true,
      confirmLabel: t('archive_order'),
      requireReason: true,
    });
    if (!c.ok) return;
    try {
      await apiWrite(`/api/orders/${id}?reason=${encodeURIComponent(c.reason ?? '')}`, null, 'DELETE', { queue: false });
      toast(t('order_archived'));
      router.replace('/orders');
    } catch {
      toast(t('could_not_archive'), 'error');
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <h2 className="text-[18px] font-extrabold text-ink">
        {t('edit_title', { number: order.orderNumber })}
      </h2>

      <Card>
        <CardTitle title={t('order')} />
        <div className="space-y-3">
          <EntityPicker entity="customers" label={t('customer')} required value={customerId} onChange={(cid) => setCustomerId(cid)} />
          <Field label={t('product_name')} required>
            <TextInput value={f.productName ?? ''} onChange={(v) => set('productName', v)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('category')}>
              <Select value={f.category ?? ''} onChange={(v) => set('category', v)} options={(settings.categories.length ? settings.categories : [...CATEGORIES]).map((c) => ({ value: c, label: c }))} />
            </Field>
            <Field label={t('style')}>
              <Select value={f.style ?? ''} onChange={(v) => set('style', v)} placeholder={t('any_style')} options={(settings.styles.length ? settings.styles : [...STYLES]).map((s) => ({ value: s, label: s }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('karat')}>
              <Select value={f.karat ?? ''} onChange={(v) => set('karat', v)} options={(settings.karats.length ? settings.karats : [...KARATS]).map((k) => ({ value: k, label: k }))} />
            </Field>
            <Field label={t('reference')}>
              <TextInput value={f.referenceNo ?? ''} onChange={(v) => set('referenceNo', v)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('weight')} />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('expected_weight')} required>
              <NumberInput value={f.expectedWeight ?? ''} onChange={(v) => set('expectedWeight', v)} suffix="g" />
            </Field>
            <Field label={t('actual_weight')}>
              <NumberInput value={f.actualWeight ?? ''} onChange={(v) => set('actualWeight', v)} suffix="g" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('minimum_weight')}>
              <NumberInput value={f.minimumWeight ?? ''} onChange={(v) => set('minimumWeight', v)} suffix="g" />
            </Field>
            <Field label={t('maximum_weight')}>
              <NumberInput value={f.maximumWeight ?? ''} onChange={(v) => set('maximumWeight', v)} suffix="g" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('price')} subtitle={t('total_updates_to', { amount: `${settings.currency} ${formatMoney(preview.totalFils)}` })} />
        <div className="space-y-3">
          <Segmented
            value={rateMode}
            onChange={setRateMode}
            options={[
              { value: 'per_gram', label: t('per_gram') },
              { value: 'per_ounce', label: t('per_ounce') },
              { value: 'manual', label: t('manual') },
            ]}
          />
          {rateMode === 'manual' ? (
            <Field label={t('gold_value')}>
              <NumberInput value={f.goldValueOverride ?? ''} onChange={(v) => set('goldValueOverride', v)} suffix={settings.currency} />
            </Field>
          ) : (
            <Field label={rateMode === 'per_ounce' ? t('rate_per_ounce') : t('rate_per_gram')}>
              <NumberInput value={f.goldRate ?? ''} onChange={(v) => set('goldRate', v)} suffix={settings.currency} />
            </Field>
          )}
          <Segmented
            value={makingMode}
            onChange={setMakingMode}
            options={[
              { value: 'per_gram', label: t('per_gram') },
              { value: 'fixed', label: t('making_fixed') },
            ]}
          />
          <NumberInput value={f.makingCharge ?? ''} onChange={(v) => set('makingCharge', v)} suffix={settings.currency} ariaLabel={t('making_charge')} />
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('other_charges')}>
              <NumberInput value={f.otherCharges ?? ''} onChange={(v) => set('otherCharges', v)} suffix={settings.currency} />
            </Field>
            <Field label={t('discount')}>
              <NumberInput value={f.discount ?? ''} onChange={(v) => set('discount', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label={t('vat')}>
            <NumberInput value={f.vatPercent ?? ''} onChange={(v) => set('vatPercent', v)} suffix="%" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('maker_traveler')} />
        <div className="space-y-3">
          <EntityPicker entity="makers" label={t('maker')} value={makerId} onChange={setMakerId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('maker_reference')}>
              <TextInput value={f.makerReference ?? ''} onChange={(v) => set('makerReference', v)} />
            </Field>
            <Field label={t('maker_cost')}>
              <NumberInput value={f.makerCost ?? ''} onChange={(v) => set('makerCost', v)} suffix={settings.currency} />
            </Field>
          </div>
          <Field label={t('maker_notes')}>
            <TextArea value={f.makerNotes ?? ''} onChange={(v) => set('makerNotes', v)} rows={2} />
          </Field>
          <EntityPicker entity="travelers" label={t('traveler')} value={travelerId} onChange={setTravelerId} />
          <Field label={t('destination')}>
            <TextInput value={f.destination ?? ''} onChange={(v) => set('destination', v)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('dates')} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('order_date')}>
            <DateInput value={f.orderDate ?? ''} onChange={(v) => set('orderDate', v)} />
          </Field>
          <Field label={t('expected_ready')}>
            <DateInput value={f.expectedReadyDate ?? ''} onChange={(v) => set('expectedReadyDate', v)} />
          </Field>
          <Field label={t('expected_delivery')}>
            <DateInput value={f.expectedDeliveryDate ?? ''} onChange={(v) => set('expectedDeliveryDate', v)} />
          </Field>
          <Field label={t('ready_date')}>
            <DateInput value={f.readyDate ?? ''} onChange={(v) => set('readyDate', v)} />
          </Field>
          <Field label={t('arrival_date')}>
            <DateInput value={f.arrivalDate ?? ''} onChange={(v) => set('arrivalDate', v)} />
          </Field>
          <Field label={t('delivered_date')}>
            <DateInput value={f.deliveredDate ?? ''} onChange={(v) => set('deliveredDate', v)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle title={t('other')} />
        <div className="space-y-3">
          <Field label={t('quality_check')}>
            <Select value={f.qualityCheck ?? ''} onChange={(v) => set('qualityCheck', v)} placeholder={t('not_checked')} options={QUALITY_CHECKS.map((q) => ({ value: q, label: q }))} />
          </Field>
          <Field label={t('received_by')}>
            <TextInput value={f.receivedBy ?? ''} onChange={(v) => set('receivedBy', v)} />
          </Field>
          <Field label={t('notes')}>
            <TextArea value={f.notes ?? ''} onChange={(v) => set('notes', v)} />
          </Field>
          <Field label={t('tags')}>
            <TagPicker value={tags} onChange={setTags} suggestions={DEFAULT_TAGS} />
          </Field>
        </div>
      </Card>

      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner /> : <Save className="h-4 w-4" />}
          {t('save_changes')}
        </button>
      </div>

      {can('order.delete') ? (
        <button type="button" className="btn-danger w-full" onClick={() => void archive()}>
          <Archive className="h-4 w-4" />
          {t('archive_order')}
        </button>
      ) : null}
    </div>
  );
}
