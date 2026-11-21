'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, DEPARTMENTS } from '@/lib/config';
import { Alert, postJson } from '@/components/client';

const WARDS = ['A', 'B', 'C', 'D', 'E', 'F/S', 'F/N', 'G/S', 'G/N', 'H/E', 'H/W', 'K/E', 'K/W', 'P/S', 'P/N', 'R/S', 'R/C', 'R/N', 'L', 'M/E', 'M/W', 'N', 'S', 'T'];

export function ConfigForms() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [r, setR] = useState({ ward: '', category: 'waterlogging', primary: 'SWD', supporting: '', reason: '' });
  const [p, setP] = useState({ priority: 'medium', first: '', reminder: '48', resolution: '168', reason: '' });
  async function send(url: string, body: unknown) {
    const res = await postJson(url, body);
    setMsg(res.ok ? { tone: 'success', text: 'Saved as a new version and logged.' } : { tone: 'error', text: res.message });
    if (res.ok) router.refresh();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg ? <div className="lg:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div> : null}
      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); send('/api/admin/routing', { wardCode: r.ward || null, category: r.category, primary: r.primary, supporting: r.supporting ? r.supporting.split(',').map((s) => s.trim()).filter(Boolean) : [], reason: r.reason }); }}>
        <h2 className="h2">Set a routing rule</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Scope<select className="input mt-1" value={r.ward} onChange={(e) => setR({ ...r, ward: e.target.value })}><option value="">City-wide default</option>{WARDS.map((w) => <option key={w} value={w}>Ward {w} only</option>)}</select></label>
          <label className="text-sm">Category<select className="input mt-1" value={r.category} onChange={(e) => setR({ ...r, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.short}</option>)}</select></label>
          <label className="text-sm">Primary department<select className="input mt-1" value={r.primary} onChange={(e) => setR({ ...r, primary: e.target.value })}>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></label>
          <label className="text-sm">Supporting (codes, comma separated)<input className="input mt-1" value={r.supporting} onChange={(e) => setR({ ...r, supporting: e.target.value })} placeholder="e.g. DMC, ELE" /></label>
        </div>
        <label className="block text-sm">Reason<input className="input mt-1" required value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} /></label>
        <button className="btn-primary btn-sm">Save rule</button>
      </form>
      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); send('/api/admin/sla', { priority: p.priority, firstActionHours: p.first ? Number(p.first) : null, reminderHours: p.reminder ? Number(p.reminder) : null, resolutionHours: Number(p.resolution), reason: p.reason }); }}>
        <h2 className="h2">Publish a new SLA policy version</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm">Priority<select className="input mt-1" value={p.priority} onChange={(e) => setP({ ...p, priority: e.target.value })}><option value="critical">Red · Critical</option><option value="medium">Yellow · Medium</option><option value="standard">Orange · Standard</option></select></label>
          <label className="text-sm">First action (hours)<input type="number" min="0" className="input mt-1" value={p.first} onChange={(e) => setP({ ...p, first: e.target.value })} /></label>
          <label className="text-sm">Reminder (hours)<input type="number" min="0" className="input mt-1" value={p.reminder} onChange={(e) => setP({ ...p, reminder: e.target.value })} /></label>
          <label className="text-sm">Resolution (hours)<input type="number" min="1" required className="input mt-1" value={p.resolution} onChange={(e) => setP({ ...p, resolution: e.target.value })} /></label>
        </div>
        <label className="block text-sm">Reason<input className="input mt-1" required value={p.reason} onChange={(e) => setP({ ...p, reason: e.target.value })} /></label>
        <button className="btn-primary btn-sm">Publish version</button>
      </form>
    </div>
  );
}
