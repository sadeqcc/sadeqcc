import { NextResponse } from 'next/server';
import { fail, guard, ok, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { newId, audit } from '@/lib/repo';
import { nowIso } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

/** Receipt photos. Stored owner-scoped in the database, never on a public path. */
export async function POST(req: Request): Promise<NextResponse> {
  const limited = guard(req, 'attach', 60, 60_000);
  if (limited) return limited;
  const g = await requireCtx();
  if ('response' in g) return g.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail('file_required', 400);
  if (file.size > MAX_BYTES) return fail('file_too_large', 413);
  if (!ALLOWED.includes(file.type)) return fail('unsupported_type', 415);

  const buf = Buffer.from(await file.arrayBuffer());
  const db = await getDb();
  const id = newId();
  const t = nowIso();
  await db.run(
    `INSERT INTO attachments (id, ownerId, name, mime, size, data, status, createdAt, updatedAt, createdBy)
     VALUES (?,?,?,?,?,?,'active',?,?,?)`,
    [id, g.ctx.ownerId, file.name.slice(0, 200), file.type, buf.length, buf.toString('base64'), t, t, g.ctx.userId],
  );
  await audit(g.ctx, 'attachments', id, 'create', null, { name: file.name, mime: file.type, size: buf.length });
  return ok({ id, name: file.name, mime: file.type, size: buf.length });
}
