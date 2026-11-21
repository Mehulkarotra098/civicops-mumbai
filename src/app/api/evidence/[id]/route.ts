import { getDb } from '@/lib/db';
import { readEvidence } from '@/lib/evidence';
import { apiError, requireApiUser } from '@/lib/session';

/** Private photo delivery: every request re-checks the caller against row-level security. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const thumb = new URL(req.url).searchParams.get('thumb') === '1';
    const data = await readEvidence(await getDb(), user, id, thumb);
    return new Response(new Uint8Array(data), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
  } catch (e) {
    return apiError(e);
  }
}
