'use client';

export class ApiError extends Error {
  code: string;
  status: number;
  issues?: string[];
  fields?: Record<string, string>;
  extra?: Record<string, unknown>;
  constructor(code: string, status: number, opts: { issues?: string[]; fields?: Record<string, string>; extra?: Record<string, unknown> } = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.issues = opts.issues;
    this.fields = opts.fields;
    this.extra = opts.extra;
  }
}

export interface OutboxOp {
  id: string;
  path: string;
  method: string;
  body: unknown;
  label: string;
  createdAt: string;
}

const OUTBOX_KEY = 'go.outbox.v1';
const CACHE_PREFIX = 'go.cache.';
const DRAFT_PREFIX = 'go.draft.';

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

function writeLs(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // storage full or blocked — the server stays the source of truth
  }
}

/* ---------------------------------------------------------------- outbox */

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
    writeLs(OUTBOX_KEY, outbox.all().filter((o) => o.id !== id));
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

/* ----------------------------------------------------------------- cache */

/** Offline snapshot of a screen's payload, so reopening shows the last state. */
export const cache = {
  get<T>(key: string): T | null {
    return readLs<T | null>(CACHE_PREFIX + key, null);
  },
  set(key: string, value: unknown) {
    writeLs(CACHE_PREFIX + key, value);
  },
};

/* ---------------------------------------------------------------- drafts */

export interface Draft<T> {
  data: T;
  savedAt: string;
}

/** Auto-saved form state, so closing the app mid-order loses nothing. */
export const drafts = {
  get<T>(key: string): Draft<T> | null {
    return readLs<Draft<T> | null>(DRAFT_PREFIX + key, null);
  },
  set<T>(key: string, data: T): boolean {
    return writeLs(DRAFT_PREFIX + key, { data, savedAt: new Date().toISOString() });
  },
  clear(key: string) {
    try {
      localStorage.removeItem(DRAFT_PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------- api */

async function raw<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | ({ ok: false; error: string; issues?: string[]; fields?: Record<string, string> } & Record<string, unknown>)
    | null;
  if (!res.ok || !json || json.ok === false) {
    const err = json && json.ok === false ? json : null;
    throw new ApiError(err?.error ?? 'http_error', res.status, {
      issues: err?.issues,
      fields: err?.fields,
      extra: err ?? undefined,
    });
  }
  return json.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return raw<T>(path);
}

/**
 * Writes go straight to the database. If the network is down the operation is
 * queued under its client-generated id, so a replay can never duplicate a row.
 */
export async function apiWrite<T>(
  path: string,
  body: unknown,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
  opts: { queue?: boolean; label?: string } = {},
): Promise<T | null> {
  const queue = opts.queue ?? true;
  try {
    return await raw<T>(path, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) });
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    const networkish = e instanceof ApiError ? e.status >= 500 : true;
    if (queue && (offline || networkish)) {
      outbox.push({ id: uuid(), path, method, body, label: opts.label ?? path, createdAt: new Date().toISOString() });
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
      // A rejected payload must not block the queue forever.
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

/* ----------------------------------------------------------------- files */

export function download(filename: string, content: string | Blob, mime = 'application/json'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8;` });
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
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

/**
 * Shrinks a photo before it is stored, so a thousand orders with pictures stay
 * usable. Videos and other files pass through untouched.
 */
export async function compressImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<{ data: string; thumb: string | null; mime: string; size: number }> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;
  if (!file.type.startsWith('image/')) {
    const data = await fileToDataUrl(file);
    return { data, thumb: null, mime: file.type, size: file.size };
  }
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    const data = await fileToDataUrl(file);
    return { data, thumb: null, mime: file.type, size: file.size };
  }
  const draw = (edge: number, q: number): string => {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', q);
  };
  const data = draw(maxEdge, quality) || (await fileToDataUrl(file));
  const thumb = draw(280, 0.7) || null;
  bitmap.close?.();
  return { data, thumb, mime: 'image/jpeg', size: Math.round((data.length * 3) / 4) };
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });
}

/** wa.me link — the message is prefilled, never sent automatically. */
export function whatsappLink(phone: string, message?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}
