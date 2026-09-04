import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Storage driver. The database is the source of truth — the browser only keeps
 * an offline cache. Two drivers are supported:
 *   - local file SQLite (default, `DATABASE_URL=file:./data/sadeq.db`)
 *   - libSQL / Turso over HTTPS (`DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN`)
 */
export interface Driver {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

const url = process.env.DATABASE_URL || 'file:./data/sadeq.db';

function makeSqliteDriver(): Driver {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3');
  const file = url.replace(/^file:/, '');
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    async run(sql, params = []) {
      db.prepare(sql).run(params as never[]);
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(params as never[]) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return (db.prepare(sql).get(params as never[]) as T) ?? null;
    },
    async exec(sql) {
      db.exec(sql);
    },
    async tx<T>(fn: () => Promise<T>) {
      db.exec('BEGIN');
      try {
        const r = await fn();
        db.exec('COMMIT');
        return r;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
        throw e;
      }
    },
  };
}

function makeLibsqlDriver(): Driver {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@libsql/client');
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return {
    async run(sql, params = []) {
      await client.execute({ sql, args: params as never[] });
    },
    async all<T>(sql: string, params: unknown[] = []) {
      const r = await client.execute({ sql, args: params as never[] });
      return r.rows as unknown as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const r = await client.execute({ sql, args: params as never[] });
      return (r.rows[0] as unknown as T) ?? null;
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    async tx<T>(fn: () => Promise<T>) {
      // libSQL HTTP has no ambient transaction across statements here; the writes
      // we perform are individually atomic and idempotent by id.
      return fn();
    },
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  displayName TEXT,
  passwordHash TEXT NOT NULL,
  pinHash TEXT,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  ownerId TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS daily_reconciliations (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  date TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'draft',
  employeeName TEXT,
  systemCashFils INTEGER,
  physicalMode TEXT NOT NULL DEFAULT 'total',
  physicalCashFils INTEGER NOT NULL DEFAULT 0,
  denominations TEXT NOT NULL DEFAULT '{}',
  notes TEXT,
  differenceReasons TEXT NOT NULL DEFAULT '[]',
  reasonText TEXT,
  snapshot TEXT,
  engineVersion TEXT,
  startedAt TEXT,
  finalizedAt TEXT,
  finalizedBy TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_day_owner_date_shift
  ON daily_reconciliations(ownerId, date, shift);

CREATE TABLE IF NOT EXISTS cash_entries (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  dayId TEXT NOT NULL,
  kind TEXT NOT NULL,
  amountFils INTEGER NOT NULL,
  personName TEXT,
  description TEXT,
  refNo TEXT,
  entryDate TEXT NOT NULL,
  dueDate TEXT,
  note TEXT,
  attachmentId TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_cash_day ON cash_entries(ownerId, dayId);

CREATE TABLE IF NOT EXISTS cash_adjustments (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  dayId TEXT NOT NULL,
  name TEXT NOT NULL,
  amountFils INTEGER NOT NULL,
  direction TEXT NOT NULL,
  note TEXT,
  entryDate TEXT NOT NULL,
  attachmentId TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_adj_day ON cash_adjustments(ownerId, dayId);

CREATE TABLE IF NOT EXISTS gold_reconciliations (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  dayId TEXT NOT NULL,
  karat TEXT NOT NULL,
  systemMg INTEGER NOT NULL DEFAULT 0,
  drawerMg INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gold_day_karat ON gold_reconciliations(ownerId, dayId, karat);

CREATE TABLE IF NOT EXISTS gold_movements (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  karat TEXT NOT NULL,
  direction TEXT NOT NULL,
  holderType TEXT NOT NULL,
  holderName TEXT NOT NULL,
  weightMg INTEGER NOT NULL,
  returnedMg INTEGER NOT NULL DEFAULT 0,
  deliveryDate TEXT NOT NULL,
  expectedReturnDate TEXT,
  returnedAt TEXT,
  reason TEXT,
  refNo TEXT,
  note TEXT,
  attachmentId TEXT,
  status TEXT NOT NULL DEFAULT 'outstanding',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_move_owner ON gold_movements(ownerId, karat, status);

CREATE TABLE IF NOT EXISTS gold_holdings (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  movementId TEXT NOT NULL,
  dayId TEXT,
  karat TEXT NOT NULL,
  weightMg INTEGER NOT NULL,
  kind TEXT NOT NULL,
  eventDate TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS third_party_gold (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  movementId TEXT NOT NULL,
  ownerName TEXT NOT NULL,
  karat TEXT NOT NULL,
  weightMg INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'person',
  phone TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'office',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  entity TEXT NOT NULL,
  entityId TEXT NOT NULL,
  action TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  actor TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_owner ON audit_logs(ownerId, createdAt);

CREATE TABLE IF NOT EXISTS sync_receipts (
  clientOpId TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  result TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`;

let driver: Driver | null = null;
let ready: Promise<Driver> | null = null;

/** Additive migrations for databases created by an earlier version. */
const MIGRATIONS = [
  `ALTER TABLE gold_holdings ADD COLUMN eventDate TEXT NOT NULL DEFAULT ''`,
  `CREATE INDEX IF NOT EXISTS ix_holdings_move ON gold_holdings(ownerId, movementId, eventDate)`,
];

async function init(): Promise<Driver> {
  const d = url.startsWith('file:') || url.startsWith('/') ? makeSqliteDriver() : makeLibsqlDriver();
  await d.exec(SCHEMA);
  for (const m of MIGRATIONS) {
    try {
      await d.exec(m);
    } catch {
      // already applied
    }
  }
  driver = d;
  return d;
}

export function getDb(): Promise<Driver> {
  if (driver) return Promise.resolve(driver);
  if (!ready) ready = init();
  return ready;
}
