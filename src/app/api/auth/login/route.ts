import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { login } from '@/lib/auth-core';
import { SESSION_COOKIE, apiError, homeFor } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const s = await login(await getDb(), String(body.email ?? ''), String(body.password ?? ''));
    if (!s) return NextResponse.json({ error: 'invalid_credentials', message: 'Email or password is incorrect' }, { status: 401 });
    const res = NextResponse.json({ user: { name: s.user.name, role: s.user.role }, redirect: homeFor(s.user.role) });
    res.cookies.set(SESSION_COOKIE, s.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1', path: '/', maxAge: 7 * 86400 });
    return res;
  } catch (e) {
    return apiError(e);
  }
}
