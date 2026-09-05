'use client';

import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import {
  STATUS_FLOW,
  STATUS_ICON,
  STATUS_LABEL,
  URGENCY_ICON,
  URGENCY_LABEL,
  type OrderStatus,
  type OrderView,
  type Urgency,
} from '@/lib/types';
import { BALANCE_ICON, BALANCE_LABEL, type BalanceStatus } from '@/lib/calc';
import { dubaiShort } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';

/* ---------------------------------------------------------------- badges */

const STATUS_CLASS: Record<OrderStatus, string> = {
  ordered: 'bg-st-ordered/15 text-st-ordered',
  maker: 'bg-st-maker/15 text-st-maker',
  ready: 'bg-st-ready/15 text-st-ready',
  traveler: 'bg-st-traveler/15 text-st-traveler',
  arrived: 'bg-st-arrived/15 text-st-arrived',
  delivered: 'bg-st-delivered/15 text-st-delivered',
  cancelled: 'bg-st-cancelled/15 text-st-cancelled',
};

/** Colour is never the only signal — every badge carries an icon and a word. */
export function StatusBadge({ status, className = '' }: { status: OrderStatus; className?: string }) {
  return (
    <span className={`chip ${STATUS_CLASS[status]} ${className}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

const URGENCY_CLASS: Record<Urgency, string> = {
  critical: 'bg-st-overdue/20 text-st-overdue',
  high: 'bg-st-overdue/15 text-st-overdue',
  late: 'bg-st-overdue/15 text-st-overdue',
  due_today: 'bg-warn/15 text-warn',
  due_tomorrow: 'bg-warn/15 text-warn',
  upcoming: 'bg-ok/10 text-ok',
  no_date: 'bg-surface2 text-muted',
  delivered: 'bg-st-delivered/15 text-st-delivered',
  cancelled: 'bg-st-cancelled/15 text-st-cancelled',
};

export function UrgencyBadge({ order }: { order: Pick<OrderView, 'urgency' | 'daysLate' | 'daysRemaining'> }) {
  const { urgency, daysLate, daysRemaining } = order;
  let text = URGENCY_LABEL[urgency];
  if (daysLate > 0) text = `${URGENCY_LABEL[urgency]} · ${daysLate} ${daysLate === 1 ? 'day' : 'days'}`;
  else if (urgency === 'upcoming' && daysRemaining !== null) text = `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`;
  return (
    <span className={`chip ${URGENCY_CLASS[urgency]}`}>
      <span aria-hidden>{URGENCY_ICON[urgency]}</span>
      {urgency === 'critical' || urgency === 'high' || urgency === 'late' ? `OVERDUE · ${daysLate} ${daysLate === 1 ? 'DAY' : 'DAYS'}` : text}
    </span>
  );
}

const BALANCE_CLASS: Record<BalanceStatus, string> = {
  paid: 'bg-ok/15 text-ok',
  partial: 'bg-warn/15 text-warn',
  unpaid: 'bg-bad/15 text-bad',
  credit: 'bg-info/15 text-info',
};

export function BalanceBadge({ status }: { status: BalanceStatus }) {
  return (
    <span className={`chip ${BALANCE_CLASS[status]}`}>
      <span aria-hidden>{BALANCE_ICON[status]}</span>
      {BALANCE_LABEL[status]}
    </span>
  );
}

export function Tag({ name }: { name: string }) {
  return <span className="chip bg-gold/10 text-gold normal-case tracking-normal">{name}</span>;
}

/* --------------------------------------------------------------- progress */

export function StatusProgress({ status, percent }: { status: OrderStatus; percent: number }) {
  const index = STATUS_FLOW.indexOf(status);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Order Progress</span>
        <span className="num text-[13px] font-bold text-gold">{status === 'cancelled' ? 'Cancelled' : `${percent}%`}</span>
      </div>
      <ol className="flex items-center gap-1">
        {STATUS_FLOW.map((s, i) => {
          const done = index >= 0 && i <= index;
          return (
            <li key={s} className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] ${
                  done ? 'border-gold bg-gold text-black' : 'border-line bg-surface2 text-muted'
                }`}
                aria-hidden
              >
                {done ? '●' : '○'}
              </span>
              <span className={`text-center text-[9px] font-semibold uppercase ${done ? 'text-ink' : 'text-muted'}`}>
                {STATUS_LABEL[s]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        {status === 'cancelled' ? 'Order cancelled' : `Step ${index + 1} of ${STATUS_FLOW.length}: ${STATUS_LABEL[status]}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ cover */

export function CoverThumb({
  mediaId,
  alt,
  size = 'md',
}: {
  mediaId: string | null;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-24 w-24' : 'h-16 w-16';
  if (!mediaId) {
    return (
      <div className={`${box} grid shrink-0 place-items-center rounded-xl border border-line bg-surface2 text-muted`} aria-hidden>
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/media/${mediaId}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`${box} shrink-0 rounded-xl border border-line object-cover`}
    />
  );
}

/* ------------------------------------------------------------- order card */

export function OrderCard({ order, currency = 'AED' }: { order: OrderView; currency?: string }) {
  const late = order.isOverdue;
  return (
    <Link
      href={`/orders/${order.id}`}
      className={`card block p-3 transition hover:border-gold/50 ${late ? 'border-st-overdue/60' : ''}`}
    >
      {late || order.urgency === 'due_today' || order.urgency === 'due_tomorrow' ? (
        <div className="mb-2">
          <UrgencyBadge order={order} />
        </div>
      ) : null}

      <div className="flex gap-3">
        <CoverThumb mediaId={order.coverMediaId} alt={order.productName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-bold text-ink">{order.customerName}</p>
            <span className="num shrink-0 text-[11px] font-semibold text-muted">{order.orderNumber}</span>
          </div>
          <p className="truncate text-[13px] text-muted">
            {order.productName} · {order.karat}
          </p>

          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px]">
            <div className="flex gap-1">
              <dt className="text-muted">Expected</dt>
              <dd className="num font-semibold text-ink">{formatWeight(order.expectedWeightMg)} g</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted">Actual</dt>
              <dd className="num font-semibold text-ink">
                {order.actualWeightMg === null ? '—' : `${formatWeight(order.actualWeightMg)} g`}
              </dd>
            </div>
          </dl>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} />
            {order.status === 'maker' && order.makerName ? (
              <span className="text-[11px] text-muted">{order.makerName}</span>
            ) : null}
            {order.status === 'traveler' && order.travelerName ? (
              <span className="text-[11px] text-muted">
                {order.travelerName} → {order.destination ?? '—'}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-line/70 pt-2 text-[12px]">
        <span className="text-muted">
          Delivery <span className="num font-semibold text-ink">{dubaiShort(order.expectedDeliveryDate)}</span>
        </span>
        <span className={order.remainingBalanceFils > 0 ? 'font-bold text-bad' : 'font-semibold text-ok'}>
          {order.remainingBalanceFils > 0 ? `Balance ${currency} ${formatMoney(order.remainingBalanceFils)}` : 'Paid in full'}
        </span>
      </div>
    </Link>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="card p-3">
      <div className="flex gap-3">
        <div className="skeleton h-16 w-16" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-3 w-1/2" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stats */

export function StatCard({
  label,
  value,
  tone = 'default',
  href,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'bad' | 'ok' | 'warn' | 'info' | 'gold';
  href?: string;
  hint?: string;
}) {
  const toneClass =
    tone === 'bad'
      ? 'text-bad'
      : tone === 'ok'
        ? 'text-ok'
        : tone === 'warn'
          ? 'text-warn'
          : tone === 'info'
            ? 'text-info'
            : tone === 'gold'
              ? 'text-gold'
              : 'text-ink';
  const body = (
    <>
      <p className="label">{label}</p>
      <p className={`num mt-1 text-[22px] font-extrabold leading-none ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="card card-pad block transition hover:border-gold/50">
      {body}
    </Link>
  ) : (
    <div className="card card-pad">{body}</div>
  );
}
