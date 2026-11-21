import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runCaseSweep } from '@/lib/cases';
import { apiError, requireApiUser } from '@/lib/session';

/** "Check deadlines now" for the oversight team (the server also checks every minute). */
export async function POST() {
  try {
    await requireApiUser(['auditor', 'super_admin']);
    const fired = await runCaseSweep(await getDb(), new Date());
    return NextResponse.json({ escalated: fired });
  } catch (e) {
    return apiError(e);
  }
}
