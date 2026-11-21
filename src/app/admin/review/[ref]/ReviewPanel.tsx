'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';
import { Icon } from '@/components/icons';

interface Photo { id: string; phase: string; note: string | null; created_at: string; origin: string; duplicate: boolean; uploader_role: string }
interface AssessmentView { id: string; provider: string; model: string | null; status: string; result: Record<string, unknown> | null; error: string | null; created_at: string; latency_ms: number }
type Decision = 'approve' | 'request_evidence' | 'rework';

const RESULT: Record<Decision, { text: string; entry: string; tone: 'success' | 'warn' }> = {
  approve: { text: 'Closure approved. The resident sees green and 100%.', entry: 'Closure verified', tone: 'success' },
  request_evidence: { text: 'More evidence requested. The officer is notified and the ticket goes back to them.', entry: 'More evidence requested', tone: 'warn' },
  rework: { text: 'Returned for rework. The officer is notified and the resolution clock keeps running.', entry: 'Returned for rework', tone: 'warn' },
};

export function ReviewPanel(p: {
  ticketId: string; ref_: string; status: string; version: number; provider: string; before: Photo[]; during: Photo[]; after: Photo[];
  closureCheck: string; category: string; context: { location: string; description: string; accessRestored: string | null; supplyRestored: string | null; needsSupply: boolean };
  notes: { at: string; type: string; note: string; who: string }[]; assessments: AssessmentView[];
  decisions: { id: string; decision: string; reason: string; manual: boolean; model_version: string | null; created_at: string; reviewer: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ d: Decision; at: string } | null>(null);
  const [reason, setReason] = useState('');
  const [check, setCheck] = useState({ same_location: false, issue_resolved: false, notes_match: false });
  const [zoom, setZoom] = useState<Photo | null>(null);
  const [mode, setMode] = useState<'slider' | 'side'>('slider');
  const [pos, setPos] = useState(50);
  const [selBefore, setSelBefore] = useState(p.before[p.before.length - 1]?.id ?? null);
  const [selAfter, setSelAfter] = useState(p.after[p.after.length - 1]?.id ?? null);
  const latest = p.assessments[0];
  const open = p.status === 'awaiting_verification';

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  async function assess() {
    setBusy('assess'); setErr(null);
    const r = await postJson(`/api/tickets/${p.ticketId}/assess`, {});
    setBusy(null);
    if (!r.ok) setErr(r.message); else router.refresh();
  }
  async function decide(action: Decision) {
    if (!reason.trim()) { setErr('Write the reason for your decision. It is stored in the ticket history.'); return; }
    setBusy(action); setErr(null);
    const r = await postJson(`/api/tickets/${p.ticketId}/actions`, { action, reason, expectedVersion: p.version, checklist: check, assessmentId: latest?.status === 'completed' ? latest.id : null });
    setBusy(null);
    if (!r.ok) { setErr(r.message); if (r.status === 409) router.refresh(); return; }
    setDone({ d: action, at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST' });
    if (action === 'approve') { setTimeout(() => { router.push(`/tickets/${p.ref_}`); router.refresh(); }, 900); }
    else router.refresh();
  }

  const pick = (list: Photo[], id: string | null) => list.find((x) => x.id === id) ?? list[list.length - 1];
  const b = pick(p.before, selBefore);
  const a = pick(p.after, selAfter);
  const checked = Object.values(check).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {done ? (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md transition duration-300 starting:translate-y-3 starting:opacity-0 motion-reduce:transition-none sm:left-auto sm:right-6">
          <div role="status" className={`rounded-xl border p-4 text-sm shadow-lg ${RESULT[done.d].tone === 'success' ? 'border-green-200 bg-ok-soft text-ok' : 'border-med-edge bg-med-soft text-med'}`}>
            <div className="flex items-start gap-2"><Icon name={done.d === 'approve' ? 'checkCircle' : 'history'} className="mt-0.5 h-5 w-5 shrink-0" />
              <div><b>{RESULT[done.d].text}</b>
                <div className="tnum mt-1 text-xs text-ink">Timeline entry added: <b>{RESULT[done.d].entry}</b> · {done.at}</div>
                {done.d === 'approve' ? <div className="mt-1 text-xs text-ink">Opening the ticket…</div> : null}</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Photos, Claude's view and the reviewer's checklist side by side on wide screens */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr]">
        {/* Before / after comparison */}
        <section className="card min-w-0 overflow-hidden md:col-span-2 xl:col-span-1" aria-labelledby="cmp-h">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gray-50 px-4 py-2">
            <h2 id="cmp-h" className="h2 flex items-center gap-2"><Icon name="camera" className="h-5 w-5 text-action" />Before and after</h2>
            <div className="flex rounded-lg border border-line bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Comparison view">
              {([['slider', 'Slider'], ['side', 'Side by side']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={`min-h-10 rounded-md px-3 ${mode === k ? 'bg-action text-white' : 'text-ink hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          </div>
          {mode === 'slider' && b && a ? (
            <div className="p-3">
              <div className="relative aspect-[4/3] max-h-[60vh] w-full overflow-hidden rounded-lg bg-gray-900 select-none">
                <img src={`/api/evidence/${a.id}`} alt="After photo" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                <img src={`/api/evidence/${b.id}`} alt="Before photo" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
                <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.25)]" style={{ left: `${pos}%` }} aria-hidden>
                  <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-action shadow-md"><Icon name="transfer" className="h-4 w-4" /></span>
                </span>
                <span className="chip absolute left-2 top-2 border-white/40 bg-navy-900/80 text-white">Before</span>
                <span className="chip absolute right-2 top-2 border-white/40 bg-action text-white">After</span>
              </div>
              <label className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted">
                <span>Before</span>
                <input type="range" min={0} max={100} step={1} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="h-11 flex-1 accent-[#0f766e]"
                  aria-label="Comparison slider: use the arrow keys to reveal more of the before or after photo" aria-valuetext={`${pos}% before photo shown`} />
                <span>After</span>
              </label>
            </div>
          ) : (
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <Pic onZoom={setZoom} ph={b} label="Before" />
              <Pic onZoom={setZoom} ph={a} label="After" />
            </div>
          )}
          <div className="grid gap-3 border-t border-line p-3 text-xs sm:grid-cols-2">
            <Stamp ph={b} label="Before" list={p.before} sel={selBefore} onSel={setSelBefore} onZoom={setZoom} />
            <Stamp ph={a} label="After" list={p.after} sel={selAfter} onSel={setSelAfter} onZoom={setZoom} />
          </div>
          {p.during.length ? <p className="border-t border-line px-3 py-2 text-xs text-muted">{p.during.length} &quot;during&quot; photo(s) are on the ticket page.</p> : null}
        </section>

      {/* Claude's view beside the reviewer's own checklist */}
        <section className="card min-w-0 space-y-3 p-4" aria-labelledby="ai-h">
          <h2 id="ai-h" className="h2 flex items-center gap-2"><Icon name="sparkle" className="h-5 w-5 text-action" />What Claude sees</h2>
          <p className="text-xs text-muted">Advisory only. Claude compares the before and after photos and says what it cannot verify. You make the decision.</p>
          {open ? <button className="btn-secondary w-full" disabled={!!busy} onClick={assess}><Icon name="sparkle" />{busy === 'assess' ? 'Assessing… (can take ~20 s)' : latest ? 'Run assessment again' : 'Run Claude assessment'}</button> : null}
          {p.provider === 'unavailable' ? <Alert tone="warn">Claude is not configured on this server (no API key). Use the manual checklist.</Alert> : null}
          {latest ? <AssessmentCard a={latest} /> : <p className="text-sm text-muted">No assessment yet.</p>}
          {p.assessments.length > 1 ? <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Earlier assessments ({p.assessments.length - 1})</summary><div className="mt-2 space-y-2">{p.assessments.slice(1).map((x) => <AssessmentCard key={x.id} a={x} />)}</div></details> : null}
        </section>

        {open && !done ? (
          <section className="card min-w-0 space-y-3 p-4" aria-labelledby="dec-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="dec-h" className="h2">Your decision</h2>
              <span className="tnum chip border-gray-300 bg-gray-50 text-gray-700"><Icon name="check" className="h-3.5 w-3.5" />{checked} of 3 checked</span>
            </div>
            <p className="text-xs text-muted"><b>Closure check:</b> {p.closureCheck}</p>
            <fieldset className="space-y-1 text-sm">
              <legend className="sr-only">Manual checklist</legend>
              {([['same_location', 'Before and after show the same location'], ['issue_resolved', 'The reported problem is no longer visible'], ['notes_match', "Officer's notes match the photos and timestamps"]] as const).map(([k, l]) => (
                <label key={k} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${check[k] ? 'border-green-200 bg-ok-soft' : 'border-line bg-white'}`}><input type="checkbox" className="h-5 w-5 shrink-0 accent-[#067647]" checked={check[k]} onChange={(e) => setCheck((c) => ({ ...c, [k]: e.target.checked }))} />{l}</label>
              ))}
            </fieldset>
            <div><label className="label" htmlFor="reason">Reason (stored in the history and shown to the resident)</label><textarea id="reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. After photo shows the same stretch near the church with the road clear; access restored 10:40." /></div>
            {err ? <Alert tone="error">{err}</Alert> : null}
            <div className="grid gap-2">
              <button className="btn-primary" disabled={!!busy || !p.after.length && !reason} onClick={() => decide('approve')} data-testid="approve"><Icon name="checkCircle" />{busy === 'approve' ? 'Saving…' : 'Approve closure'}</button>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button className="btn-secondary" disabled={!!busy} onClick={() => decide('request_evidence')}><Icon name="camera" />{busy === 'request_evidence' ? 'Saving…' : 'Request more evidence'}</button>
                <button className="btn-danger" disabled={!!busy} onClick={() => decide('rework')} data-testid="rework"><Icon name="history" />{busy === 'rework' ? 'Saving…' : 'Return for rework'}</button>
              </div>
            </div>
          </section>
        ) : done ? (
          <section className="card space-y-2 p-4 text-sm" aria-live="polite">
            <h2 className="h2">Decision recorded</h2>
            <Alert tone={RESULT[done.d].tone}>{RESULT[done.d].text} Timeline entry: <b>{RESULT[done.d].entry}</b> ({done.at}).</Alert>
          </section>
        ) : <div><Alert tone="info">This ticket is not awaiting verification.</Alert></div>}
        <section className="card min-w-0 space-y-2 p-4 text-sm md:col-span-2 xl:col-span-3" aria-labelledby="ctx-h">
          <h2 id="ctx-h" className="h2">What was reported</h2>
          <p><b>Category:</b> {p.category}</p>
          <p className="break-words"><b>Location:</b> {p.context.location}</p>
          <p className="rounded-lg bg-gray-50 px-3 py-2">{p.context.description}</p>
          {p.context.accessRestored ? <p className="tnum flex items-center gap-1 font-semibold text-ok"><Icon name="checkCircle" />Access restored {p.context.accessRestored}</p> : null}
          {p.context.needsSupply ? <p className={`tnum flex items-center gap-1 font-semibold ${p.context.supplyRestored ? 'text-ok' : 'text-crit'}`}><Icon name={p.context.supplyRestored ? 'checkCircle' : 'alert'} />Water supply restored: {p.context.supplyRestored ?? 'not recorded'}</p> : null}
          <h3 className="pt-2 font-semibold">Officer&apos;s notes</h3>
          <ol className="relative space-y-2 pl-5 before:absolute before:bottom-1 before:left-[5px] before:top-1 before:w-0.5 before:bg-action/25">
            {p.notes.map((n, i) => <li key={i} className="relative text-xs"><span className="absolute -left-5 top-0.5 h-3 w-3 rounded-full border-2 border-action bg-white" aria-hidden /><span className="tnum text-muted">{n.at} · {n.who}</span><br />{n.note || n.type.replace(/_/g, ' ')}</li>)}
          </ol>
        </section>
      </div>

      {p.decisions.length ? (
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="h2">Earlier decisions</h2>
          {p.decisions.map((d) => <div key={d.id} className={`rounded-lg border p-3 ${d.decision === 'approve' ? 'border-green-200 bg-ok-soft' : 'border-red-200 bg-crit-soft'}`}><b className="capitalize">{d.decision.replace('_', ' ')}</b> <span className="tnum text-xs">· {d.reviewer} · {d.created_at} · {d.manual ? 'manual' : `with ${d.model_version}`}</span><div className="text-muted">{d.reason}</div></div>)}
        </section>
      ) : null}

      {zoom ? (
        <div role="dialog" aria-modal="true" aria-label="Photo zoom" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          <img src={`/api/evidence/${zoom.id}`} alt="Zoomed evidence" className="max-h-[90vh] max-w-full rounded" />
          <button autoFocus className="btn-secondary btn-sm absolute right-4 top-4 min-h-11" onClick={() => setZoom(null)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}

function Stamp({ ph, label, list, sel, onSel, onZoom }: { ph: Photo | undefined; label: string; list: Photo[]; sel: string | null; onSel: (id: string) => void; onZoom: (p: Photo) => void }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`chip ${label === 'After' ? 'border-teal-200 bg-action-soft text-action' : 'border-gray-300 bg-gray-50 text-gray-700'}`}>{label}</span>
        {ph?.origin === 'illustration' ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Illustration</span> : null}
        {ph ? <button type="button" className="min-h-9 text-xs font-semibold text-action underline" onClick={() => onZoom(ph)} aria-label={`Zoom ${label}`}>Full size</button> : null}
      </div>
      {ph ? (
        <div className="mt-1 space-y-0.5">
          <div className="tnum"><Icon name="clock" className="mr-1 inline h-3 w-3" />Uploaded {ph.created_at} · by {ph.uploader_role.replace('_', ' ')}</div>
          {ph.note ? <div className="text-muted">{ph.note}</div> : null}
          {ph.duplicate ? <div className="flex items-center gap-1 font-semibold text-crit"><Icon name="alert" className="h-3.5 w-3.5" />This exact photo was uploaded before (possible re-use)</div> : null}
        </div>
      ) : <div className="mt-1 text-muted">No photo</div>}
      {list.length > 1 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {list.map((x) => (
            <button key={x.id} type="button" onClick={() => onSel(x.id)} className={`shrink-0 rounded border-2 ${sel === x.id ? 'border-action' : 'border-transparent'}`} aria-label={`Show ${label.toLowerCase()} photo from ${x.created_at}`} aria-pressed={sel === x.id}>
              <img src={`/api/evidence/${x.id}?thumb=1`} alt="" className="h-11 w-16 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Pic({ ph, label, onZoom }: { ph: Photo | undefined; label: string; onZoom: (p: Photo) => void }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line">
      <figcaption className={`px-3 py-1.5 text-sm font-semibold ${label === 'After' ? 'bg-action text-white' : 'bg-navy-900 text-white'}`}>{label}</figcaption>
      {ph ? (
        <button type="button" className="block w-full" onClick={() => onZoom(ph)} aria-label={`Enlarge ${label} photo`}>
          <img src={`/api/evidence/${ph.id}`} alt={`${label} photo`} className="aspect-[4/3] w-full bg-gray-100 object-contain" />
        </button>
      ) : <div className="flex aspect-[4/3] items-center justify-center bg-gray-50 text-sm text-muted">No photo</div>}
    </figure>
  );
}

function AssessmentCard({ a }: { a: AssessmentView }) {
  if (a.status !== 'completed' || !a.result) {
    return <div className="rounded-lg border border-med-edge bg-med-soft p-3 text-sm text-med"><b>Assessment unavailable</b> ({a.created_at}). {a.error} <span className="block text-xs">Manual review applies.</span></div>;
  }
  const r = a.result as { same_place: string; same_issue: string; verdict: string; confidence: string; visible_changes: string[]; supporting_details: string[]; cannot_verify: string[]; summary: string };
  const tone = r.verdict === 'repaired' ? 'border-green-200 bg-ok-soft' : r.verdict === 'mismatched' ? 'border-red-200 bg-crit-soft' : 'border-med-edge bg-med-soft';
  const conf = r.confidence === 'high' ? 3 : r.confidence === 'medium' ? 2 : 1;
  return (
    <div className={`space-y-3 rounded-lg border p-3 text-sm ${tone}`} data-testid="assessment">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex items-center gap-1.5 capitalize"><Icon name={r.verdict === 'repaired' ? 'checkCircle' : 'alert'} className="h-4 w-4" />Suggests: {r.verdict.replace('_', ' ')}</b>
        <span className="chip border-gray-300 bg-white text-gray-700"><span className="flex gap-0.5" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={`h-2 w-1.5 rounded-sm ${i <= conf ? 'bg-ink' : 'bg-gray-300'}`} />)}</span>{r.confidence} confidence</span>
      </div>
      <p>{r.summary}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-white/70 px-2 py-1.5">Same place<br /><b className="capitalize">{r.same_place}</b></div>
        <div className="rounded-md bg-white/70 px-2 py-1.5">Same issue<br /><b className="capitalize">{r.same_issue}</b></div>
      </div>
      {r.visible_changes.length ? <div className="text-xs"><b className="flex items-center gap-1"><Icon name="zoom" className="h-3.5 w-3.5" />What changed</b><ul className="mt-1 list-disc pl-5">{r.visible_changes.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {r.supporting_details.length ? <div className="text-xs"><b className="flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" />Supporting details</b><ul className="mt-1 list-disc pl-5">{r.supporting_details.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {r.cannot_verify.length ? <div className="rounded-md border border-dashed border-gray-400 bg-white/70 p-2 text-xs"><b className="flex items-center gap-1"><Icon name="info" className="h-3.5 w-3.5" />Cannot verify from photos</b><ul className="mt-1 list-disc pl-5">{r.cannot_verify.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      <p className="tnum text-[11px] text-muted">{a.provider === 'stub' ? 'Stub provider (test only)' : `Model ${a.model}`} · {a.created_at} · {Math.round(a.latency_ms / 100) / 10} s</p>
    </div>
  );
}
