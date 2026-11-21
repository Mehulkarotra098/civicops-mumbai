// Password hashing (scrypt) and database-backed sessions. Framework-free so tests can use it.
import crypto from 'node:crypto';
import { withSystem, type Actor, type Db } from './db.ts';

const SESSION_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export interface SessionUser extends Actor { email: string; locale: string; isDemo: boolean }

export async function login(db: Db, email: string, password: string): Promise<{ token: string; user: SessionUser } | null> {
  return withSystem(async (q) => {
    const r = await q.query<{ id: string; email: string; name: string; role: SessionUser['role']; password_hash: string; locale: string; is_demo: boolean }>(
      'select id, email, name, role, password_hash, locale, is_demo from users where lower(email) = lower($1)', [email.trim()]);
    const u = r.rows[0];
    // Always run a hash to keep timing similar for unknown emails.
    const ok = u ? verifyPassword(password, u.password_hash) : (verifyPassword(password, hashPassword('x')), false);
    if (!u || !ok) return null;
    const token = crypto.randomBytes(32).toString('base64url');
    await q.query(`insert into sessions (id, user_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`, [tokenHash(token), u.id]);
    return { token, user: { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, isDemo: u.is_demo } };
  }, db);
}

export async function register(db: Db, input: { email: string; name: string; password: string; phone?: string }): Promise<{ token: string; user: SessionUser }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address');
  if ((input.password ?? '').length < 8) throw new Error('Use a password of at least 8 characters');
  if (!input.name?.trim()) throw new Error('Enter your name');
  await withSystem(async (q) => {
    const exists = await q.query('select 1 from users where lower(email) = $1', [email]);
    if (exists.rows.length) throw new Error('An account with this email already exists. Sign in instead.');
    await q.query(`insert into users (email, name, phone, role, password_hash) values ($1,$2,$3,'resident',$4)`, [email, input.name.trim(), input.phone ?? null, hashPassword(input.password)]);
  }, db);
  const s = await login(db, email, input.password);
  if (!s) throw new Error('Registration failed');
  return s;
}

export async function userFromToken(db: Db, token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  return withSystem(async (q) => {
    const r = await q.query<{ id: string; email: string; name: string; role: SessionUser['role']; locale: string; is_demo: boolean }>(
      `select u.id, u.email, u.name, u.role, u.locale, u.is_demo from sessions s join users u on u.id = s.user_id
       where s.id = $1 and s.expires_at > now()`, [tokenHash(token)]);
    const u = r.rows[0];
    return u ? { id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, isDemo: u.is_demo } : null;
  }, db);
}

export async function logout(db: Db, token: string | undefined | null) {
  if (!token) return;
  await withSystem((q) => q.query('delete from sessions where id = $1', [tokenHash(token)]), db);
}
