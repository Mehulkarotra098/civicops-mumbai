import { NextResponse } from 'next/server';
import { getDb, withUser } from '@/lib/db';
import { createTicket } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(['resident']);
    const body = await req.json();
    const r = await createTicket(await getDb(), user, body, new Date());
    return NextResponse.json({ id: r.id, ref: r.ref, duplicateSubmission: r.duplicateSubmission }, { status: r.duplicateSubmission ? 200 : 201 });
  } catch (e) {
    return apiError(e);
  }
}

/** Tickets the caller may see (row-level security decides). */
export async function GET() {
  try {
    const user = await requireApiUser();
    const rows = await withUser(user, (q) => q.query('select id, ref, status, priority, ward_code, department_code, title, submitted_at from tickets order by submitted_at desc limit 200'), await getDb());
    return NextResponse.json({ tickets: rows.rows });
  } catch (e) {
    return apiError(e);
  }
}
