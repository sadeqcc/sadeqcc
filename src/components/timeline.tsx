'use client';

import { dubaiTimelineStamp } from '@/lib/date';
import { formatMoney, formatWeight } from '@/lib/num';
import { STATUS_ICON, STATUS_LABEL, type OrderStatus, type StatusEvent } from '@/lib/types';

/** Reads the status-specific detail bag back into one human line. */
function detailLine(e: StatusEvent, currency: string): string | null {
  const d = e.detail ?? {};
  const parts: string[] = [];
  const s = (k: string) => (d[k] === null || d[k] === undefined || d[k] === '' ? null : String(d[k]));

  if (e.toStatus === 'maker') {
    if (d.returnedToMaker) parts.push('Returned to maker');
    if (s('expectedReadyDate')) parts.push(`Ready by ${s('expectedReadyDate')}`);
  }
  if (e.toStatus === 'ready') {
    if (typeof d.actualWeightMg === 'number') parts.push(`Actual weight ${formatWeight(d.actualWeightMg)} g`);
    if (s('qualityCheck')) parts.push(`Quality: ${s('qualityCheck')}`);
  }
  if (e.toStatus === 'traveler') {
    if (s('destination')) parts.push(`Dubai → ${s('destination')}`);
    if (s('departureDate')) parts.push(`Departs ${s('departureDate')}`);
    if (s('flightNumber')) parts.push(String(d.flightNumber));
  }
  if (e.toStatus === 'arrived') {
    if (s('destination')) parts.push(String(d.destination));
    if (s('arrivalTime')) parts.push(String(d.arrivalTime));
  }
  if (e.toStatus === 'delivered') {
    if (s('receivedBy')) parts.push(`Received by ${s('receivedBy')}`);
    if (s('deliveryMethod')) parts.push(String(d.deliveryMethod));
    if (typeof d.remainingBalanceFils === 'number' && d.remainingBalanceFils > 0) {
      parts.push(`Balance ${currency} ${formatMoney(d.remainingBalanceFils)}`);
    }
  }
  if (e.toStatus === 'cancelled' && s('reason')) parts.push(String(d.reason));
  if (e.toStatus === 'ordered' && s('orderNumber')) parts.push(String(d.orderNumber));

  return parts.length ? parts.join(' · ') : null;
}

export function Timeline({ events, currency = 'AED' }: { events: StatusEvent[]; currency?: string }) {
  if (!events.length) {
    return <p className="text-[13px] text-muted">No history yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {events.map((e) => {
        const status = e.toStatus as OrderStatus;
        const detail = detailLine(e, currency);
        return (
          <li key={e.id} className="timeline-item relative ps-9">
            <span
              className="absolute inset-inline-start-0 start-0 top-0.5 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface2 text-[12px]"
              aria-hidden
            >
              {STATUS_ICON[status] ?? '•'}
            </span>
            <p className="num text-[11px] text-muted">{dubaiTimelineStamp(e.occurredAt)}</p>
            <p className="text-[14px] font-bold text-ink">{STATUS_LABEL[status] ?? e.toStatus}</p>
            {detail ? <p className="text-[12px] text-muted">{detail}</p> : null}
            {e.note ? <p className="mt-0.5 text-[12px] italic text-muted">“{e.note}”</p> : null}
            <p className="text-[11px] text-muted">by {e.actor}</p>
          </li>
        );
      })}
    </ol>
  );
}
