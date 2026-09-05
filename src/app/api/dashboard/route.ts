import { isDenied, ok, requireCtx } from '@/lib/api';
import { buildDashboard } from '@/lib/insights';

export async function GET() {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  return ok(await buildDashboard(g.ctx.ownerId));
}
