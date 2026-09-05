import { isDenied, ok, requireCtx } from '@/lib/api';
import { buildCalendar } from '@/lib/insights';
import { dubaiDate, isValidDate, monthKey, monthRange } from '@/lib/date';

export async function GET(req: Request) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;

  const p = new URL(req.url).searchParams;
  const month = p.get('month');
  const range = month && /^\d{4}-\d{2}$/.test(month) ? monthRange(month) : monthRange(monthKey(dubaiDate()));
  const start = p.get('start');
  const end = p.get('end');
  const window = start && end && isValidDate(start) && isValidDate(end) ? { start, end } : range;

  return ok({ range: window, entries: await buildCalendar(g.ctx.ownerId, window.start, window.end) });
}
