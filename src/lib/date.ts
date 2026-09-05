export const TZ = 'Asia/Dubai';

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const clockFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' });
const longFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });

/** Business date in Asia/Dubai, always YYYY-MM-DD. */
export function dubaiDate(d: Date = new Date()): string {
  return dateFmt.format(d);
}

export function dubaiTime(d: Date = new Date()): string {
  return timeFmt.format(d);
}

/** "05:30 AM" */
export function dubaiClock(d: Date = new Date()): string {
  return clockFmt.format(d);
}

/** "Saturday" */
export function dubaiWeekday(d: Date | string = new Date()): string {
  return weekdayFmt.format(toDate(d));
}

/** "05 September 2026" */
export function dubaiLong(d: Date | string = new Date()): string {
  return longFmt.format(toDate(d));
}

/** "05 Sep 2026" */
export function dubaiShort(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const dt = toDate(d);
  return Number.isNaN(dt.getTime()) ? '—' : shortFmt.format(dt);
}

/** "05 Sep 2026 14:32" */
export function dubaiStamp(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${shortFmt.format(d)} ${timeFmt.format(d).slice(0, 5)}`;
}

/** "05 Sep 10:32 AM" — the timeline format. */
export function dubaiTimelineStamp(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = toDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${shortFmt.format(d).slice(0, 6)} ${clockFmt.format(d)}`;
}

function toDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Greeting based on the Dubai hour, not the device clock. */
export function dubaiGreeting(d: Date = new Date()): string {
  const h = Number(hourFmt.format(d));
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** a − b, in whole days. Both are YYYY-MM-DD business dates. */
export function diffDays(a: string, b: string): number {
  const t1 = new Date(`${a}T12:00:00Z`).getTime();
  const t2 = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((t1 - t2) / 86400000);
}

export const monthKey = (date: string): string => date.slice(0, 7);

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 0 = Sunday. */
export function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function daysInMonth(month: string): string[] {
  const last = Number(monthRange(month).end.slice(8));
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** Named ranges used by the reports screen, resolved against the Dubai date. */
export function presetRange(preset: string, today = dubaiDate()): { start: string; end: string } {
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'week': {
      const back = weekdayIndex(today); // week starts Sunday, as the shop does
      return { start: addDays(today, -back), end: addDays(today, 6 - back) };
    }
    case 'month':
      return monthRange(monthKey(today));
    case 'year':
      return { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` };
    default:
      return { start: addDays(today, -30), end: today };
  }
}

/** "5 Days Remaining" / "Due Today" / "3 Days Late" — always from the Dubai date. */
export function countdownLabel(expected: string | null, today = dubaiDate()): string {
  if (!expected) return 'No delivery date';
  const d = diffDays(expected, today);
  if (d === 0) return 'Due Today';
  if (d === 1) return 'Due Tomorrow';
  if (d > 1) return `${d} Days Remaining`;
  if (d === -1) return '1 Day Late';
  return `${Math.abs(d)} Days Late`;
}
