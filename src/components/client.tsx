'use client';
// Small interactive pieces shared across screens.
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './icons';

function fmtLeft(ms: number) {
  const neg = ms < 0;
  let m = Math.abs(Math.round(ms / 60000));
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  const s = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return neg ? `${s} overdue` : `${s} left`;
}

/** Live deadline countdown, separate from milestone progress. */
export function DeadlineClock({ dueAt, startedAt, kind, stoppedAt, outcome, dueLabel, compact }: {
  dueAt: string; startedAt: string; kind: 'first_action' | 'resolution'; stoppedAt?: string | null; outcome?: string | null; dueLabel: string; compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  const due = new Date(dueAt).getTime();
  const start = new Date(startedAt).getTime();
  if (stoppedAt) {
    const met = outcome === 'met';
    return (
      <div className={`rounded-lg border px-3 py-2 ${met ? 'border-green-200 bg-ok-soft text-ok' : 'border-red-200 bg-crit-soft text-crit'}`}>
        <div className="flex items-center gap-1.5 text-sm font-semibold"><Icon name={met ? 'checkCircle' : 'alert'} />Clock stopped · {met ? 'deadline met' : 'deadline missed'}</div>
        {!compact ? <div className="text-xs">Was due {dueLabel}</div> : null}
      </div>
    );
  }
  const n = now ?? start;
  const left = due - n;
  const state = left <= 0 ? 'overdue' : n - start >= (due - start) * 0.8 ? 'soon' : 'ok';
  const cls = state === 'overdue' ? 'border-red-300 bg-crit-soft text-crit' : state === 'soon' ? 'border-med-edge bg-med-soft text-med' : 'border-slate-300 bg-white text-ink';
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`} aria-live="polite">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon name={state === 'overdue' ? 'alert' : 'clock'} />
        {kind === 'first_action' ? 'First action' : 'Resolution'} · {now == null ? '…' : fmtLeft(left)}
      </div>
      {!compact ? <div className="text-xs">Due {dueLabel}</div> : null}
    </div>
  );
}

export function LocaleSwitcher({ current }: { current: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1 text-xs text-slate-200">
      <span className="sr-only">Language</span>
      <select aria-label="Language" value={current} className="rounded bg-navy-800 px-1.5 py-1 text-xs text-white"
        onChange={(e) => { document.cookie = `civicops_locale=${e.target.value}; path=/; max-age=31536000; samesite=lax`; router.refresh(); }}>
        <option value="en">English</option>
        <option value="mr">मराठी</option>
        <option value="hi">हिन्दी</option>
      </select>
    </label>
  );
}

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button className="rounded px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-navy-800 hover:text-white"
      onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }}>
      {label}
    </button>
  );
}

/** Generic POST helper with friendly errors. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string; status: number }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, message: j.message ?? `Request failed (${r.status})`, status: r.status };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: 'Network problem: check your connection and try again. Nothing was lost.', status: 0 };
  }
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const cls = tone === 'error' ? 'border-red-200 bg-crit-soft text-crit' : tone === 'success' ? 'border-green-200 bg-ok-soft text-ok' : tone === 'warn' ? 'border-med-edge bg-med-soft text-med' : 'border-blue-200 bg-blue-50 text-blue-900';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}><Icon name={tone === 'error' ? 'alert' : tone === 'success' ? 'checkCircle' : 'info'} className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}
