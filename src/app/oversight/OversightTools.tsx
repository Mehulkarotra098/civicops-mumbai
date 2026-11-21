'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';

export function OversightTools({ minutes }: { minutes: number }) {
  const router = useRouter();
  const [m, setM] = useState(String(minutes));
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label" htmlFor="win">Response window for new cases (minutes)</label>
        <input id="win" className="input w-40" inputMode="numeric" value={m} onChange={(e) => setM(e.target.value)} />
        <p className="help">Default 10080 (7 days). Use 1–2 minutes for a live demo.</p>
      </div>
      <button className="btn-secondary" onClick={async () => { const r = await postJson('/api/cases/settings', { minutes: Number(m) }); setMsg(r.ok ? 'Saved. Applies to new cases.' : r.message); }}>Save deadline</button>
      <button className="btn-primary" onClick={async () => { const r = await postJson<{ escalated: string[] }>('/api/cases/sweep', {}); setMsg(r.ok ? (r.data.escalated.length ? `Escalated: ${r.data.escalated.join(', ')}` : 'No new overdue cases.') : r.message); router.refresh(); }}>Check deadlines now</button>
      {msg ? <div className="w-full"><Alert tone="info">{msg}</Alert></div> : null}
    </section>
  );
}
