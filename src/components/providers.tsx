'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Undo2, XCircle } from 'lucide-react';
import { DEFAULT_SETTINGS, type AppSettings, type Permission, type SettingsPatch } from '@/lib/types';
import { apiGet, apiWrite, flushOutbox, onOutboxChange, outbox } from '@/lib/client';
import { formatMoney, formatWeight } from '@/lib/num';
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

export interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  hasPin: boolean;
  permissions: Permission[];
}

interface AppCtx {
  settings: AppSettings;
  setSettings: (patch: SettingsPatch) => Promise<void>;
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;
  needsSetup: boolean;
  authReady: boolean;
  can: (p: Permission) => boolean;
  online: boolean;
  pending: number;
  /** Formats using the shop's currency and weight precision. */
  money: (fils: number) => string;
  grams: (mg: number) => string;
  toast: (text: string, kind?: Toast['kind'], undo?: () => void) => void;
  confirm: (o: ConfirmOptions) => Promise<{ ok: boolean; pin?: string; reason?: string }>;
  refreshAuth: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp must be used inside AppProvider');
  return c;
}

const LOCAL_SETTINGS = 'go.settings.v1';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: { ok: boolean; pin?: string; reason?: string }) => void }) | null
  >(null);
  const [pinValue, setPinValue] = useState('');
  const [reasonValue, setReasonValue] = useState('');

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
      const me = await apiGet<{ user: SessionUser | null; needsSetup: boolean }>('/api/auth/me');
      setUser(me.user);
      setNeedsSetup(me.needsSetup);
      if (me.user) {
        const s = await apiGet<{ settings: AppSettings }>('/api/settings');
        setSettingsState(s.settings);
        try {
          localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(s.settings));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* offline: keep the cached settings and last known user */
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  /* ---------------------------------------------------- theme */
  useEffect(() => {
    const apply = () => {
      const wantLight =
        settings.theme === 'light' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
      document.documentElement.classList.toggle('light', wantLight);
      document.documentElement.classList.toggle('dark', !wantLight);
    };
    apply();
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  /* ------------------------------------------------ offline sync */
  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'ok', undo?: () => void) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list.slice(-2), { id, kind, text, undo }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), undo ? 5200 : 2800);
  }, []);

  const syncNow = useCallback(async () => {
    const r = await flushOutbox();
    setPending(outbox.size());
    if (r.sent > 0) pushToast(`${r.sent} queued ${r.sent === 1 ? 'change' : 'changes'} synced`, 'ok');
    if (r.failed > 0) pushToast(`${r.failed} queued ${r.failed === 1 ? 'change' : 'changes'} were rejected`, 'error');
  }, [pushToast]);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      await syncNow();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsub = onOutboxChange(() => setPending(outbox.size()));
    if (navigator.onLine && outbox.size() > 0) void syncNow();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsub();
    };
  }, [syncNow]);

  /* --------------------------------------------------------- api */
  const setSettings = useCallback(async (patch: SettingsPatch) => {
    setSettingsState((s) => {
      const next: AppSettings = { ...s, ...patch, notifications: { ...s.notifications, ...(patch.notifications ?? {}) } };
      try {
        localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    await apiWrite('/api/settings', patch, 'PATCH', { label: 'Settings' });
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    setPinValue('');
    setReasonValue('');
    return new Promise<{ ok: boolean; pin?: string; reason?: string }>((resolve) => {
      setConfirmState({ ...o, resolve });
    });
  }, []);

  const permissions = useRef<Permission[]>([]);
  permissions.current = user?.permissions ?? [];

  const value = useMemo<AppCtx>(
    () => ({
      settings,
      setSettings,
      user,
      setUser,
      needsSetup,
      authReady,
      can: (p) => permissions.current.includes(p),
      online,
      pending,
      money: (fils: number) => `${settings.currency} ${formatMoney(fils)}`,
      grams: (mg: number) => `${formatWeight(mg)} g`,
      toast: pushToast,
      confirm,
      refreshAuth,
      syncNow,
    }),
    [settings, setSettings, user, needsSetup, authReady, online, pending, pushToast, confirm, refreshAuth, syncNow],
  );

  const canConfirm =
    (!confirmState?.requirePin || pinValue.length >= 4) && (!confirmState?.requireReason || reasonValue.trim().length >= 3);

  return (
    <Ctx.Provider value={value}>
      {children}

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
                type="button"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold text-gold"
                onClick={() => {
                  x.undo?.();
                  setToasts((list) => list.filter((y) => y.id !== x.id));
                }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Confirmation always runs through this dialog, never window.confirm. */}
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
              type="button"
              className="btn-ghost flex-1"
              onClick={() => {
                confirmState?.resolve({ ok: false });
                setConfirmState(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={confirmState?.danger ? 'btn-danger flex-1' : 'btn-primary flex-1'}
              disabled={!canConfirm}
              onClick={() => {
                confirmState?.resolve({ ok: true, pin: pinValue, reason: reasonValue });
                setConfirmState(null);
              }}
            >
              {confirmState?.confirmLabel ?? 'Confirm'}
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
            <span className="label mb-1.5">Enter your PIN</span>
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
            <span className="label mb-1.5">Reason (saved to the audit log)</span>
            <textarea className="input min-h-[80px]" value={reasonValue} onChange={(e) => setReasonValue(e.target.value)} />
          </label>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}
