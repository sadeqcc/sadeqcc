/**
 * Decimal-safe numeric helpers.
 * Cash is stored as an integer number of fils (1 AED = 100 fils).
 * Gold is stored as an integer number of milligrams (1 g = 1000 mg).
 * No float arithmetic is ever used for stored values or totals.
 */

export const CASH_SCALE = 2; // AED -> fils
export const GOLD_SCALE = 3; // gram -> milligram

function scaleFactor(scale: number): number {
  let f = 1;
  for (let i = 0; i < scale; i++) f *= 10;
  return f;
}

/** Parse a user-typed decimal string into a scaled integer, without float rounding drift. */
export function parseScaled(input: string | number | null | undefined, scale: number): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === '') return null;
  // Arabic-Indic digits + arabic decimal separator + thousands separators
  s = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[٬,\s_]/g, '');
  if (!/^[+-]?\d*(\.\d*)?$/.test(s)) return null;
  const neg = s.startsWith('-');
  if (s[0] === '+' || s[0] === '-') s = s.slice(1);
  if (s === '' || s === '.') return null;
  const [rawInt = '', rawFrac = ''] = s.split('.');
  const intPart = rawInt === '' ? '0' : rawInt;
  const frac = (rawFrac + '0'.repeat(scale)).slice(0, scale);
  const extra = rawFrac.slice(scale);
  let value = BigInt(intPart) * BigInt(scaleFactor(scale)) + BigInt(frac === '' ? '0' : frac);
  // half-up rounding on any digits beyond the supported precision
  if (extra.length > 0 && Number(extra[0]) >= 5) value += 1n;
  const out = Number(neg ? -value : value);
  if (!Number.isSafeInteger(out)) return null;
  return out;
}

export const parseCash = (v: string | number | null | undefined) => parseScaled(v, CASH_SCALE);
export const parseGold = (v: string | number | null | undefined) => parseScaled(v, GOLD_SCALE);

/** Format a scaled integer back to a fixed-decimal string. Never uses float division. */
export function formatScaled(value: number, scale: number, opts: { grouping?: boolean } = {}): string {
  const grouping = opts.grouping ?? true;
  const neg = value < 0;
  const abs = BigInt(Math.abs(Math.trunc(value)));
  const f = BigInt(scaleFactor(scale));
  const intPart = (abs / f).toString();
  const fracPart = (abs % f).toString().padStart(scale, '0');
  const grouped = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  const body = scale > 0 ? `${grouped}.${fracPart}` : grouped;
  return neg ? `-${body}` : body;
}

export const formatCash = (fils: number, grouping = true) => formatScaled(fils, CASH_SCALE, { grouping });
export const formatGold = (mg: number, grouping = true) => formatScaled(mg, GOLD_SCALE, { grouping });

/** "AED 14,400.00" */
export const aed = (fils: number) => `AED ${formatCash(fils)}`;
/** "125.430 g" */
export const grams = (mg: number) => `${formatGold(mg)} g`;

/** Signed presentation, e.g. "+AED 20.00" / "-0.350 g". */
export function signedCash(fils: number): string {
  if (fils === 0) return `AED ${formatCash(0)}`;
  return `${fils > 0 ? '+' : '-'}AED ${formatCash(Math.abs(fils))}`;
}
export function signedGold(mg: number): string {
  if (mg === 0) return `${formatGold(0)} g`;
  return `${mg > 0 ? '+' : '-'}${formatGold(Math.abs(mg))} g`;
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Round a milligram value to the display precision the user picked (0.001 / 0.010 / 0.100 g). */
export function quantizeGold(mg: number, step: 1 | 10 | 100): number {
  if (step === 1) return mg;
  const neg = mg < 0;
  const abs = Math.abs(mg);
  const r = Math.round(abs / step) * step;
  return neg ? -r : r;
}
