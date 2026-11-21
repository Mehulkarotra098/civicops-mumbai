import { NextResponse } from 'next/server';
import { getDb, withUser } from '@/lib/db';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const body = await req.json().catch(() => ({}));
    await withUser(user, (q) => body.id
      ? q.query('update notifications set read_at = now() where id = $1 and user_id = $2', [body.id, user.id])
      : q.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id]), await getDb());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
