import { fail, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getSettings, saveSettings } from '@/lib/repo';
import { settingsSchema } from '@/lib/schemas';

export async function GET() {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;
  return ok({ settings: await getSettings(g.ctx.ownerId) });
}

export async function PATCH(req: Request) {
  const g = await requireCtx('settings.manage');
  if (isDenied(g)) return g.response;
  const parsed = settingsSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('validation_failed', 422, { issues: parsed.error.issues.map((i) => i.message) });
  return ok({ settings: await saveSettings(g.ctx, parsed.data) });
}

export const POST = PATCH;
