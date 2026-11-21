import { NextResponse } from 'next/server';
import { getDb, withUser } from '@/lib/db';
import { previewRoute } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

/** Suggested ward, department, priority and nearby duplicates, shown before the resident submits. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(['resident', 'super_admin']);
    const body = await req.json();
    const preview = await withUser(user, (q) => previewRoute(q, body, new Date()), await getDb());
    return NextResponse.json(preview);
  } catch (e) {
    return apiError(e);
  }
}
