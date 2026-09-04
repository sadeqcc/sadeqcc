'use client';

export class ApiError extends Error {
  code: string;
  status: number;
  issues?: string[];
  constructor(code: string, status: number, issues?: string[]) {
    super(code);
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export interface OutboxOp {
  id: string;
  path: string;
  method: string;
  body: unknown;
  createdAt: string;
}

const OUTBOX_KEY = 'sadeq.outbox.v1';
const CACHE_PREFIX = 'sadeq.cache.';

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLs(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the server stays the source of truth */
  }
}

export const outbox = {
  all: (): OutboxOp[] => readLs<OutboxOp[]>(OUTBOX_KEY, []),
  push(op: OutboxOp) {
    const list = outbox.all();
    if (list.some((o) => o.id === op.id)) return;
    list.push(op);
    writeLs(OUTBOX_KEY, list);
    notify();
  },
  remove(id: string) {
    writeLs(
      OUTBOX_KEY,
      outbox.all().filter((o) => o.id !== id),
    );
    notify();
  },
  size: () => outbox.all().length,
};

type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  listeners.forEach((l) => l());
}
export function onOutboxChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Offline snapshot of a screen's payload, so a reopen shows the last known state. */
export const cache = {
  get<T>(key: string): T | null {
    return readLs<T | null>(CACHE_PREFIX + key, null);
  },
  set(key: string, value: unknown) {
    writeLs(CACHE_PREFIX + key, value);
  },
};

async function raw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: string; issues?: string[] }
    | null;
  if (!res.ok || !json || json.ok === false) {
    throw new ApiError(json && 'error' in json ? json.error : 'http_error', res.status, json && 'issues' in json ? json.issues : undefined);
  }
  return json.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return raw<T>(path);
}

/**
 * Writes go straight to the database. If the network is down the operation is
 * queued with its client-generated id, so replaying it can never duplicate a row.
 */
export async function apiWrite<T>(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
  opts: { queue?: boolean } = {},
): Promise<T | null> {
  const queue = opts.queue ?? true;
  try {
    return await raw<T>(path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const networkish = e instanceof ApiError ? e.status >= 500 : true;
    if (queue && (offline || networkish)) {
      outbox.push({ id: uuid(), path, method, body, createdAt: new Date().toISOString() });
      return null;
    }
    throw e;
  }
}

export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (const op of outbox.all()) {
    try {
      await raw(op.path, { method: op.method, body: op.method === 'DELETE' ? undefined : JSON.stringify(op.body) });
      outbox.remove(op.id);
      sent += 1;
    } catch (e) {
      // A rejected payload (validation, locked day) must not block the queue forever.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
        outbox.remove(op.id);
        failed += 1;
      } else {
        break;
      }
    }
  }
  return { sent, failed };
}

export function download(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  // BOM keeps Arabic readable when the file is opened in Excel.
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}
