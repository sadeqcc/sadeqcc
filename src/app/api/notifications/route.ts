import { isDenied, ok, requireCtx } from '@/lib/api';
import { buildDashboard } from '@/lib/insights';

export async function GET() {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  const d = await buildDashboard(g.ctx.ownerId);
  return ok({ notifications: d.notifications, followUps: d.followUps, today: d.today });
}
