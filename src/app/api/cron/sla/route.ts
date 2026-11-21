import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runSlaSweep } from '@/lib/tickets';
import { apiError, currentUser } from '@/lib/session';

/**
 * SLA scheduler entry point. Called every minute by `npm run scheduler` (local), a Vercel Cron
 * job, or a super admin. Authorised by `Authorization: Bearer $CRON_SECRET` or a super-admin session.
 * `?now=` (ISO time) simulates a controlled clock, only when ALLOW_CLOCK_OVERRIDE=1.
 * Safe to retry: thresholds and notifications are de-duplicated in the database.
 */
async function handle(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    const user = await currentUser();
    if (!(secret && auth === `Bearer ${secret}`) && user?.role !== 'super_admin') {
      return NextResponse.json({ error: 'forbidden', message: 'Scheduler secret or super admin required' }, { status: 403 });
    }
    const nowParam = new URL(req.url).searchParams.get('now');
    const now = nowParam && process.env.ALLOW_CLOCK_OVERRIDE === '1' ? new Date(nowParam) : new Date();
    const r = await runSlaSweep(await getDb(), now);
    return NextResponse.json({ ranAt: now.toISOString(), ...r });
  } catch (e) {
    return apiError(e);
  }
}
export const GET = handle;
export const POST = handle;
