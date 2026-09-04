export const TZ = 'Asia/Dubai';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Business date in Asia/Dubai, always YYYY-MM-DD. */
export function dubaiDate(d: Date = new Date()): string {
  return dateFmt.format(d);
}

export function dubaiTime(d: Date = new Date()): string {
  return timeFmt.format(d);
}

export function dubaiStamp(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return `${dateFmt.format(d)} ${timeFmt.format(d).slice(0, 5)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${month}-${String(last).padStart(2, '0')}` };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Weekday index (0 = Sunday) for a YYYY-MM-DD business date. */
export function weekdayIndex(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function daysInMonth(month: string): string[] {
  const { end } = monthRange(month);
  const last = Number(end.slice(8));
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function diffDays(a: string, b: string): number {
  const t1 = new Date(`${a}T12:00:00Z`).getTime();
  const t2 = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((t1 - t2) / 86400000);
}
