'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { X, ChevronDown, Loader2 } from 'lucide-react';

export function Card({
  children,
  className = '',
  as: As = 'section',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <As className={`card card-pad ${className}`}>{children}</As>;
}

export function CardTitle({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-gold">{icon}</span> : null}
        <div>
          <h2 className="text-[15px] font-bold leading-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] font-semibold text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** Numeric field tuned for phones: decimal keypad, no spinners, RTL-safe. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  ariaLabel,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onBlur?: () => void;
}) {
  return (
    <input
      className="input num text-end"
      inputMode="decimal"
      dir="ltr"
      autoComplete="off"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder ?? '0'}
      autoFocus={autoFocus}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,٫٬٠-٩-]/g, ''))}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className="input appearance-none pe-9"
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-xl border border-line bg-surface2 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
            value === o.value ? 'bg-gold text-black shadow-card' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
        checked ? 'border-gold bg-gold/80' : 'border-line bg-surface2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          checked ? 'start-6' : 'start-0.5'
        }`}
      />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 shadow-pop sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-[16px] font-bold text-ink">
            {title}
          </h3>
          <button className="rounded-lg p-2 text-muted hover:text-ink" onClick={onClose} aria-label="close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {footer ? <div className="mt-4 flex gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className = 'h-16' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ text, icon }: { text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line py-6 text-center">
      {icon ? <span className="text-muted">{icon}</span> : null}
      <p className="text-[13px] text-muted">{text}</p>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} />;
}

export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (...args: A) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saved.current(...args), delay);
  };
}

export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
