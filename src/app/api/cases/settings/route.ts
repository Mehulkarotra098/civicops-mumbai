import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { setResponseWindow } from '@/lib/cases';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(['auditor', 'super_admin']);
    const b = await req.json();
    await setResponseWindow(await getDb(), user, Number(b.minutes), new Date());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
