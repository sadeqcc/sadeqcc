'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Undo2, XCircle } from 'lucide-react';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/types';
import { dict, t as translate, type DictKey, type Lang } from '@/i18n/dict';
import { apiGet, apiWrite, flushOutbox, onOutboxChange, outbox } from '@/lib/client';
import { Modal } from './ui';

interface Toast {
  id: string;
  kind: 'ok' | 'error' | 'info';
  text: string;
  undo?: () => void;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  requirePin?: boolean;
  requireReason?: boolean;
}

interface AppCtx {
  settings: AppSettings;
  setSettings: (patch: Partial<AppSettings>) => Promise<void>;
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  user: { id: string; username: string; displayName: string | null; hasPin: boolean } | null;
  setUser: (u: AppCtx['user']) => void;
  online: boolean;
  pending: number;
  toast: (text: string, kind?: Toast['kind'], undo?: () => void) => void;
  confirm: (o: ConfirmOptions) => Promise<{ ok: boolean; pin?: string; reason?: string }>;
  refreshAuth: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}

const LOCAL_SETTINGS = 'sadeq.settings.v1';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState<AppCtx['user']>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: { ok: boolean; pin?: string; reason?: string }) => void }) | null
  >(null);
  const [pinValue, setPinValue] = useState('');
  const [reasonValue, setReasonValue] = useState('');

  const lang = settings.language;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  /* ---------------------------------------------------------- boot */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_SETTINGS);
      if (raw) setSettingsState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<AppSettings>) }));
    } catch {
      /* ignore */
    }
    setOnline(navigator.onLine);
    setPending(outbox.size());
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const me = await apiGet<{ user: AppCtx['user'] }>('/api/auth/me');
      setUser(me.user);
      if (me.user) {
        const s = await apiGet<{ settings: AppSettings }>('/api/settings');
        setSettingsState(s.settings);
        localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(s.settings));
      }
    } catch {
      /* offline: keep the cached settings */
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  /* -------------------------------------------------- theme + dir */
  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = dir;
    html.classList.toggle('light', settings.theme === 'light');
    html.classList.toggle('dark', settings.theme !== 'light');
    html.dataset.palette = settings.palette;
  }, [lang, dir, settings.theme, settings.palette]);

  /* ------------------------------------------------ offline sync */
  useEffect(() => {
    const sync = async () => {
      setOnline(true);
      const r = await flushOutbox();
      setPending(outbox.size());
      if (r.sent > 0) pushToast(translate(lang, 'online_synced'), 'ok');
    };
    const off = () => setOnline(false);
    window.addEventListener('online', sync);
    window.addEventListener('offline', off);
    const unsub = onOutboxChange(() => setPending(outbox.size()));
    if (navigator.onLine && outbox.size() > 0) void sync();
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', off);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  /* --------------------------------------------------------- api */
  const setSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    await apiWrite('/api/settings', patch);
  }, []);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'ok', undo?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { id, kind, text, undo }]);
    timers.current[id] = setTimeout(() => {
      setToasts((list) => list.filter((x) => x.id !== id));
    }, undo ? 5000 : 2600);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setPinValue('');
    setReasonValue('');
    return new Promise<{ ok: boolean; pin?: string; reason?: string }>((resolve) => {
      setConfirmState({ ...o, resolve });
    });
  }, []);

  const value = useMemo<AppCtx>(
    () => ({
      settings,
      setSettings,
      lang,
      dir,
      t: (key, vars) => translate(lang, key, vars),
      user,
      setUser,
      online,
      pending,
      toast: pushToast,
      confirm,
      refreshAuth,
    }),
    [settings, setSettings, lang, dir, user, online, pending, pushToast, confirm, refreshAuth],
  );

  const tt = (k: DictKey) => translate(lang, k);
  const canConfirm =
    (!confirmState?.requirePin || pinValue.length >= 3) && (!confirmState?.requireReason || reasonValue.trim().length >= 3);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* toasts */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 no-print">
        {toasts.map((x) => (
          <div
            key={x.id}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2.5 shadow-pop"
            role="status"
          >
            {x.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
            ) : x.kind === 'error' ? (
              <XCircle className="h-4 w-4 shrink-0 text-bad" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-info" />
            )}
            <span className="flex-1 text-[13px] text-ink">{x.text}</span>
            {x.undo ? (
              <button
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-gold"
                onClick={() => {
                  x.undo?.();
                  setToasts((list) => list.filter((y) => y.id !== x.id));
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {tt('undo')}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* confirmation dialog (never window.confirm) */}
      <Modal
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        onClose={() => {
          confirmState?.resolve({ ok: false });
          setConfirmState(null);
        }}
        footer={
          <>
            <button
              className="btn-ghost flex-1"
              onClick={() => {
                confirmState?.resolve({ ok: false });
                setConfirmState(null);
              }}
            >
              {tt('cancel')}
            </button>
            <button
              className={confirmState?.danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
              disabled={!canConfirm}
              onClick={() => {
                confirmState?.resolve({ ok: true, pin: pinValue, reason: reasonValue });
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmLabel ?? tt('confirm')}
            </button>
          </>
        }
      >
        {confirmState?.body ? (
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>{confirmState.body}</span>
          </p>
        ) : null}
        {confirmState?.requirePin ? (
          <label className="block">
            <span className="label mb-1.5">{tt('enter_pin')}</span>
            <input
              className="input num"
              inputMode="numeric"
              type="password"
              autoFocus
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value)}
            />
          </label>
        ) : null}
        {confirmState?.requireReason ? (
          <label className="block">
            <span className="label mb-1.5">{tt('edit_reason')}</span>
            <textarea className="input min-h-[80px]" value={reasonValue} onChange={(e) => setReasonValue(e.target.value)} />
          </label>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}

export const langKeys = Object.keys(dict) as Lang[];
