import { NextResponse } from 'next/server';
import { fail, ok, requireCtx } from '@/lib/api';
import { getDb } from '@/lib/db';
import { audit } from '@/lib/repo';
import { nowIso } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { id } = await params;
  const db = await getDb();
  const row = await db.get<{ mime: string; data: string; name: string }>(
    'SELECT mime, data, name FROM attachments WHERE id = ? AND ownerId = ? AND deletedAt IS NULL',
    [id, g.ctx.ownerId],
  );
  if (!row) return fail('not_found', 404);
  return new NextResponse(Buffer.from(row.data, 'base64'), {
    headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const { id } = await params;
  const db = await getDb();
  const row = await db.get('SELECT id FROM attachments WHERE id = ? AND ownerId = ?', [id, g.ctx.ownerId]);
  if (!row) return fail('not_found', 404);
  await db.run(`UPDATE attachments SET deletedAt = ?, status = 'deleted' WHERE id = ? AND ownerId = ?`, [nowIso(), id, g.ctx.ownerId]);
  await audit(g.ctx, 'attachments', id, 'delete', row, null, 'user confirmed');
  return ok({ deleted: true });
}
