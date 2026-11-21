import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { register } from '@/lib/auth-core';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const s = await register(await getDb(), { email: String(body.email ?? ''), name: String(body.name ?? ''), password: String(body.password ?? ''), phone: body.phone ? String(body.phone) : undefined });
    const res = NextResponse.json({ redirect: '/report' });
    res.cookies.set(SESSION_COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1', path: '/', maxAge: 7 * 86400 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: 'invalid', message: (e as Error).message }, { status: 400 });
  }
}
