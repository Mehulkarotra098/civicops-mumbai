import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { assessEvidence } from '@/lib/vision';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(['super_admin']);
    const { id } = await ctx.params;
    const r = await assessEvidence(await getDb(), user, decodeURIComponent(id));
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
