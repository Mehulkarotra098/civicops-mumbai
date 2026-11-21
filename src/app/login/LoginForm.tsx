'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';
import { safeNext } from '@/lib/next-path';
import { Icon } from '@/components/icons';

export function LoginForm({ quick, next, card }: { quick?: string; next?: string; card?: { title: string; who: string; does: string; icon: string } }) {
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

  if (quick && card) {
    return (
      <button type="button" disabled={busy} onClick={() => go(undefined, quick)} aria-label={`Sign in as ${card.title}: ${card.who}`}
        className="group flex h-full min-h-11 w-full items-start gap-3 rounded-xl border border-line bg-white p-3 text-left transition-colors duration-200 hover:border-action hover:bg-teal-50 disabled:opacity-60 motion-reduce:transition-none">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-action-soft text-action"><Icon name={card.icon} className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{card.title}</span>
          <span className="line-clamp-2 block text-xs text-muted">{card.who}</span>
          <span className="mt-1 block text-xs">{card.does}</span>
        </span>
        <span className="self-center text-xs font-semibold text-action">{busy ? 'Signing in…' : <Icon name="arrowRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />}</span>
      </button>
    );
  }
  if (quick) return <button className="btn-secondary btn-sm min-h-11 shrink-0" disabled={busy} onClick={() => go(undefined, quick)}>{busy ? 'Signing in…' : 'Sign in'}</button>;

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
