'use client';

import React from 'react';
import { aed, formatCash } from '@/lib/num';
import { AED_COINS, AED_DENOMS } from '@/lib/types';
import { useApp } from './providers';

/** AED note & coin counter. The total is derived, never typed. */
export function DenominationCounter({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  disabled?: boolean;
}) {
  const { t } = useApp();

  const setQty = (face: number, qty: number) => {
    const next = { ...value };
    if (qty > 0) next[String(face)] = qty;
    else delete next[String(face)];
    onChange(next);
  };

  const total = Object.entries(value).reduce((a, [face, qty]) => a + Number(face) * Number(qty || 0), 0);

  const row = (face: number, isCoin = false) => {
    const qty = Number(value[String(face)] ?? 0);
    return (
      <li key={face} className="flex items-center gap-2 border-b border-line/60 py-2 last:border-0">
        <span className="num w-20 shrink-0 text-[14px] font-bold text-gold">
          {isCoin && face < 100 ? `${face} f` : formatCash(face, true).replace('.00', '')}
        </span>
        <div className="flex flex-1 items-center justify-end gap-2">
          <button
            className="btn-ghost h-9 min-h-0 w-9 px-0 text-[18px]"
            disabled={disabled || qty <= 0}
            onClick={() => setQty(face, Math.max(0, qty - 1))}
            aria-label={`-1 ${face}`}
          >
            −
          </button>
          <input
            className="input num h-10 w-16 py-0 text-center"
            inputMode="numeric"
            dir="ltr"
            disabled={disabled}
            value={qty === 0 ? '' : String(qty)}
            placeholder="0"
            aria-label={`${t('quantity')} ${face}`}
            onChange={(e) => setQty(face, Math.max(0, Math.min(1_000_000, Number(e.target.value.replace(/\D/g, '')) || 0)))}
          />
          <button
            className="btn-ghost h-9 min-h-0 w-9 px-0 text-[18px]"
            disabled={disabled}
            onClick={() => setQty(face, qty + 1)}
            aria-label={`+1 ${face}`}
          >
            +
          </button>
          <span className="num w-24 shrink-0 text-end text-[13px] font-semibold text-ink">
            {formatCash(face * qty)}
          </span>
        </div>
      </li>
    );
  };

  return (
    <div>
      <ul className="mb-2">{AED_DENOMS.map((d) => row(d))}</ul>
      <p className="label mb-1">{t('coins')}</p>
      <ul className="mb-3">{AED_COINS.map((d) => row(d, true))}</ul>
      <div className="flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5">
        <span className="text-[13px] font-semibold text-gold">{t('counted_total')}</span>
        <span className="num text-[18px] font-extrabold text-gold">{aed(total)}</span>
      </div>
    </div>
  );
}

export function denomTotal(value: Record<string, number>): number {
  return Object.entries(value).reduce((a, [face, qty]) => a + Number(face) * Number(qty || 0), 0);
}
