import { isDenied, ok, requireCtx } from '@/lib/api';
import { buildReport } from '@/lib/insights';
import { isValidDate, presetRange } from '@/lib/date';

export async function GET(req: Request) {
  const g = await requireCtx('reports.view');
  if (isDenied(g)) return g.response;

  const p = new URL(req.url).searchParams;
  const start = p.get('start');
  const end = p.get('end');
  const range = start && end && isValidDate(start) && isValidDate(end)
    ? { start, end }
    : presetRange(p.get('preset') ?? 'month');

  return ok(await buildReport(g.ctx.ownerId, range, { includeCancelled: p.get('includeCancelled') === '1' }));
}
