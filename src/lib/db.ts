import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Storage driver. The database is the source of truth — the browser only keeps
 * an offline cache. Two drivers are supported:
 *   - local file SQLite (default, `DATABASE_URL=file:./data/gold-orders.db`)
 *   - libSQL / Turso over HTTPS (`DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN`)
 */
export interface Driver {
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}

const url = process.env.DATABASE_URL || 'file:./data/gold-orders.db';

function makeSqliteDriver(): Driver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Database = require('better-sqlite3');
  } catch {
    throw new Error(
      'DATABASE_URL points at a local SQLite file but better-sqlite3 is not installed. ' +
        'Install it, or set DATABASE_URL to a libsql:// URL for a hosted database.',
    );
  }
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
      // libSQL over HTTP has no ambient transaction here; every write we perform
      // is individually atomic and idempotent by its client-generated id.
      return fn();
    },
  };
}

/**
 * Every table carries id / ownerId / createdAt / updatedAt / createdBy / status,
 * plus a nullable deletedAt — records are archived, never dropped.
 */
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

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  country TEXT,
  city TEXT,
  customerType TEXT,
  customerRef TEXT,
  instagram TEXT,
  email TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_customers_owner ON customers(ownerId, name);

/*
 * Money that is not attached to any single order: a debt carried over from
 * before the app, a payment made against the account as a whole, or a written
 * off amount. Order balances live on the orders themselves; these entries sit
 * beside them and the two together are the customer's statement.
 */
CREATE TABLE IF NOT EXISTS customer_ledger (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  customerId TEXT NOT NULL,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'charge',
  amountFils INTEGER NOT NULL,
  entryDate TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  mediaId TEXT,
  createdByName TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_ledger_customer ON customer_ledger(ownerId, customerId, entryDate);

CREATE TABLE IF NOT EXISTS makers (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  whatsapp TEXT,
  location TEXT,
  specialty TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_makers_owner ON makers(ownerId, name);

CREATE TABLE IF NOT EXISTS travelers (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  frequentRoute TEXT,
  idReference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_travelers_owner ON travelers(ownerId, name);

CREATE TABLE IF NOT EXISTS traveler_shipments (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  travelerId TEXT NOT NULL,
  destination TEXT NOT NULL,
  departureDate TEXT,
  expectedArrival TEXT,
  arrivedAt TEXT,
  flightNumber TEXT,
  airline TEXT,
  packageRef TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_ship_owner ON traveler_shipments(ownerId, travelerId);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderNumber TEXT NOT NULL,
  referenceNo TEXT,
  customerId TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  productName TEXT NOT NULL,
  style TEXT,
  karat TEXT NOT NULL DEFAULT '21K',

  expectedWeightMg INTEGER NOT NULL DEFAULT 0,
  minimumWeightMg INTEGER,
  maximumWeightMg INTEGER,
  actualWeightMg INTEGER,

  goldRateFilsPerGram INTEGER NOT NULL DEFAULT 0,
  goldRateMode TEXT NOT NULL DEFAULT 'per_gram',
  goldValueOverrideFils INTEGER,
  makingChargeMode TEXT NOT NULL DEFAULT 'per_gram',
  makingChargeFils INTEGER NOT NULL DEFAULT 0,
  otherChargesFils INTEGER NOT NULL DEFAULT 0,
  discountFils INTEGER NOT NULL DEFAULT 0,
  vatBp INTEGER NOT NULL DEFAULT 0,
  totalAmountFils INTEGER NOT NULL DEFAULT 0,
  totalPaidFils INTEGER NOT NULL DEFAULT 0,
  remainingBalanceFils INTEGER NOT NULL DEFAULT 0,

  makerId TEXT,
  makerReference TEXT,
  makerCostFils INTEGER NOT NULL DEFAULT 0,
  makerNotes TEXT,
  sentToMakerDate TEXT,

  travelerId TEXT,
  travelerShipmentId TEXT,
  destination TEXT,

  orderDate TEXT NOT NULL,
  expectedReadyDate TEXT,
  readyDate TEXT,
  expectedDeliveryDate TEXT,
  arrivalDate TEXT,
  deliveredDate TEXT,

  qualityCheck TEXT,
  receivedBy TEXT,
  deliveryMethod TEXT,
  cancelReason TEXT,
  cancelNote TEXT,

  status TEXT NOT NULL DEFAULT 'ordered',
  coverMediaId TEXT,
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',

  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  createdByName TEXT,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_number ON orders(ownerId, orderNumber);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(ownerId, status, expectedDeliveryDate);
CREATE INDEX IF NOT EXISTS ix_orders_customer ON orders(ownerId, customerId);
CREATE INDEX IF NOT EXISTS ix_orders_maker ON orders(ownerId, makerId);
CREATE INDEX IF NOT EXISTS ix_orders_traveler ON orders(ownerId, travelerId);
CREATE INDEX IF NOT EXISTS ix_orders_dates ON orders(ownerId, expectedDeliveryDate);

CREATE TABLE IF NOT EXISTS order_status_history (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT NOT NULL,
  fromStatus TEXT,
  toStatus TEXT NOT NULL,
  note TEXT,
  mediaId TEXT,
  detail TEXT,
  actor TEXT NOT NULL,
  occurredAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_history_order ON order_status_history(ownerId, orderId, occurredAt);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT NOT NULL,
  amountFils INTEGER NOT NULL,
  paidOn TEXT NOT NULL,
  paidAt TEXT,
  method TEXT NOT NULL DEFAULT 'Cash',
  reference TEXT,
  note TEXT,
  mediaId TEXT,
  createdByName TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_pay_order ON payments(ownerId, orderId);
CREATE INDEX IF NOT EXISTS ix_pay_date ON payments(ownerId, paidOn);

CREATE TABLE IF NOT EXISTS gold_exchanges (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT NOT NULL,
  karat TEXT NOT NULL,
  weightMg INTEGER NOT NULL,
  rateFilsPerGram INTEGER NOT NULL DEFAULT 0,
  valueFils INTEGER NOT NULL DEFAULT 0,
  mediaId TEXT,
  notes TEXT,
  receivedOn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_exch_order ON gold_exchanges(ownerId, orderId);

CREATE TABLE IF NOT EXISTS order_notes (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  createdByName TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_note_order ON order_notes(ownerId, orderId);

CREATE TABLE IF NOT EXISTS order_media (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'photo',
  category TEXT NOT NULL DEFAULT 'Other',
  data TEXT NOT NULL,
  thumb TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS ix_media_order ON order_media(ownerId, orderId);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  orderId TEXT,
  dueDate TEXT NOT NULL,
  code TEXT NOT NULL,
  text TEXT NOT NULL,
  doneAt TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_follow ON follow_ups(ownerId, dueDate, code, orderId);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_tags ON tags(ownerId, name);

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
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_logs(ownerId, entityId, createdAt);

CREATE TABLE IF NOT EXISTS order_counters (
  ownerId TEXT NOT NULL,
  year TEXT NOT NULL,
  lastSeq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ownerId, year)
);
`;

/** Additive migrations for databases created by an earlier version. */
const MIGRATIONS: string[] = [];

let driver: Driver | null = null;
let ready: Promise<Driver> | null = null;

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
