import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { completeCorrection } from '@/lib/cases';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    const b = await req.json();
    const r = await completeCorrection(await getDb(), user, id, String(b.note ?? ''), new Date());
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
