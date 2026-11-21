'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';

interface Opts { wards: string[]; roads: { road_id: string; road_name: string; segment_no: number; ward_code: string }[]; methods: { repair_method: string; unit: string; standard_rate_inr: number }[]; contractors: { contractor_id: string; contractor_name: string }[]; workTypes: string[]; files: string[]; nextWo: string; nextComplaint: string }
type Flag = { type: string; reason: string };

const nowLocal = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

export function LiveData({ o }: { o: Opts }) {
  const router = useRouter();
  const [tab, setTab] = useState<'wo' | 'complaint' | 'upload'>('wo');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<React.ReactNode>(null);
  const [wo, setWo] = useState<Record<string, string>>({ work_order_id: o.nextWo, ward_code: 'K/W', road_id: '', work_type: 'Pothole', repair_method: 'Hot mix patch', contractor_id: o.contractors[0]?.contractor_id ?? '', assigned_at: nowLocal(), work_started_at: nowLocal(), completed_at: nowLocal(), area_sqm: '5', cost_inr: '', sla_hours: '72', sla_met: '', reopened_within_30d: 'N', engineer_remark: '', linked_complaint_ids: '' });
  const [cp, setCp] = useState<Record<string, string>>({ complaint_id: o.nextComplaint, received_at: nowLocal(), channel: 'MyBMC App', category_reported: 'Pothole', description: '', language: 'en', locality_text: '', ward_code: '', status: 'Open', complainant_id: 'LIVE-ENTRY' });
  const roads = useMemo(() => o.roads.filter((r) => r.ward_code === wo.ward_code), [o.roads, wo.ward_code]);
  const method = o.methods.find((m) => m.repair_method === wo.repair_method);
  const estimate = method ? (method.unit === 'per sqm' ? Number(wo.area_sqm || 0) * method.standard_rate_inr : method.standard_rate_inr) : 0;
  const setW = (k: string, v: string) => setWo((x) => ({ ...x, [k]: v }));
  const setC = (k: string, v: string) => setCp((x) => ({ ...x, [k]: v }));
  const field = (label: string, el: React.ReactNode) => <label className="block text-sm"><span className="label">{label}</span>{el}</label>;

  async function submitRecord(kind: 'work_order' | 'complaint') {
    setBusy(true); setErr(null); setResult(null);
    const contractor = o.contractors.find((c) => c.contractor_id === wo.contractor_id);
    const record = kind === 'work_order' ? { ...wo, contractor_name: contractor?.contractor_name ?? wo.contractor_id } : cp;
    const r = await postJson<{ id: string; flags: Flag[]; cases: { ref: string; flag_type: string }[]; issues: { severity: string; message: string }[] }>('/api/data/record', { kind, record });
    setBusy(false);
    if (!r.ok) { setErr(r.message); return; }
    const d = r.data;
    setResult(
      <div className="space-y-2 text-sm">
        <p><b>{d.id}</b> saved as live data and audited automatically.</p>
        {d.issues.length ? <ul className="list-disc pl-5 text-xs">{d.issues.map((i, k) => <li key={k} className={i.severity === 'error' ? 'text-crit' : ''}>{i.severity}: {i.message}</li>)}</ul> : null}
        {kind === 'work_order' ? (d.flags.length ? <ul className="list-disc pl-5">{d.flags.map((f) => <li key={f.type}><b>{f.type.replace(/_/g, ' ')}</b>: {f.reason}</li>)}</ul> : <p>No review flags: within the normal band.</p>) : null}
        {d.cases.length ? <p>Accountability case{d.cases.length > 1 ? 's' : ''} opened: {d.cases.map((c) => <Link key={c.ref} className="mr-2 font-mono underline" href={`/spending/case/${c.ref}`}>{c.ref}</Link>)}</p> : null}
        {kind === 'work_order' ? <Link className="btn-secondary btn-sm" href={`/spending/wo/${encodeURIComponent(d.id)}`}>Open the public record</Link> : <Link className="btn-secondary btn-sm" href={`/accountability/complaints/${encodeURIComponent(d.id)}`}>Open the complaint trail</Link>}
      </div>,
    );
    if (kind === 'work_order') setWo((x) => ({ ...x, work_order_id: bump(x.work_order_id) })); else setCp((x) => ({ ...x, complaint_id: bump(x.complaint_id), description: '' }));
    router.refresh();
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null); setResult(null);
    const fd = new FormData(e.currentTarget);
    const out = new FormData();
    for (const [k, v] of fd.entries()) if (v instanceof File && v.size) out.append(`as:${fd.get(`target-${k}`) || v.name}`, v);
    try {
      const r = await fetch('/api/data/upload', { method: 'POST', body: out });
      const j = await r.json();
      setBusy(false);
      if (!r.ok) { setErr(j.message ?? 'Upload failed'); return; }
      setResult(<div className="space-y-1 text-sm"><p><b>Imported.</b> {Object.entries(j.counts as Record<string, { source_rows: number; imported: number }>).map(([f, c]) => `${f}: ${c.imported}/${c.source_rows}`).join(' · ')}</p><p>{j.newFlags} new review flags · {j.casesOpened} accountability cases opened · {j.issues} validation notes{j.errors.length ? ` (${j.errors.length} errors shown below)` : ''}</p>{j.errors.length ? <ul className="list-disc pl-5 text-xs text-crit">{j.errors.map((x: { record_id?: string; message: string }, i: number) => <li key={i}>{x.record_id}: {x.message}</li>)}</ul> : null}</div>);
      router.refresh();
    } catch { setBusy(false); setErr('Network problem: the upload did not complete. Try again.'); }
  }

  return (
    <section className="card space-y-4 p-5" aria-labelledby="live-h">
      <div>
        <h2 id="live-h" className="h2">Live data</h2>
        <p className="mt-1 text-sm text-muted">Add new bills, complaints or whole files. Rows merge by their IDs. Validation, ward inference, categories, complaint links, audit flags, accountability cases, scorecards and the next-rupee plan all recompute at once. Live rows are labelled “Live data”, separate from the synthetic repo records.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {([['wo', 'Add a bill (work order)'], ['complaint', 'Add a complaint'], ['upload', 'Upload CSV files']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</button>)}
      </div>
      {err ? <Alert tone="error">{err}</Alert> : null}
      {result ? <Alert tone="success">{result}</Alert> : null}
      {tab === 'wo' ? (
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); submitRecord('work_order'); }}>
          {field('Work order ID', <input className="input" value={wo.work_order_id} onChange={(e) => setW('work_order_id', e.target.value)} required />)}
          {field('Ward', <select className="input" value={wo.ward_code} onChange={(e) => { setW('ward_code', e.target.value); setW('road_id', ''); }}>{o.wards.map((w) => <option key={w}>{w}</option>)}</select>)}
          {field('Road segment', <select className="input" value={wo.road_id} onChange={(e) => setW('road_id', e.target.value)} required><option value="">Choose…</option>{roads.map((r) => <option key={r.road_id} value={r.road_id}>{r.road_name} · seg {r.segment_no} ({r.road_id})</option>)}</select>)}
          {field('Work type', <input className="input" list="work-types" value={wo.work_type} onChange={(e) => setW('work_type', e.target.value)} required />)}
          <datalist id="work-types">{o.workTypes.map((w) => <option key={w} value={w} />)}</datalist>
          {field('Repair method (rate card)', <select className="input" value={wo.repair_method} onChange={(e) => setW('repair_method', e.target.value)}>{o.methods.map((m) => <option key={m.repair_method} value={m.repair_method}>{m.repair_method} · ₹{m.standard_rate_inr} {m.unit}</option>)}</select>)}
          {field('Contractor', <select className="input" value={wo.contractor_id} onChange={(e) => setW('contractor_id', e.target.value)}>{o.contractors.map((c) => <option key={c.contractor_id} value={c.contractor_id}>{c.contractor_name}</option>)}</select>)}
          {field('Area (m²)', <input className="input" inputMode="decimal" value={wo.area_sqm} onChange={(e) => setW('area_sqm', e.target.value)} required />)}
          {field('Billed amount (₹)', <input className="input" inputMode="numeric" value={wo.cost_inr} onChange={(e) => setW('cost_inr', e.target.value)} required placeholder={estimate ? `estimate ₹${Math.round(estimate)}` : ''} />)}
          {field('Assigned (IST)', <input className="input" value={wo.assigned_at} onChange={(e) => setW('assigned_at', e.target.value)} />)}
          {field('Completed (IST)', <input className="input" value={wo.completed_at} onChange={(e) => setW('completed_at', e.target.value)} />)}
          {field('SLA hours', <input className="input" value={wo.sla_hours} onChange={(e) => setW('sla_hours', e.target.value)} />)}
          {field('Reopened within 30 days', <select className="input" value={wo.reopened_within_30d} onChange={(e) => setW('reopened_within_30d', e.target.value)}><option value="N">No</option><option value="Y">Yes</option></select>)}
          {field('Linked complaint IDs (| separated)', <input className="input" value={wo.linked_complaint_ids} onChange={(e) => setW('linked_complaint_ids', e.target.value)} placeholder="e.g. BMC25-004138" />)}
          <div className="sm:col-span-2 lg:col-span-3">{field('Engineer remark', <input className="input" value={wo.engineer_remark} onChange={(e) => setW('engineer_remark', e.target.value)} />)}</div>
          <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">Rate-card estimate for this entry: <b>₹{Math.round(estimate).toLocaleString('en-IN')}</b>{wo.cost_inr ? ` · billed is ${(Number(wo.cost_inr) / Math.max(1, estimate)).toFixed(2)}× the estimate` : ''}.</p>
          <div><button className="btn-primary" disabled={busy} data-testid="live-wo-submit">{busy ? 'Saving and auditing…' : 'Save and audit'}</button></div>
        </form>
      ) : tab === 'complaint' ? (
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); submitRecord('complaint'); }}>
          {field('Complaint ID', <input className="input" value={cp.complaint_id} onChange={(e) => setC('complaint_id', e.target.value)} required />)}
          {field('Received (IST)', <input className="input" value={cp.received_at} onChange={(e) => setC('received_at', e.target.value)} />)}
          {field('Channel', <select className="input" value={cp.channel} onChange={(e) => setC('channel', e.target.value)}>{['MyBMC App', '1916 Helpline', 'MyBMC Web Portal', 'Ward Office Walk-in'].map((c) => <option key={c}>{c}</option>)}</select>)}
          {field('Category picked', <select className="input" value={cp.category_reported} onChange={(e) => setC('category_reported', e.target.value)}>{['Pothole', 'Waterlogging', 'Open or broken manhole', 'Choked drain / nullah overflow', 'Road cave-in', 'Broken paver blocks', 'Road related', 'Other'].map((c) => <option key={c}>{c}</option>)}</select>)}
          <div className="sm:col-span-2">{field('Description (any language)', <textarea className="input" rows={2} value={cp.description} onChange={(e) => setC('description', e.target.value)} required />)}</div>
          {field('Locality as typed', <input className="input" value={cp.locality_text} onChange={(e) => setC('locality_text', e.target.value)} placeholder="e.g. Juhu" />)}
          {field('Ward (leave blank to infer)', <select className="input" value={cp.ward_code} onChange={(e) => setC('ward_code', e.target.value)}><option value="">Infer from locality</option>{o.wards.map((w) => <option key={w}>{w}</option>)}</select>)}
          {field('Language', <select className="input" value={cp.language} onChange={(e) => setC('language', e.target.value)}><option value="en">English</option><option value="hi-en">Hinglish</option><option value="mr">Marathi</option><option value="hi">Hindi</option></select>)}
          {field('Status', <select className="input" value={cp.status} onChange={(e) => setC('status', e.target.value)}>{['Open', 'In Progress', 'Resolved', 'Closed - Duplicate', 'Forwarded to MMRDA/PWD', 'Rejected - Not BMC road'].map((s) => <option key={s}>{s}</option>)}</select>)}
          <div className="self-end"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save and process'}</button></div>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={upload}>
          <p className="text-xs text-muted">Each file must use the dataset's column names (see DATA_DICTIONARY.md). If your file has a different name, pick what it contains. Files are checked for required columns before anything is written.</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_240px]">
              <input type="file" name={`f${i}`} accept=".csv,.geojson,.json" className="input" aria-label={`File ${i + 1}`} data-testid={`upload-${i}`} />
              <select name={`target-f${i}`} className="input" aria-label={`File ${i + 1} contains`} defaultValue=""><option value="">Use the file name</option>{o.files.map((f) => <option key={f}>{f}</option>)}</select>
            </div>
          ))}
          <button className="btn-primary" disabled={busy} data-testid="upload-submit">{busy ? 'Importing and auditing…' : 'Import and audit'}</button>
        </form>
      )}
    </section>
  );
}

function bump(id: string) {
  const m = id.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : `${id}-2`;
}
