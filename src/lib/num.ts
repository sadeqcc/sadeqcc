/**
 * Decimal-safe numeric helpers.
 * Money is an integer number of fils (1 AED = 100 fils) — 2 decimals.
 * Gold weight is an integer number of milligrams (1 g = 1000 mg) — 3 decimals.
 * Float arithmetic is never used for a stored value or a total.
 */

export const MONEY_SCALE = 2;
export const WEIGHT_SCALE = 3;

/** Basis points: 5% VAT is 500bp. Keeps percentages off floats. */
export const BP_SCALE = 10_000;

const OUNCE_MG = 31_103; // troy ounce = 31.1034768 g, rounded to mg

function factor(scale: number): number {
  let f = 1;
  for (let i = 0; i < scale; i++) f *= 10;
  return f;
}

/** Parse a user-typed decimal into a scaled integer, with half-up rounding and no float drift. */
export function parseScaled(input: string | number | null | undefined, scale: number): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === '') return null;
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
  let value = BigInt(intPart) * BigInt(factor(scale)) + BigInt(frac === '' ? '0' : frac);
  if (extra.length > 0 && Number(extra[0]) >= 5) value += 1n;
  const out = Number(neg ? -value : value);
  return Number.isSafeInteger(out) ? out : null;
}

export const parseMoney = (v: string | number | null | undefined) => parseScaled(v, MONEY_SCALE);
export const parseWeight = (v: string | number | null | undefined) => parseScaled(v, WEIGHT_SCALE);

/** Format a scaled integer back to a fixed-decimal string. Never divides floats. */
export function formatScaled(value: number, scale: number, opts: { grouping?: boolean } = {}): string {
  const grouping = opts.grouping ?? true;
  const n = Math.trunc(Number(value) || 0);
  const neg = n < 0;
  const abs = BigInt(Math.abs(n));
  const f = BigInt(factor(scale));
  const intPart = (abs / f).toString();
  const fracPart = (abs % f).toString().padStart(scale, '0');
  const grouped = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  const body = scale > 0 ? `${grouped}.${fracPart}` : grouped;
  return neg ? `-${body}` : body;
}

export const formatMoney = (fils: number, grouping = true) => formatScaled(fils, MONEY_SCALE, { grouping });
export const formatWeight = (mg: number, grouping = true) => formatScaled(mg, WEIGHT_SCALE, { grouping });

/** "AED 23,500.00" */
export const money = (fils: number, currency = 'AED') => `${currency} ${formatMoney(fils)}`;
/** "45.000 g" */
export const grams = (mg: number) => `${formatWeight(mg)} g`;

export function signedMoney(fils: number, currency = 'AED'): string {
  if (fils === 0) return `${currency} ${formatMoney(0)}`;
  return `${fils > 0 ? '+' : '-'}${currency} ${formatMoney(Math.abs(fils))}`;
}

export function signedWeight(mg: number): string {
  if (mg === 0) return `${formatWeight(0)} g`;
  return `${mg > 0 ? '+' : '-'}${formatWeight(Math.abs(mg))} g`;
}

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + (Number(b) || 0), 0);

/** Integer half-up multiply-then-divide, so no intermediate float ever exists. */
export function mulDiv(value: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const v = BigInt(Math.trunc(value)) * BigInt(Math.trunc(numerator));
  const d = BigInt(Math.trunc(denominator));
  const neg = v < 0n !== d < 0n;
  const av = v < 0n ? -v : v;
  const ad = d < 0n ? -d : d;
  const q = av / ad;
  const r = av % ad;
  const rounded = r * 2n >= ad ? q + 1n : q;
  return Number(neg ? -rounded : rounded);
}

/** Value in fils of `weightMg` grams of gold at `rateFilsPerGram`. */
export const goldValueFils = (weightMg: number, rateFilsPerGram: number): number =>
  mulDiv(rateFilsPerGram, weightMg, 1000);

/** A price quoted per troy ounce, expressed per gram. */
export const ouncePriceToPerGram = (filsPerOunce: number): number => mulDiv(filsPerOunce, 1000, OUNCE_MG);
export const perGramToOuncePrice = (filsPerGram: number): number => mulDiv(filsPerGram, OUNCE_MG, 1000);

/** `percent` is a plain number like 5 or 2.5; returns basis points. */
export const percentToBp = (percent: number): number => Math.round(percent * 100);
export const bpToPercent = (bp: number): number => bp / 100;
export const applyBp = (base: number, bp: number): number => mulDiv(base, bp, BP_SCALE);

/** Round milligrams to the precision the shop displays (3 / 2 / 1 decimals). */
export function quantizeWeight(mg: number, precision: 1 | 2 | 3): number {
  const step = precision === 3 ? 1 : precision === 2 ? 10 : 100;
  if (step === 1) return mg;
  const neg = mg < 0;
  const abs = Math.abs(mg);
  const r = Math.round(abs / step) * step;
  return neg ? -r : r;
}

/** Digits only, so tel:/wa.me links never carry spaces or dashes. */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}
