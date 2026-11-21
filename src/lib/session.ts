// Next.js glue: read the session cookie and enforce roles on the server.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getDb, HttpError } from './db';
import { userFromToken, type SessionUser } from './auth-core';

export const SESSION_COOKIE = 'civicops_session';

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(await getDb(), token);
}

/** For pages: redirect to sign-in, or show the permission-denied page for the wrong role. */
export async function requirePageUser(roles?: SessionUser['role'][], from?: string): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect(from ? `/login?next=${encodeURIComponent(from)}` : '/login');
  if (roles && !roles.includes(u.role)) redirect('/denied');
  return u;
}

/** For API routes. */
export async function requireApiUser(roles?: SessionUser['role'][]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'unauthenticated', 'Sign in first');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, 'forbidden', 'Your role cannot do this');
  return u;
}

export function apiError(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : 'Unexpected error';
  // Database permission errors (RLS, guard trigger) surface as 403.
  const code = (e as { code?: string })?.code;
  if (code === '42501') return NextResponse.json({ error: 'forbidden', message: msg }, { status: 403 });
  if (code === '23514') return NextResponse.json({ error: 'invalid', message: msg }, { status: 409 });
  console.error(e);
  return NextResponse.json({ error: 'server_error', message: 'Something went wrong on our side. Please try again.' }, { status: 500 });
}

export function homeFor(role: SessionUser['role']): string {
  return role === 'resident' ? '/my' : role === 'super_admin' ? '/admin' : role === 'auditor' ? '/oversight' : '/ward';
}
