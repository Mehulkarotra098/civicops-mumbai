'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';
import { safeNext } from '@/lib/next-path';

export function LoginForm({ quick, next }: { quick?: string; next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e?: React.FormEvent, asEmail?: string) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const r = mode === 'register' && !asEmail
      ? await postJson<{ redirect: string }>('/api/auth/register', { email, password, name })
      : await postJson<{ redirect: string }>('/api/auth/login', { email: asEmail ?? email, password: asEmail ? 'CivicOps@2026' : password });
    setBusy(false);
    if (!r.ok) { setErr(r.message); return; }
    router.push(safeNext(next, r.data.redirect)); router.refresh();
  }

  if (quick) return <button className="btn-secondary btn-sm shrink-0" disabled={busy} onClick={() => go(undefined, quick)}>{busy ? 'Signing in…' : 'Sign in'}</button>;

  return (
    <form onSubmit={go} className="space-y-4" noValidate>
      {err ? <Alert tone="error">{err}</Alert> : null}
      {mode === 'register' ? (
        <div><label className="label" htmlFor="name">Your name</label><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></div>
      ) : null}
      <div><label className="label" htmlFor="email">Email</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required />
        {mode === 'register' ? <p className="help">At least 8 characters.</p> : null}</div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create resident account' : 'Sign in'}</button>
      <button type="button" className="w-full text-center text-sm font-semibold text-action underline-offset-2 hover:underline" onClick={() => setMode(mode === 'signin' ? 'register' : 'signin')}>
        {mode === 'signin' ? 'New resident? Create an account' : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}
