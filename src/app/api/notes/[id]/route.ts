import { fail, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { archiveRecord, updateRecord } from '@/lib/repo';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const body = (await readJson(req)) as { pinned?: boolean; text?: string } | null;

  const patch: Record<string, unknown> = {};
  if (typeof body?.pinned === 'boolean') patch.pinned = body.pinned ? 1 : 0;
  if (typeof body?.text === 'string' && body.text.trim()) patch.text = body.text.trim().slice(0, 4000);

  const updated = await updateRecord(g.ctx, 'order_notes', id, patch);
  if (!updated) return fail('not_found', 404);
  return ok({ note: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const g = await requireCtx('order.edit');
  if (isDenied(g)) return g.response;
  const { id } = await params;
  const archived = await archiveRecord(g.ctx, 'order_notes', id, new URL(req.url).searchParams.get('reason'));
  if (!archived) return fail('not_found', 404);
  return ok({ archived: true, id });
}
