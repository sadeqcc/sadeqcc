'use client';

import { dubaiTimelineStamp } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import { STATUS_ICON, STATUS_KEY, type OrderStatus, type StatusEvent } from '@/lib/types';
import { useApp } from './providers';

/** Reads the status-specific detail bag back into one human line. */
interface DetailLabels {
  returned: string; ready: string; actual: string; quality: string;
  departure: string; received: string; balance: string;
}

function detailLine(e: StatusEvent, currency: string, labels: DetailLabels): string | null {
  const d = e.detail ?? {};
  const parts: string[] = [];
  const s = (k: string) => (d[k] === null || d[k] === undefined || d[k] === '' ? null : String(d[k]));

  if (e.toStatus === 'maker') {
    if (d.returnedToMaker) parts.push(labels.returned);
    if (s('expectedReadyDate')) parts.push(`${labels.ready}: ${s('expectedReadyDate')}`);
  }
  if (e.toStatus === 'ready') {
    if (typeof d.actualWeightMg === 'number') parts.push(`${labels.actual}: ${formatWeight(d.actualWeightMg)} g`);
    if (s('qualityCheck')) parts.push(`${labels.quality}: ${s('qualityCheck')}`);
  }
  if (e.toStatus === 'traveler') {
    if (s('destination')) parts.push(`Dubai → ${s('destination')}`);
    if (s('departureDate')) parts.push(`${labels.departure}: ${s('departureDate')}`);
    if (s('flightNumber')) parts.push(String(d.flightNumber));
  }
  if (e.toStatus === 'arrived') {
    if (s('destination')) parts.push(String(d.destination));
    if (s('arrivalTime')) parts.push(String(d.arrivalTime));
  }
  if (e.toStatus === 'delivered') {
    if (s('receivedBy')) parts.push(`${labels.received}: ${s('receivedBy')}`);
    if (s('deliveryMethod')) parts.push(String(d.deliveryMethod));
    if (typeof d.remainingBalanceFils === 'number' && d.remainingBalanceFils > 0) {
      parts.push(`${labels.balance} ${currency} ${formatMoney(d.remainingBalanceFils)}`);
    }
  }
  if (e.toStatus === 'cancelled' && s('reason')) parts.push(String(d.reason));
  if (e.toStatus === 'ordered' && s('orderNumber')) parts.push(String(d.orderNumber));

  return parts.length ? parts.join(' · ') : null;
}

export function Timeline({ events, currency = 'AED' }: { events: StatusEvent[]; currency?: string }) {
  const { t } = useApp();
  const labels: DetailLabels = {
    returned: t('return_to_maker'),
    ready: t('expected_ready'),
    actual: t('actual_weight'),
    quality: t('quality_check'),
    departure: t('departure'),
    received: t('received_by'),
    balance: t('balance'),
  };
  if (!events.length) {
    return <p className="text-[13px] text-muted">{t('no_timeline')}</p>;
  }
  return (
    <ol className="space-y-4">
      {events.map((e) => {
        const status = e.toStatus as OrderStatus;
        const detail = detailLine(e, currency, labels);
        return (
          <li key={e.id} className="timeline-item relative ps-9">
            <span
              className="absolute start-0 top-0.5 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface2 text-[12px]"
              aria-hidden
            >
              {STATUS_ICON[status] ?? '•'}
            </span>
            <p className="num text-[11px] text-muted">{dubaiTimelineStamp(e.occurredAt)}</p>
            <p className="text-[14px] font-bold text-ink">{STATUS_KEY[status] ? t(STATUS_KEY[status]) : e.toStatus}</p>
            {detail ? <p className="text-[12px] text-muted">{detail}</p> : null}
            {e.note ? <p className="mt-0.5 text-[12px] italic text-muted">“{e.note}”</p> : null}
            <p className="text-[11px] text-muted">{t('by_actor', { actor: e.actor })}</p>
          </li>
        );
      })}
    </ol>
  );
}
