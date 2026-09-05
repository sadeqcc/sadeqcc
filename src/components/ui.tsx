'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useApp } from './providers';

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
  required,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label mb-1.5">
        {label}
        {required ? <span className="text-gold"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] font-semibold text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** Decimal keypad, no spinners, right-aligned — tuned for entering weights at the counter. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  ariaLabel,
  onBlur,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onBlur?: () => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        className={`input num text-end ${suffix ? 'pe-12' : ''}`}
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
      {suffix ? (
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-muted">{suffix}</span>
      ) : null}
    </div>
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
  inputMode,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'numeric';
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      inputMode={inputMode}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      className="input min-h-[80px]"
      rows={rows}
      value={value}
      aria-label={ariaLabel}
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
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  disabled?: boolean;
  placeholder?: string;
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
        {placeholder ? <option value="">{placeholder}</option> : null}
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

export function DateInput({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <input
      className="input num"
      type="date"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
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
          type="button"
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

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition ${checked ? 'border-gold bg-gold/80' : 'border-line bg-surface2'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'start-6' : 'start-0.5'}`} />
    </button>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t } = useApp();
  const label = t('search');
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        className="input ps-10 pe-10"
        type="search"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder ?? label}
        aria-label={placeholder ?? label}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-ink"
          onClick={() => onChange('')}
          aria-label={t('clear_all')}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
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
  const { t } = useApp();
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
        className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 shadow-pop sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id={titleId} className="text-[16px] font-bold text-ink">
            {title}
          </h3>
          <button type="button" className="rounded-lg p-2 text-muted hover:text-ink" onClick={onClose} aria-label={t('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {footer ? <div className="mt-4 flex gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

/** A bottom sheet of choices — used for status moves and quick actions. */
export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actions: { key: string; label: string; icon?: React.ReactNode; hint?: string; danger?: boolean; onSelect: () => void }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => {
              onClose();
              a.onSelect();
            }}
            className={`flex w-full items-center gap-3 rounded-xl border border-line px-3 py-3 text-start transition hover:border-gold/60 ${
              a.danger ? 'text-bad' : 'text-ink'
            }`}
          >
            {a.icon ? <span className="shrink-0">{a.icon}</span> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{a.label}</span>
              {a.hint ? <span className="block text-[12px] text-muted">{a.hint}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function Skeleton({ className = 'h-16' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({
  title,
  text,
  icon,
  action,
}: {
  title: string;
  text?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line px-4 py-8 text-center">
      {icon ? <span className="text-2xl">{icon}</span> : null}
      <p className="text-[14px] font-bold text-ink">{title}</p>
      {text ? <p className="max-w-xs text-[13px] text-muted">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-bad/40 bg-bad/5 px-4 py-6 text-center">
      <p className="text-[13px] font-semibold text-bad">{text}</p>
      {onRetry ? (
        <button type="button" className="btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
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

/** Guards anything that reads the clock or localStorage during render. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Pull-to-refresh for the list screens; a no-op on desktop. */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const { t } = useApp();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);

  return (
    <div
      onTouchStart={(e) => {
        if (window.scrollY <= 0 && !busy) startY.current = e.touches[0].clientY;
      }}
      onTouchMove={(e) => {
        if (startY.current === null) return;
        const d = e.touches[0].clientY - startY.current;
        if (d > 0) setPull(Math.min(d, 90));
      }}
      onTouchEnd={async () => {
        if (pull > 60) {
          setBusy(true);
          try {
            await onRefresh();
          } finally {
            setBusy(false);
          }
        }
        startY.current = null;
        setPull(0);
      }}
    >
      {pull > 0 || busy ? (
        <div className="flex items-center justify-center gap-2 py-2 text-[12px] text-muted" style={{ height: busy ? 32 : Math.min(pull, 60) }}>
          {busy ? <Spinner /> : null}
          {busy ? t('refreshing') : pull > 60 ? t('release_to_refresh') : t('pull_to_refresh')}
        </div>
      ) : null}
      {children}
    </div>
  );
}
