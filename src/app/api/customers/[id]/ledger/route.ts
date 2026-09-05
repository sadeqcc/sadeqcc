import { fail, invalid, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { directionOf, getAccount, listLedger } from '@/lib/customers';
import { insertRecord, newId } from '@/lib/repo';
import { ledgerSchema } from '@/lib/schemas';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const [entries, account] = await Promise.all([listLedger(g.ctx.ownerId, id), getAccount(g.ctx.ownerId, id)]);
  return ok({ entries, account });
}

/** Money that belongs to the customer rather than to one order. */
export async function POST(req: Request, { params }: Params) {
  const g = await requireCtx('payment.create');
  if (isDenied(g)) return g.response;
  const { id } = await params;

  const parsed = ledgerSchema.safeParse(await readJson(req));
  if (!parsed.success) return invalid(parsed.error.issues);

  const db = await getDb();
  const customer = await db.get('SELECT id FROM customers WHERE id = ? AND ownerId = ? AND deletedAt IS NULL', [id, g.ctx.ownerId]);
  if (!customer) return fail('customer_not_found', 404);

  await insertRecord(g.ctx, 'customer_ledger', {
    id: parsed.data.id ?? newId(),
    customerId: id,
    // The direction follows the kind, so a payment can never be filed as a debt.
    direction: directionOf(parsed.data.kind),
    kind: parsed.data.kind,
    amountFils: parsed.data.amountFils,
    entryDate: parsed.data.entryDate,
    method: parsed.data.method ?? null,
    reference: parsed.data.reference ?? null,
    note: parsed.data.note ?? null,
    mediaId: parsed.data.mediaId ?? null,
    createdByName: g.ctx.actor,
    status: 'active',
  });

  const [entries, account] = await Promise.all([listLedger(g.ctx.ownerId, id), getAccount(g.ctx.ownerId, id)]);
  return ok({ entries, account });
}
