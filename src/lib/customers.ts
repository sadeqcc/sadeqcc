import 'server-only';
import { getDb } from './db';
import { n } from './repo';
import { accountFrom } from './calc';
import { LEDGER_DIRECTION, type CustomerAccount, type LedgerEntry, type LedgerKind } from './types';

export { accountFrom };

type Row = Record<string, unknown>;

export function hydrateEntry(r: Row): LedgerEntry {
  return { ...(r as unknown as LedgerEntry), amountFils: n(r.amountFils) };
}

export async function listLedger(ownerId: string, customerId: string): Promise<LedgerEntry[]> {
  const db = await getDb();
  const rows = await db.all<Row>(
    'SELECT * FROM customer_ledger WHERE ownerId = ? AND customerId = ? AND deletedAt IS NULL ORDER BY entryDate DESC, createdAt DESC',
    [ownerId, customerId],
  );
  return rows.map(hydrateEntry);
}

export async function getAccount(ownerId: string, customerId: string): Promise<CustomerAccount> {
  const db = await getDb();
  const [orders, entries] = await Promise.all([
    db.all<Row>(
      'SELECT totalAmountFils, totalPaidFils, remainingBalanceFils, status FROM orders WHERE ownerId = ? AND customerId = ? AND deletedAt IS NULL',
      [ownerId, customerId],
    ),
    listLedger(ownerId, customerId),
  ]);
  return accountFrom(
    customerId,
    orders.map((o) => ({
      totalAmountFils: n(o.totalAmountFils),
      totalPaidFils: n(o.totalPaidFils),
      remainingBalanceFils: n(o.remainingBalanceFils),
      status: String(o.status),
    })),
    entries,
  );
}

/** Every customer's balance in one pass, for the list and the dashboard. */
export async function accountsByCustomer(ownerId: string): Promise<Map<string, CustomerAccount>> {
  const db = await getDb();
  const [orderRows, ledgerRows] = await Promise.all([
    db.all<Row>(
      'SELECT customerId, totalAmountFils, totalPaidFils, remainingBalanceFils, status FROM orders WHERE ownerId = ? AND deletedAt IS NULL',
      [ownerId],
    ),
    db.all<Row>(
      'SELECT customerId, direction, amountFils FROM customer_ledger WHERE ownerId = ? AND deletedAt IS NULL',
      [ownerId],
    ),
  ]);

  const byOrders = new Map<string, Row[]>();
  for (const r of orderRows) {
    const k = String(r.customerId);
    const cur = byOrders.get(k);
    if (cur) cur.push(r);
    else byOrders.set(k, [r]);
  }
  const byLedger = new Map<string, Row[]>();
  for (const r of ledgerRows) {
    const k = String(r.customerId);
    const cur = byLedger.get(k);
    if (cur) cur.push(r);
    else byLedger.set(k, [r]);
  }

  const out = new Map<string, CustomerAccount>();
  for (const id of new Set([...byOrders.keys(), ...byLedger.keys()])) {
    out.set(
      id,
      accountFrom(
        id,
        (byOrders.get(id) ?? []).map((o) => ({
          totalAmountFils: n(o.totalAmountFils),
          totalPaidFils: n(o.totalPaidFils),
          remainingBalanceFils: n(o.remainingBalanceFils),
          status: String(o.status),
        })),
        (byLedger.get(id) ?? []).map((e) => ({ direction: String(e.direction), amountFils: n(e.amountFils) })),
      ),
    );
  }
  return out;
}

export const directionOf = (kind: LedgerKind) => LEDGER_DIRECTION[kind];
