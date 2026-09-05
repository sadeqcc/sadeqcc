import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './db';
import { nowIso, dubaiDate } from './date';
import { DEFAULT_SETTINGS, type AppSettings, type Role, type SettingsPatch } from './types';

export const newId = () => crypto.randomUUID();

export interface Ctx {
  ownerId: string;
  userId: string;
  actor: string;
  role: Role;
}

export function safeJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const n = (v: unknown): number => Number(v ?? 0) || 0;
export const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v) || 0);

/* ------------------------------------------------------------------ audit */

export async function audit(
  ctx: Ctx,
  entity: string,
  entityId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  reason?: string | null,
): Promise<void> {
  const db = await getDb();
  const t = nowIso();
  await db.run(
    `INSERT INTO audit_logs (id, ownerId, entity, entityId, action, oldValue, newValue, actor, reason, status, createdAt, updatedAt, createdBy)
     VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?)`,
    [
      newId(),
      ctx.ownerId,
      entity,
      entityId,
      action,
      oldValue === undefined || oldValue === null ? null : JSON.stringify(scrub(oldValue)),
      newValue === undefined || newValue === null ? null : JSON.stringify(scrub(newValue)),
      ctx.actor,
      reason ?? null,
      t,
      t,
      ctx.userId,
    ],
  );
}

/** Media blobs would bloat every audit row, so only their id is kept. */
function scrub(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = { ...(v as Record<string, unknown>) };
  if ('data' in o) o.data = '[blob]';
  if ('thumb' in o) o.thumb = '[blob]';
  if ('passwordHash' in o) o.passwordHash = '[redacted]';
  if ('pinHash' in o) o.pinHash = '[redacted]';
  return o;
}

export async function listAudit(ownerId: string, opts: { limit?: number; entityId?: string; entity?: string } = {}) {
  const db = await getDb();
  const limit = Math.min(opts.limit ?? 200, 1000);
  if (opts.entityId) {
    return db.all(
      'SELECT * FROM audit_logs WHERE ownerId = ? AND entityId = ? ORDER BY createdAt DESC LIMIT ?',
      [ownerId, opts.entityId, limit],
    );
  }
  if (opts.entity) {
    return db.all('SELECT * FROM audit_logs WHERE ownerId = ? AND entity = ? ORDER BY createdAt DESC LIMIT ?', [
      ownerId,
      opts.entity,
      limit,
    ]);
  }
  return db.all('SELECT * FROM audit_logs WHERE ownerId = ? ORDER BY createdAt DESC LIMIT ?', [ownerId, limit]);
}

/* --------------------------------------------------------------- settings */

export async function getSettings(ownerId: string): Promise<AppSettings> {
  const db = await getDb();
  const row = await db.get<{ data: string }>('SELECT data FROM app_settings WHERE ownerId = ?', [ownerId]);
  if (!row) return { ...DEFAULT_SETTINGS };
  const stored = safeJson<Partial<AppSettings>>(row.data, {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(stored.notifications ?? {}) },
  };
}

export async function saveSettings(ctx: Ctx, patch: SettingsPatch): Promise<AppSettings> {
  const db = await getDb();
  const current = await getSettings(ctx.ownerId);
  const next: AppSettings = {
    ...current,
    ...patch,
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
  };
  const t = nowIso();
  const exists = await db.get('SELECT ownerId FROM app_settings WHERE ownerId = ?', [ctx.ownerId]);
  if (exists) {
    await db.run('UPDATE app_settings SET data = ?, updatedAt = ? WHERE ownerId = ?', [JSON.stringify(next), t, ctx.ownerId]);
  } else {
    await db.run(
      'INSERT INTO app_settings (ownerId, data, createdAt, updatedAt, createdBy, status) VALUES (?,?,?,?,?,?)',
      [ctx.ownerId, JSON.stringify(next), t, t, ctx.userId, 'active'],
    );
  }
  await audit(ctx, 'app_settings', ctx.ownerId, 'update', current, next);
  return next;
}

/* --------------------------------------------------------- order numbers */

/**
 * GO-2026-0001. The counter row is per owner per year, so two tills creating an
 * order at the same second cannot collide.
 */
export async function nextOrderNumber(ctx: Ctx, settings: AppSettings, onDate = dubaiDate()): Promise<string> {
  const db = await getDb();
  const year = onDate.slice(0, 4);
  await db.run('INSERT OR IGNORE INTO order_counters (ownerId, year, lastSeq) VALUES (?,?,0)', [ctx.ownerId, year]);
  for (let attempt = 0; attempt < 25; attempt++) {
    const row = await db.get<{ lastSeq: number }>(
      'SELECT lastSeq FROM order_counters WHERE ownerId = ? AND year = ?',
      [ctx.ownerId, year],
    );
    const next = n(row?.lastSeq) + 1 + attempt;
    await db.run('UPDATE order_counters SET lastSeq = ? WHERE ownerId = ? AND year = ?', [next, ctx.ownerId, year]);
    const candidate = `${settings.orderNumberPrefix || 'GO'}-${year}-${String(next).padStart(
      Math.max(settings.orderNumberPadding || 4, 1),
      '0',
    )}`;
    const clash = await db.get('SELECT id FROM orders WHERE ownerId = ? AND orderNumber = ?', [ctx.ownerId, candidate]);
    if (!clash) return candidate;
  }
  return `${settings.orderNumberPrefix || 'GO'}-${year}-${Date.now().toString().slice(-6)}`;
}

/* ------------------------------------------------------------- generic io */

export const ENTITY_TABLES = {
  customers: 'customers',
  makers: 'makers',
  travelers: 'travelers',
  traveler_shipments: 'traveler_shipments',
  tags: 'tags',
  payments: 'payments',
  gold_exchanges: 'gold_exchanges',
  order_notes: 'order_notes',
  order_media: 'order_media',
  customer_ledger: 'customer_ledger',
  follow_ups: 'follow_ups',
  orders: 'orders',
} as const;
export type EntityName = keyof typeof ENTITY_TABLES;

export const isEntity = (s: string): s is EntityName => Object.prototype.hasOwnProperty.call(ENTITY_TABLES, s);

/** Directory entities an employee may create from a picker. */
export const DIRECTORY_ENTITIES = ['customers', 'makers', 'travelers', 'tags'] as const;

export async function getRecord(ownerId: string, entity: EntityName, id: string) {
  const db = await getDb();
  return db.get<Record<string, unknown>>(`SELECT * FROM ${ENTITY_TABLES[entity]} WHERE id = ? AND ownerId = ?`, [id, ownerId]);
}

export async function insertRecord(ctx: Ctx, entity: EntityName, data: Record<string, unknown>) {
  const db = await getDb();
  const t = nowIso();
  const id = (data.id as string) || newId();
  // Ids are client-generated, so replaying a queued offline write cannot duplicate a row.
  const existing = await getRecord(ctx.ownerId, entity, id);
  if (existing) return existing;
  const row = { ...data, id, ownerId: ctx.ownerId, createdAt: t, updatedAt: t, createdBy: ctx.userId };
  const keys = Object.keys(row);
  await db.run(
    `INSERT INTO ${ENTITY_TABLES[entity]} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => (row as Record<string, unknown>)[k] ?? null),
  );
  await audit(ctx, entity, id, 'create', null, row);
  return getRecord(ctx.ownerId, entity, id);
}

export async function updateRecord(
  ctx: Ctx,
  entity: EntityName,
  id: string,
  patch: Record<string, unknown>,
  reason?: string | null,
) {
  const db = await getDb();
  const before = await getRecord(ctx.ownerId, entity, id);
  if (!before) return null;
  const t = nowIso();
  const keys = Object.keys(patch);
  if (keys.length) {
    await db.run(
      `UPDATE ${ENTITY_TABLES[entity]} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updatedAt = ? WHERE id = ? AND ownerId = ?`,
      [...keys.map((k) => patch[k] ?? null), t, id, ctx.ownerId],
    );
  }
  const after = await getRecord(ctx.ownerId, entity, id);
  await audit(ctx, entity, id, 'update', before, after, reason);
  return after;
}

/** Archive, never drop. Nothing in this app is removed from the database. */
export async function archiveRecord(ctx: Ctx, entity: EntityName, id: string, reason?: string | null) {
  const db = await getDb();
  const before = await getRecord(ctx.ownerId, entity, id);
  if (!before) return null;
  const t = nowIso();
  await db.run(
    `UPDATE ${ENTITY_TABLES[entity]} SET deletedAt = ?, status = 'archived', updatedAt = ? WHERE id = ? AND ownerId = ?`,
    [t, t, id, ctx.ownerId],
  );
  await audit(ctx, entity, id, 'archive', before, null, reason);
  return before;
}

export async function restoreRecord(ctx: Ctx, entity: EntityName, id: string, reason?: string | null) {
  const db = await getDb();
  const before = await getRecord(ctx.ownerId, entity, id);
  if (!before) return null;
  const t = nowIso();
  await db.run(
    `UPDATE ${ENTITY_TABLES[entity]} SET deletedAt = NULL, status = 'active', updatedAt = ? WHERE id = ? AND ownerId = ?`,
    [t, id, ctx.ownerId],
  );
  const after = await getRecord(ctx.ownerId, entity, id);
  await audit(ctx, entity, id, 'restore', before, after, reason);
  return after;
}

export async function listActive<T = Record<string, unknown>>(
  ownerId: string,
  entity: EntityName,
  opts: { orderBy?: string; includeArchived?: boolean; limit?: number } = {},
): Promise<T[]> {
  const db = await getDb();
  const where = opts.includeArchived ? '' : 'AND deletedAt IS NULL';
  const order = opts.orderBy ?? 'createdAt DESC';
  const limit = opts.limit ? `LIMIT ${Math.min(opts.limit, 5000)}` : '';
  return db.all<T>(`SELECT * FROM ${ENTITY_TABLES[entity]} WHERE ownerId = ? ${where} ORDER BY ${order} ${limit}`, [ownerId]);
}
