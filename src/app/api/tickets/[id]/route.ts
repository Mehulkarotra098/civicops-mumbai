import { NextResponse } from 'next/server';
import { getDb, withUser } from '@/lib/db';
import { getTicketRow } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const t = await withUser(user, (q) => getTicketRow(q, decodeURIComponent(id)), await getDb());
    return NextResponse.json({ ticket: t });
  } catch (e) {
    return apiError(e);
  }
}
