'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  MessageCircle,
  Pencil,
  Phone,
  Printer,
  Share2,
  StickyNote,
  Wallet,
} from 'lucide-react';
import { useApp } from '@/components/providers';
import { BalanceBadge, CoverThumb, StatusBadge, StatusProgress, Tag, UrgencyBadge } from '@/components/bits';
import { MediaGallery } from '@/components/media';
import { NotesPanel } from '@/components/notes';
import { PaymentsPanel } from '@/components/payments';
import { StatusUpdateDialog } from '@/components/status-update';
import { Timeline } from '@/components/timeline';
import { ActionSheet, Card, CardTitle, ErrorState, Modal, Skeleton } from '@/components/ui';
import { apiGet, cache, whatsappLink } from '@/lib/client';
import { countdownLabel, diffDays, dubaiShort } from '@/lib/date';
import { formatMoney, formatWeight, phoneDigits } from '@/lib/num';
import { allowedTransitions, compareWeight, warningsFor, WEIGHT_VERDICT_KEY } from '@/lib/calc';
import {
  STATUS_ICON,
  STATUS_KEY,
  isClosed,
  type GoldExchange,
  type OrderMedia,
  type OrderNote,
  type OrderStatus,
  type OrderView,
  type Payment,
  type StatusEvent,
} from '@/lib/types';
import type { DictKey } from '@/i18n/dict';

interface Bundle {
  order: OrderView;
  customer: Record<string, unknown> | null;
  maker: Record<string, unknown> | null;
  traveler: Record<string, unknown> | null;
  shipment: Record<string, unknown> | null;
  payments: Payment[];
  exchanges: GoldExchange[];
  notes: OrderNote[];
  media: OrderMedia[];
  timeline: StatusEvent[];
}

/** Templates are prefilled only — the shop presses send inside WhatsApp itself. */
const WHATSAPP_TEMPLATES = [
  { key: 'received', label: 'wa_received', msg: 'wa_msg_received' },
  { key: 'ready', label: 'wa_ready', msg: 'wa_msg_ready' },
  { key: 'arrived', label: 'wa_arrived', msg: 'wa_msg_arrived' },
  { key: 'balance', label: 'wa_balance', msg: 'wa_msg_balance' },
  { key: 'collect', label: 'wa_collect', msg: 'wa_msg_collect' },
] as const satisfies readonly { key: string; label: DictKey; msg: DictKey }[];

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, toast, can, t } = useApp();
  const router = useRouter();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusTarget, setStatusTarget] = useState<OrderStatus | null>(null);
  const [sheet, setSheet] = useState<'status' | 'actions' | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet<Bundle>(`/api/orders/${id}`);
      setBundle(d);
      cache.set(`order:${id}`, d);
      setError(false);
    } catch {
      const cached = cache.get<Bundle>(`order:${id}`);
      if (cached) setBundle(cached);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const order = bundle?.order;

  const weight = useMemo(() => {
    if (!order || order.actualWeightMg === null) return null;
    return compareWeight(order.expectedWeightMg, order.actualWeightMg, {
      minimumMg: order.minimumWeightMg,
      maximumMg: order.maximumWeightMg,
      toleranceMg: settings.defaultToleranceMg,
    });
  }, [order, settings.defaultToleranceMg]);

  const warnings = useMemo(() => {
    if (!order || !bundle) return [];
    return warningsFor({
      status: order.status,
      expectedDeliveryDate: order.expectedDeliveryDate,
      expectedReadyDate: order.expectedReadyDate,
      actualWeightMg: order.actualWeightMg,
      expectedWeightMg: order.expectedWeightMg,
      weightVerdict: weight?.verdict ?? null,
      remainingFils: order.remainingBalanceFils,
      coverMediaId: order.coverMediaId,
      mediaCount: bundle.media.length,
      departureDate: (bundle.shipment?.departureDate as string) ?? null,
    });
  }, [order, bundle, weight]);

  if (loading && !bundle) return <DetailSkeleton />;
  if (error || !bundle || !order) return <ErrorState text={t('could_not_load_order')} onRetry={() => void load()} />;

  const patchOrder = (patch: Partial<OrderView>) => setBundle((b) => (b ? { ...b, order: { ...b.order, ...patch } } : b));
  const countdown = countdownLabel(order.expectedDeliveryDate);
  const waMessage = (key: DictKey) =>
    t(key, {
      name: order.customerName,
      number: order.orderNumber,
      product: order.productName,
      karat: order.karat,
      amount: `${settings.currency} ${formatMoney(order.remainingBalanceFils)}`,
      where: order.destination ? ` — ${order.destination}` : '',
    });
  const phone = phoneDigits(order.customerPhone);
  const whatsapp = phoneDigits(order.customerWhatsapp ?? order.customerPhone);
  const transitions = allowedTransitions(order.status);

  return (
    <div className="space-y-4 pb-24">
      {/* header */}
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <CoverThumb mediaId={order.coverMediaId} alt={order.productName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="num text-[12px] font-semibold text-muted">{order.orderNumber}</p>
            <h2 className="truncate text-[19px] font-extrabold text-ink">{order.customerName}</h2>
            <p className="truncate text-[13px] text-muted">
              {order.productName} · {order.karat} · {order.category}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge status={order.status} />
              <UrgencyBadge order={order} />
              <BalanceBadge status={order.balanceStatus} />
            </div>
          </div>
        </div>
        {order.tags.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {order.tags.map((t) => (
              <li key={t}>
                <Tag name={t} />
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {/* quick actions */}
      <div className="scroll-x no-print">
        {phone ? (
          <a href={`tel:${phone}`} className="btn-ghost btn-sm shrink-0">
            <Phone className="h-4 w-4" /> {t('call')}
          </a>
        ) : null}
        {whatsapp ? (
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setWhatsappOpen(true)}>
            <MessageCircle className="h-4 w-4" /> {t('whatsapp')}
          </button>
        ) : null}
        <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setSheet('actions')}>
          <Wallet className="h-4 w-4" /> {t('quick_actions')}
        </button>
        <Link href={`/orders/${order.id}/edit`} className="btn-ghost btn-sm shrink-0">
          <Pencil className="h-4 w-4" /> {t('edit')}
        </Link>
        <Link href={`/print/${order.id}`} className="btn-ghost btn-sm shrink-0">
          <Printer className="h-4 w-4" /> {t('print')}
        </Link>
        <button
          type="button"
          className="btn-ghost btn-sm shrink-0"
          onClick={async () => {
            const text = `${order.orderNumber} · ${order.customerName} · ${order.productName} ${order.karat} · ${t(STATUS_KEY[order.status])}`;
            if (navigator.share) {
              await navigator.share({ title: order.orderNumber, text }).catch(() => undefined);
            } else {
              await navigator.clipboard?.writeText(text);
              toast(t('summary_copied'));
            }
          }}
        >
          <Share2 className="h-4 w-4" /> {t('share')}
        </button>
      </div>

      {warnings.length ? (
        <Card className="border-warn/40">
          <CardTitle title={t('smart_warnings')} icon={<AlertTriangle className="h-4 w-4" />} />
          <ul className="space-y-1.5">
            {warnings.map((w) => (
              <li key={w.code} className="flex items-start gap-2 text-[13px]">
                <span aria-hidden className={w.severity === 'high' ? 'text-bad' : w.severity === 'medium' ? 'text-warn' : 'text-muted'}>
                  {w.severity === 'high' ? '🔴' : w.severity === 'medium' ? '🟠' : '⚪'}
                </span>
                <span className="text-ink">{t(w.key)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <StatusProgress status={order.status} percent={order.progressPercent} />
      </Card>

      {/* order + delivery countdown */}
      <Card>
        <CardTitle title={t('order')} />
        <dl className="text-[13px]">
          <Row label={t('order_number')} value={order.orderNumber} mono />
          {order.referenceNo ? <Row label={t('reference')} value={order.referenceNo} /> : null}
          <Row label={t('order_date')} value={dubaiShort(order.orderDate)} />
          <Row label={t('style')} value={order.style ?? '—'} />
          <Row label={t('expected_ready')} value={dubaiShort(order.expectedReadyDate)} />
          <Row label={t('expected_delivery')} value={dubaiShort(order.expectedDeliveryDate)} />
          <Row
            label={t('countdown')}
            value={countdown}
            tone={order.isOverdue ? 'bad' : order.urgency === 'due_today' || order.urgency === 'due_tomorrow' ? 'warn' : 'default'}
          />
          {order.destination ? <Row label={t('destination')} value={order.destination} /> : null}
          {order.cancelReason ? <Row label={t('status_cancelled')} value={order.cancelReason} tone="bad" /> : null}
        </dl>
      </Card>

      <Card>
        <CardTitle
          title={t('customer')}
          action={
            <Link href={`/customers/${order.customerId}`} className="text-[12px] font-bold text-gold">
              {t('profile')}
            </Link>
          }
        />
        <dl className="text-[13px]">
          <Row label={t('name')} value={order.customerName} />
          <Row label={t('phone')} value={order.customerPhone ?? '—'} mono />
          <Row label={t('whatsapp')} value={order.customerWhatsapp ?? '—'} mono />
          <Row label={t('customer_type')} value={String(bundle.customer?.customerType ?? '—')} />
          <Row
            label={t('location')}
            value={[bundle.customer?.city, bundle.customer?.country].filter(Boolean).join(', ') || '—'}
          />
        </dl>
      </Card>

      {/* weight: expected vs actual */}
      <Card>
        <CardTitle title={t('weight')} subtitle={t('weight_hint')} />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface2 p-3">
            <p className="label">{t('expected')}</p>
            <p className="num mt-1 text-[18px] font-extrabold text-ink">{formatWeight(order.expectedWeightMg)} g</p>
            {order.minimumWeightMg !== null && order.maximumWeightMg !== null ? (
              <p className="num mt-0.5 text-[11px] text-muted">
                {formatWeight(order.minimumWeightMg)} – {formatWeight(order.maximumWeightMg)} g
              </p>
            ) : null}
          </div>
          <div className="rounded-xl bg-surface2 p-3">
            <p className="label">{t('actual')}</p>
            <p className="num mt-1 text-[18px] font-extrabold text-ink">
              {order.actualWeightMg === null ? '—' : `${formatWeight(order.actualWeightMg)} g`}
            </p>
            {weight ? (
              <p
                className={`num mt-0.5 text-[11px] font-bold ${
                  weight.verdict === 'within' ? 'text-ok' : weight.verdict === 'slight' ? 'text-warn' : 'text-bad'
                }`}
              >
                {weight.differenceMg >= 0 ? '+' : '−'}
                {formatWeight(Math.abs(weight.differenceMg))} g · {t(WEIGHT_VERDICT_KEY[weight.verdict])}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* price */}
      <Card>
        <CardTitle title={t('price')} />
        <dl className="text-[13px]">
          <Row
            label={t('gold_rate')}
            value={
              order.goldRateMode === 'manual'
                ? t('manual')
                : `${settings.currency} ${formatMoney(order.goldRateFilsPerGram)} / g`
            }
            mono
          />
          <Row
            label={t('making_charge')}
            value={`${settings.currency} ${formatMoney(order.makingChargeFils)}${order.makingChargeMode === 'per_gram' ? ' / g' : ''}`}
            mono
          />
          {order.otherChargesFils ? <Row label={t('other_charges')} value={`${settings.currency} ${formatMoney(order.otherChargesFils)}`} mono /> : null}
          {order.discountFils ? <Row label={t('discount')} value={`− ${settings.currency} ${formatMoney(order.discountFils)}`} mono /> : null}
          {order.vatBp ? <Row label={t('vat')} value={`${order.vatBp / 100}%`} mono /> : null}
          <Row label={t('total')} value={`${settings.currency} ${formatMoney(order.totalAmountFils)}`} mono strong />
          {can('finance.view') && order.makerCostFils ? (
            <Row label={t('maker_cost')} value={`${settings.currency} ${formatMoney(order.makerCostFils)}`} mono />
          ) : null}
        </dl>
      </Card>

      <Card>
        <PaymentsPanel
          order={order}
          payments={bundle.payments}
          exchanges={bundle.exchanges}
          onChange={({ payments, exchanges, order: patch }) =>
            setBundle((b) =>
              b
                ? {
                    ...b,
                    payments: payments ?? b.payments,
                    exchanges: exchanges ?? b.exchanges,
                    order: { ...b.order, ...(patch ?? {}) },
                  }
                : b,
            )
          }
        />
      </Card>

      {order.makerId || order.makerNotes ? (
        <Card>
          <CardTitle title={t('maker')} />
          <dl className="text-[13px]">
            <Row label={t('maker')} value={order.makerName ?? '—'} />
            <Row label={t('company')} value={String(bundle.maker?.company ?? '—')} />
            <Row label={t('sent_to_maker')} value={dubaiShort(order.sentToMakerDate)} />
            <Row label={t('expected_ready')} value={dubaiShort(order.expectedReadyDate)} />
            <Row label={t('reference')} value={order.makerReference ?? '—'} />
            {order.qualityCheck ? <Row label={t('quality_check')} value={order.qualityCheck} /> : null}
            {order.makerNotes ? <Row label={t('notes')} value={order.makerNotes} /> : null}
          </dl>
        </Card>
      ) : null}

      {order.travelerId ? (
        <Card>
          <CardTitle title={t('traveler')} />
          <dl className="text-[13px]">
            <Row label={t('traveler')} value={order.travelerName ?? '—'} />
            <Row label={t('destination')} value={order.destination ?? '—'} />
            <Row label={t('departure')} value={dubaiShort((bundle.shipment?.departureDate as string) ?? null)} />
            <Row label={t('expected_arrival')} value={dubaiShort((bundle.shipment?.expectedArrival as string) ?? null)} />
            <Row label={t('flight')} value={String(bundle.shipment?.flightNumber ?? '—')} />
            <Row label={t('airline')} value={String(bundle.shipment?.airline ?? '—')} />
            <Row label={t('package_ref')} value={String(bundle.shipment?.packageRef ?? '—')} />
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardTitle title={t('media')} subtitle={t('media_hint')} icon={<Camera className="h-4 w-4" />} />
        <MediaGallery
          orderId={order.id}
          media={bundle.media}
          coverMediaId={order.coverMediaId}
          readOnly={!can('order.edit')}
          onChange={(media, coverMediaId) =>
            setBundle((b) =>
              b ? { ...b, media, order: { ...b.order, coverMediaId: coverMediaId === undefined ? b.order.coverMediaId : coverMediaId } } : b,
            )
          }
        />
      </Card>

      {order.status === 'delivered' ? (
        <Card className="border-ok/50">
          <CardTitle title={`✅ ${t('order_delivered_title')}`} subtitle={t('final_summary')} />
          <dl className="text-[13px]">
            <Row label={t('status_delivered')} value={dubaiShort(order.deliveredDate)} />
            <Row label={t('received_by')} value={order.receivedBy ?? '—'} />
            <Row label={t('delivery_method')} value={order.deliveryMethod ?? '—'} />
            <Row label={t('expected_weight')} value={`${formatWeight(order.expectedWeightMg)} g`} mono />
            <Row
              label={t('actual_weight')}
              value={order.actualWeightMg === null ? '—' : `${formatWeight(order.actualWeightMg)} g`}
              mono
            />
            <Row label={t('total')} value={`${settings.currency} ${formatMoney(order.totalAmountFils)}`} mono />
            <Row label={t('total_paid')} value={`${settings.currency} ${formatMoney(order.totalPaidFils)}`} mono />
            <Row
              label={t('balance')}
              value={`${settings.currency} ${formatMoney(order.remainingBalanceFils)}`}
              mono
              tone={order.remainingBalanceFils > 0 ? 'bad' : 'ok'}
            />
            {order.deliveredDate ? (
              <Row label={t('duration')} value={`${Math.max(diffDays(order.deliveredDate, order.orderDate), 0)} ${t('days')}`} />
            ) : null}
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardTitle title={t('timeline')} subtitle={t('timeline_hint')} />
        <Timeline events={bundle.timeline} currency={settings.currency} />
      </Card>

      <Card>
        <NotesPanel orderId={order.id} notes={bundle.notes} onChange={(notes) => setBundle((b) => (b ? { ...b, notes } : b))} />
      </Card>

      {/* sticky primary action */}
      {can('order.status') && !isClosed(order.status) ? (
        <div className="fixed inset-x-0 bottom-[72px] z-30 mx-auto max-w-2xl px-4 no-print">
          <button type="button" className="btn-primary w-full shadow-pop" onClick={() => setSheet('status')}>
            <ArrowRightLeft className="h-4 w-4" />
            {t('update_status')}
          </button>
        </div>
      ) : null}

      <ActionSheet
        open={sheet === 'status'}
        onClose={() => setSheet(null)}
        title={t('update_status')}
        actions={transitions.map((s) => ({
          key: s,
          label: `${STATUS_ICON[s]} ${s === 'maker' && order.status === 'ready' ? t('return_to_maker') : t(STATUS_KEY[s])}`,
          hint: s === 'cancelled' ? t('a_reason_required') : undefined,
          danger: s === 'cancelled',
          onSelect: () => setStatusTarget(s),
        }))}
      />

      <ActionSheet
        open={sheet === 'actions'}
        onClose={() => setSheet(null)}
        title={t('quick_actions')}
        actions={[
          { key: 'edit', label: t('edit_order'), icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/orders/${order.id}/edit`) },
          { key: 'print', label: t('print_documents'), icon: <Printer className="h-4 w-4" />, onSelect: () => router.push(`/print/${order.id}`) },
          { key: 'customer', label: t('open_customer'), icon: <StickyNote className="h-4 w-4" />, onSelect: () => router.push(`/customers/${order.customerId}`) },
        ]}
      />

      <StatusUpdateDialog
        order={order}
        target={statusTarget}
        onClose={() => {
          setStatusTarget(null);
          setSheet(null);
        }}
        onUpdated={(updated) => {
          patchOrder(updated);
          void load();
        }}
      />

      <Modal open={whatsappOpen} onClose={() => setWhatsappOpen(false)} title={t('whatsapp_customer')}>
        <p className="text-[12px] text-muted">{t('whatsapp_hint')}</p>
        <div className="space-y-2">
          {WHATSAPP_TEMPLATES.map((tpl) => (
            <a
              key={tpl.key}
              href={whatsappLink(whatsapp, waMessage(tpl.msg))}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-line px-3 py-2.5 text-[13px] transition hover:border-gold/60"
              onClick={() => setWhatsappOpen(false)}
            >
              <span className="block font-semibold text-ink">{t(tpl.label)}</span>
              <span className="block text-[12px] text-muted">{waMessage(tpl.msg)}</span>
            </a>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  strong,
  tone = 'default',
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  tone?: 'default' | 'bad' | 'ok' | 'warn';
}) {
  const toneClass = tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 last:border-0">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-end ${mono ? 'num' : ''} ${strong ? 'text-[15px] font-extrabold' : 'font-semibold'} ${toneClass}`}>{value}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-24 w-24" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32" />
      ))}
    </div>
  );
}
