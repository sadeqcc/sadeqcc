'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '@/components/providers';
import { ErrorState, Segmented, Skeleton } from '@/components/ui';
import { apiGet } from '@/lib/client';
import { dubaiShort, dubaiStamp } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import { STATUS_KEY, type GoldExchange, type OrderView, type Payment } from '@/lib/types';

type Doc = 'receipt' | 'job' | 'delivery';

interface Bundle {
  order: OrderView;
  customer: Record<string, unknown> | null;
  maker: Record<string, unknown> | null;
  payments: Payment[];
  exchanges: GoldExchange[];
}

export default function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { settings, t, lang } = useApp();
  const [doc, setDoc] = useState<Doc>('receipt');
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setBundle(await apiGet<Bundle>(`/api/orders/${id}`));
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
  if (error || !bundle) return <ErrorState text={t('could_not_load_order')} onRetry={() => void load()} />;

  const o = bundle.order;
  const c = settings.currency;
  void lang;

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <Segmented
          value={doc}
          onChange={setDoc}
          options={[
            { value: 'receipt', label: t('doc_receipt') },
            { value: 'job', label: t('doc_job') },
            { value: 'delivery', label: t('doc_delivery') },
          ]}
        />
        <button type="button" className="btn-primary w-full" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> {t('print')}
        </button>
      </div>

      <article className="card card-pad print-block">
        <header className="mb-4 border-b border-line pb-3">
          <h1 className="text-[20px] font-extrabold text-ink">{settings.shopName || 'Gold Orders'}</h1>
          {settings.shopPhone || settings.shopAddress ? (
            <p className="text-[12px] text-muted">{[settings.shopAddress, settings.shopPhone].filter(Boolean).join(' · ')}</p>
          ) : null}
          <p className="mt-2 text-[14px] font-bold uppercase tracking-wide text-gold">
            {doc === 'receipt' ? t('print_receipt_title') : doc === 'job' ? t('print_job_title') : t('print_delivery_title')}
          </p>
        </header>

        <section className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <Line label={t('order_number')} value={o.orderNumber} />
          <Line label={t('order_date')} value={dubaiShort(o.orderDate)} />
          {doc !== 'job' ? <Line label={t('customer')} value={o.customerName} /> : null}
          {doc !== 'job' ? <Line label={t('phone')} value={o.customerPhone ?? '—'} /> : null}
          <Line label={t('status')} value={t(STATUS_KEY[o.status])} />
          <Line label={t('expected_delivery')} value={dubaiShort(o.expectedDeliveryDate)} />
        </section>

        <section className="mb-3 border-t border-line pt-3 text-[13px]">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t('product')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Line label={t('item')} value={o.productName} />
            <Line label={t('category')} value={o.category} />
            <Line label={t('karat')} value={o.karat} />
            <Line label={t('style')} value={o.style ?? '—'} />
            <Line label={t('expected_weight')} value={`${formatWeight(o.expectedWeightMg)} g`} />
            <Line label={t('actual_weight')} value={o.actualWeightMg === null ? '—' : `${formatWeight(o.actualWeightMg)} g`} />
          </div>
        </section>

        {/* A maker job sheet deliberately carries no customer money. */}
        {doc === 'job' ? (
          <section className="border-t border-line pt-3 text-[13px]">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t('job')}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <Line label={t('maker')} value={o.makerName ?? '—'} />
              <Line label={t('company')} value={String(bundle.maker?.company ?? '—')} />
              <Line label={t('sent')} value={dubaiShort(o.sentToMakerDate)} />
              <Line label={t('expected_ready')} value={dubaiShort(o.expectedReadyDate)} />
              <Line label={t('reference')} value={o.makerReference ?? '—'} />
              <Line
                label={t('weight_range')}
                value={
                  o.minimumWeightMg !== null && o.maximumWeightMg !== null
                    ? `${formatWeight(o.minimumWeightMg)} – ${formatWeight(o.maximumWeightMg)} g`
                    : '—'
                }
              />
            </div>
            {o.makerNotes ? <p className="mt-2 whitespace-pre-wrap text-[12px]">{o.makerNotes}</p> : null}
            <div className="mt-8 flex gap-8 text-[12px] text-muted">
              <span className="flex-1 border-t border-line pt-1">{t('maker_signature')}</span>
              <span className="flex-1 border-t border-line pt-1">{t('date_received_short')}</span>
            </div>
          </section>
        ) : (
          <>
            <section className="border-t border-line pt-3 text-[13px]">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t('amounts')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Line label={t('total')} value={`${c} ${formatMoney(o.totalAmountFils)}`} />
                <Line label={t('total_paid')} value={`${c} ${formatMoney(o.totalPaidFils)}`} />
                <Line label={t('balance')} value={`${c} ${formatMoney(o.remainingBalanceFils)}`} />
                {o.makingChargeFils ? (
                  <Line
                    label={t('making_charge')}
                    value={`${c} ${formatMoney(o.makingChargeFils)}${o.makingChargeMode === 'per_gram' ? ' / g' : ''}`}
                  />
                ) : null}
              </div>
            </section>

            {bundle.payments.length ? (
              <section className="border-t border-line pt-3 text-[13px]">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t('payments')}</p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-start text-muted">
                      <th className="py-1 text-start font-semibold">{t('date')}</th>
                      <th className="py-1 text-start font-semibold">{t('method')}</th>
                      <th className="py-1 text-end font-semibold">{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundle.payments.map((p) => (
                      <tr key={p.id} className="border-t border-line/60">
                        <td className="num py-1">{dubaiShort(p.paidOn)}</td>
                        <td className="py-1">{p.method}</td>
                        <td className="num py-1 text-end">
                          {c} {formatMoney(p.amountFils)}
                        </td>
                      </tr>
                    ))}
                    {bundle.exchanges.map((x) => (
                      <tr key={x.id} className="border-t border-line/60">
                        <td className="num py-1">{dubaiShort(x.receivedOn)}</td>
                        <td className="py-1">
                          {t('gold_exchange')} {formatWeight(x.weightMg)} g {x.karat}
                        </td>
                        <td className="num py-1 text-end">
                          {c} {formatMoney(x.valueFils)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {doc === 'delivery' ? (
              <section className="border-t border-line pt-3 text-[13px]">
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">{t('delivery')}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Line label={t('status_delivered')} value={dubaiShort(o.deliveredDate)} />
                  <Line label={t('received_by')} value={o.receivedBy ?? '—'} />
                  <Line label={t('method')} value={o.deliveryMethod ?? '—'} />
                  <Line label={t('destination')} value={o.destination ?? '—'} />
                </div>
                <div className="mt-8 flex gap-8 text-[12px] text-muted">
                  <span className="flex-1 border-t border-line pt-1">{t('customer_signature')}</span>
                  <span className="flex-1 border-t border-line pt-1">{t('date')}</span>
                </div>
              </section>
            ) : null}
          </>
        )}

        <footer className="mt-4 border-t border-line pt-2 text-[11px] text-muted">
          {t('printed_at', { stamp: dubaiStamp(new Date()) })}
        </footer>
      </article>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-2 border-b border-line/40 py-0.5">
      <span className="text-muted">{label}</span>
      <span className="num text-end font-semibold text-ink">{value}</span>
    </p>
  );
}
