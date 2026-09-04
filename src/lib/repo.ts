import 'server-only';
import crypto from 'node:crypto';
import { getDb } from './db';
import { nowIso, dubaiDate } from './date';
import { DEFAULT_SETTINGS, type AppSettings } from './types';

export const newId = () => crypto.randomUUID();

export interface Ctx {
  ownerId: string;
  userId: string;
  actor: string;
}

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
      oldValue === undefined || oldValue === null ? null : JSON.stringify(oldValue),
      newValue === undefined || newValue === null ? null : JSON.stringify(newValue),
      ctx.actor,
      reason ?? null,
      t,
      t,
      ctx.userId,
    ],
  );
}

export async function listAudit(ownerId: string, limit = 200, entityId?: string) {
  const db = await getDb();
  if (entityId) {
    return db.all(
      'SELECT * FROM audit_logs WHERE ownerId = ? AND entityId = ? ORDER BY createdAt DESC LIMIT ?',
      [ownerId, entityId, limit],
    );
  }
  return db.all('SELECT * FROM audit_logs WHERE ownerId = ? ORDER BY createdAt DESC LIMIT ?', [ownerId, limit]);
}

/* --------------------------------------------------------------- settings */

export async function getSettings(ownerId: string): Promise<AppSettings> {
  const db = await getDb();
  const row = await db.get<{ data: string }>('SELECT data FROM app_settings WHERE ownerId = ?', [ownerId]);
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.data) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(ctx: Ctx, patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = await getDb();
  const current = await getSettings(ctx.ownerId);
  const next: AppSettings = { ...current, ...patch };
  const t = nowIso();
  const exists = await db.get('SELECT ownerId FROM app_settings WHERE ownerId = ?', [ctx.ownerId]);
  if (exists) {
    await db.run('UPDATE app_settings SET data = ?, updatedAt = ? WHERE ownerId = ?', [
      JSON.stringify(next),
      t,
      ctx.ownerId,
    ]);
  } else {
    await db.run(
      'INSERT INTO app_settings (ownerId, data, createdAt, updatedAt, createdBy, status) VALUES (?,?,?,?,?,?)',
      [ctx.ownerId, JSON.stringify(next), t, t, ctx.userId, 'active'],
    );
  }
  await audit(ctx, 'app_settings', ctx.ownerId, 'update', current, next);
  return next;
}

/* -------------------------------------------------------------------- day */

export interface DayRow {
  id: string;
  ownerId: string;
  date: string;
  shift: string;
  status: string;
  employeeName: string | null;
  systemCashFils: number | null;
  physicalMode: string;
  physicalCashFils: number;
  denominations: string;
  notes: string | null;
  differenceReasons: string;
  reasonText: string | null;
  snapshot: string | null;
  engineVersion: string | null;
  startedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  deletedAt: string | null;
}

export function hydrateDay(r: DayRow) {
  return {
    ...r,
    systemCashFils: r.systemCashFils === null ? null : Number(r.systemCashFils),
    physicalCashFils: Number(r.physicalCashFils ?? 0),
    denominations: safeJson<Record<string, number>>(r.denominations, {}),
    differenceReasons: safeJson<string[]>(r.differenceReasons, []),
    snapshot: r.snapshot ? safeJson<unknown>(r.snapshot, null) : null,
  };
}

function safeJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export async function findDay(ownerId: string, date: string, shift = 'main'): Promise<DayRow | null> {
  const db = await getDb();
  return db.get<DayRow>(
    'SELECT * FROM daily_reconciliations WHERE ownerId = ? AND date = ? AND shift = ? AND deletedAt IS NULL',
    [ownerId, date, shift],
  );
}

export async function getOrCreateDay(ctx: Ctx, date: string, shift = 'main'): Promise<DayRow> {
  const existing = await findDay(ctx.ownerId, date, shift);
  if (existing) return existing;
  const db = await getDb();
  const t = nowIso();
  const id = newId();
  const settings = await getSettings(ctx.ownerId);
  try {
    await db.run(
      `INSERT INTO daily_reconciliations
        (id, ownerId, date, shift, status, employeeName, systemCashFils, physicalMode, physicalCashFils,
         denominations, notes, differenceReasons, reasonText, snapshot, engineVersion, startedAt,
         finalizedAt, finalizedBy, createdAt, updatedAt, createdBy)
       VALUES (?,?,?,?,'not_started',?,NULL,'total',0,'{}',NULL,'[]',NULL,NULL,NULL,?,NULL,NULL,?,?,?)`,
      [id, ctx.ownerId, date, shift, settings.employeeName || ctx.actor, t, t, t, ctx.userId],
    );
  } catch {
    // unique index hit: another request created it first
    const again = await findDay(ctx.ownerId, date, shift);
    if (again) return again;
    throw new Error('day_create_failed');
  }
  await audit(ctx, 'daily_reconciliations', id, 'create', null, { date, shift });
  return (await findDay(ctx.ownerId, date, shift))!;
}

export async function listDayData(ownerId: string, dayId: string) {
  const db = await getDb();
  const [entries, adjustments, goldRows] = await Promise.all([
    db.all(`SELECT * FROM cash_entries WHERE ownerId = ? AND dayId = ? AND deletedAt IS NULL ORDER BY createdAt ASC`, [ownerId, dayId]),
    db.all(`SELECT * FROM cash_adjustments WHERE ownerId = ? AND dayId = ? AND deletedAt IS NULL ORDER BY createdAt ASC`, [ownerId, dayId]),
    db.all(`SELECT * FROM gold_reconciliations WHERE ownerId = ? AND dayId = ? AND deletedAt IS NULL`, [ownerId, dayId]),
  ]);
  return { entries, adjustments, goldRows };
}

export interface ReturnEvent {
  movementId: string;
  weightMg: number;
  eventDate: string;
}

export async function listReturnEvents(ownerId: string): Promise<ReturnEvent[]> {
  const db = await getDb();
  const rows = await db.all<{ movementId: string; weightMg: number; eventDate: string }>(
    `SELECT movementId, weightMg, eventDate FROM gold_holdings
      WHERE ownerId = ? AND kind = 'return' AND deletedAt IS NULL`,
    [ownerId],
  );
  return rows.map((r) => ({ movementId: r.movementId, weightMg: Number(r.weightMg), eventDate: r.eventDate }));
}

/**
 * Movements as they stood on a business date: delivered by then, with only the
 * returns that had actually happened by then deducted. Past days never shift
 * because a return was recorded later.
 */
export function applyReturnsAsOf<T extends { id: string; weightMg: number; returnedMg: number }>(
  movements: T[],
  events: ReturnEvent[],
  date: string,
): T[] {
  return movements
    .map((m) => {
      const returned = events
        .filter((e) => e.movementId === m.id && e.eventDate <= date)
        .reduce((a, e) => a + e.weightMg, 0);
      const weightMg = Number(m.weightMg);
      const status = returned >= weightMg ? 'returned' : returned > 0 ? 'partially_returned' : 'outstanding';
      return { ...m, weightMg, returnedMg: returned, status };
    })
    .filter((m) => m.returnedMg < m.weightMg);
}

/** Movements that were still outstanding on (or before) the given business date. */
export async function listMovements(ownerId: string, opts: { onDate?: string; all?: boolean } = {}) {
  const db = await getDb();
  if (opts.all) {
    return db.all('SELECT * FROM gold_movements WHERE ownerId = ? AND deletedAt IS NULL ORDER BY deliveryDate DESC', [ownerId]);
  }
  const date = opts.onDate ?? dubaiDate();
  const rows = await db.all<{ id: string; weightMg: number; returnedMg: number }>(
    `SELECT * FROM gold_movements
      WHERE ownerId = ? AND deletedAt IS NULL AND deliveryDate <= ?
      ORDER BY deliveryDate DESC`,
    [ownerId, date],
  );
  return applyReturnsAsOf(rows, await listReturnEvents(ownerId), date);
}

export async function upsertGoldRow(
  ctx: Ctx,
  dayId: string,
  karat: string,
  patch: { systemMg?: number; drawerMg?: number },
) {
  const db = await getDb();
  const t = nowIso();
  const row = await db.get<{ id: string; systemMg: number; drawerMg: number }>(
    'SELECT * FROM gold_reconciliations WHERE ownerId = ? AND dayId = ? AND karat = ? AND deletedAt IS NULL',
    [ctx.ownerId, dayId, karat],
  );
  if (row) {
    const next = {
      systemMg: patch.systemMg ?? Number(row.systemMg),
      drawerMg: patch.drawerMg ?? Number(row.drawerMg),
    };
    await db.run('UPDATE gold_reconciliations SET systemMg = ?, drawerMg = ?, updatedAt = ? WHERE id = ?', [
      next.systemMg,
      next.drawerMg,
      t,
      row.id,
    ]);
    await audit(ctx, 'gold_reconciliations', row.id, 'update', { karat, systemMg: Number(row.systemMg), drawerMg: Number(row.drawerMg) }, { karat, ...next });
    return { ...row, ...next };
  }
  const id = newId();
  await db.run(
    `INSERT INTO gold_reconciliations (id, ownerId, dayId, karat, systemMg, drawerMg, status, createdAt, updatedAt, createdBy)
     VALUES (?,?,?,?,?,?,'active',?,?,?)`,
    [id, ctx.ownerId, dayId, karat, patch.systemMg ?? 0, patch.drawerMg ?? 0, t, t, ctx.userId],
  );
  await audit(ctx, 'gold_reconciliations', id, 'create', null, { karat, ...patch });
  return { id, karat, systemMg: patch.systemMg ?? 0, drawerMg: patch.drawerMg ?? 0 };
}

/* ------------------------------------------------------------- generic io */

export const ENTITY_TABLES = {
  cash_entries: 'cash_entries',
  cash_adjustments: 'cash_adjustments',
  gold_movements: 'gold_movements',
  people: 'people',
  locations: 'locations',
  gold_holdings: 'gold_holdings',
} as const;
export type EntityName = keyof typeof ENTITY_TABLES;

export async function getRecord(ownerId: string, entity: EntityName, id: string) {
  const db = await getDb();
  return db.get<Record<string, unknown>>(`SELECT * FROM ${ENTITY_TABLES[entity]} WHERE id = ? AND ownerId = ?`, [id, ownerId]);
}

export async function insertRecord(ctx: Ctx, entity: EntityName, data: Record<string, unknown>) {
  const db = await getDb();
  const t = nowIso();
  const id = (data.id as string) || newId();
  const row = { ...data, id, ownerId: ctx.ownerId, createdAt: t, updatedAt: t, createdBy: ctx.userId };
  const existing = await getRecord(ctx.ownerId, entity, id);
  if (existing) return existing; // replayed offline write: ids are client-generated
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

/** Soft delete only — records are never removed silently. */
export async function softDelete(ctx: Ctx, entity: EntityName, id: string, reason?: string | null) {
  const db = await getDb();
  const before = await getRecord(ctx.ownerId, entity, id);
  if (!before) return null;
  const t = nowIso();
  await db.run(`UPDATE ${ENTITY_TABLES[entity]} SET deletedAt = ?, status = 'deleted', updatedAt = ? WHERE id = ? AND ownerId = ?`, [t, t, id, ctx.ownerId]);
  await audit(ctx, entity, id, 'delete', before, null, reason);
  return before;
}

export async function restoreRecord(ctx: Ctx, entity: EntityName, id: string, reason?: string | null) {
  const db = await getDb();
  const before = await getRecord(ctx.ownerId, entity, id);
  if (!before) return null;
  const t = nowIso();
  await db.run(`UPDATE ${ENTITY_TABLES[entity]} SET deletedAt = NULL, status = 'active', updatedAt = ? WHERE id = ? AND ownerId = ?`, [t, id, ctx.ownerId]);
  const after = await getRecord(ctx.ownerId, entity, id);
  await audit(ctx, entity, id, 'restore', before, after, reason);
  return after;
}

/* ---------------------------------------------------------------- history */

export async function listDays(ownerId: string, start: string, end: string) {
  const db = await getDb();
  return db.all<DayRow>(
    'SELECT * FROM daily_reconciliations WHERE ownerId = ? AND date >= ? AND date <= ? AND deletedAt IS NULL ORDER BY date ASC',
    [ownerId, start, end],
  );
}

export async function listEntriesRange(ownerId: string, start: string, end: string) {
  const db = await getDb();
  return db.all(
    `SELECT e.* , d.date as businessDate FROM cash_entries e
      JOIN daily_reconciliations d ON d.id = e.dayId
     WHERE e.ownerId = ? AND d.date >= ? AND d.date <= ? AND e.deletedAt IS NULL
     ORDER BY d.date ASC`,
    [ownerId, start, end],
  );
}

export async function listGoldRange(ownerId: string, start: string, end: string) {
  const db = await getDb();
  return db.all(
    `SELECT g.*, d.date as businessDate FROM gold_reconciliations g
      JOIN daily_reconciliations d ON d.id = g.dayId
     WHERE g.ownerId = ? AND d.date >= ? AND d.date <= ? AND g.deletedAt IS NULL
     ORDER BY d.date ASC`,
    [ownerId, start, end],
  );
}

export async function listAdjustmentsRange(ownerId: string, start: string, end: string) {
  const db = await getDb();
  return db.all(
    `SELECT a.*, d.date as businessDate FROM cash_adjustments a
      JOIN daily_reconciliations d ON d.id = a.dayId
     WHERE a.ownerId = ? AND d.date >= ? AND d.date <= ? AND a.deletedAt IS NULL
     ORDER BY d.date ASC`,
    [ownerId, start, end],
  );
}
