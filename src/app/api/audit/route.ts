import { isDenied, ok, requireCtx } from '@/lib/api';
import { listAudit } from '@/lib/repo';

export async function GET(req: Request) {
  const g = await requireCtx('audit.view');
  if (isDenied(g)) return g.response;
  const url = new URL(req.url);
  return ok({
    entries: await listAudit(g.ctx.ownerId, {
      limit: Number(url.searchParams.get('limit') ?? 200),
      entityId: url.searchParams.get('entityId') ?? undefined,
      entity: url.searchParams.get('entity') ?? undefined,
    }),
  });
}
