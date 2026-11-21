import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { performAction } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const body = await req.json();
    const r = await performAction(await getDb(), user, decodeURIComponent(id), body, new Date());
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
