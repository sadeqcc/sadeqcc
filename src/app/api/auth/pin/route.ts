import { fail, isDenied, ok, readJson, requireCtx } from '@/lib/api';
import { getUserById, setPin, verifyPin } from '@/lib/auth';
import { audit } from '@/lib/repo';
import { pinSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  const g = await requireCtx();
  if (isDenied(g)) return g.response;

  const parsed = pinSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail('validation_failed', 422, { issues: parsed.error.issues.map((i) => i.message) });

  const user = await getUserById(g.ctx.userId);
  if (user?.pinHash && !(await verifyPin(g.ctx.userId, parsed.data.currentPin ?? ''))) {
    return fail('wrong_pin', 403);
  }
  await setPin(g.ctx.userId, parsed.data.pin);
  await audit(g.ctx, 'users', g.ctx.userId, parsed.data.pin ? 'pin_set' : 'pin_cleared', null, null);
  return ok({ hasPin: !!parsed.data.pin });
}
