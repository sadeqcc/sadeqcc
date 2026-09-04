import { NextResponse } from 'next/server';
import { ok, requireCtx } from '@/lib/api';
import { listAudit } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const g = await requireCtx();
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const entityId = url.searchParams.get('entityId') ?? undefined;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 1000);
  return ok({ rows: await listAudit(g.ctx.ownerId, limit, entityId) });
}
