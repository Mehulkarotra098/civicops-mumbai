import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { followTicket } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(['resident']);
    const { id } = await ctx.params;
    const r = await followTicket(await getDb(), user, id, new Date());
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
