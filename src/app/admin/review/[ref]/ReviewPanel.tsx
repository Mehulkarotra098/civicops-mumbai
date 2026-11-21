'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from '@/components/client';
import { Icon } from '@/components/icons';

interface Photo { id: string; phase: string; note: string | null; created_at: string; origin: string; duplicate: boolean; uploader_role: string }
interface AssessmentView { id: string; provider: string; model: string | null; status: string; result: Record<string, unknown> | null; error: string | null; created_at: string; latency_ms: number }

export function ReviewPanel(p: {
  ticketId: string; ref_: string; status: string; version: number; provider: string; before: Photo[]; during: Photo[]; after: Photo[];
  closureCheck: string; category: string; context: { location: string; description: string; accessRestored: string | null; supplyRestored: string | null; needsSupply: boolean };
  notes: { at: string; type: string; note: string; who: string }[]; assessments: AssessmentView[];
  decisions: { id: string; decision: string; reason: string; manual: boolean; model_version: string | null; created_at: string; reviewer: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [check, setCheck] = useState({ same_location: false, issue_resolved: false, notes_match: false });
  const [zoom, setZoom] = useState<Photo | null>(null);
  const [selBefore, setSelBefore] = useState(p.before[p.before.length - 1]?.id ?? null);
  const [selAfter, setSelAfter] = useState(p.after[p.after.length - 1]?.id ?? null);
  const latest = p.assessments[0];
  const open = p.status === 'awaiting_verification';

  async function assess() {
    setBusy('assess'); setErr(null);
    const r = await postJson(`/api/tickets/${p.ticketId}/assess`, {});
    setBusy(null);
    if (!r.ok) setErr(r.message); else router.refresh();
  }
  async function decide(action: 'approve' | 'request_evidence' | 'rework') {
    if (!reason.trim()) { setErr('Write the reason for your decision. It is stored in the ticket history.'); return; }
    setBusy(action); setErr(null);
    const r = await postJson(`/api/tickets/${p.ticketId}/actions`, { action, reason, expectedVersion: p.version, checklist: check, assessmentId: latest?.status === 'completed' ? latest.id : null });
    setBusy(null);
    if (!r.ok) { setErr(r.message); if (r.status === 409) router.refresh(); return; }
    router.push(`/tickets/${p.ref_}`); router.refresh();
  }

  const pick = (list: Photo[], id: string | null) => list.find((x) => x.id === id) ?? list[list.length - 1];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div><Pic onZoom={setZoom} ph={pick(p.before, selBefore)} label="Before" />{p.before.length > 1 ? <Thumbs list={p.before} sel={selBefore} onSel={setSelBefore} /> : null}</div>
          <div><Pic onZoom={setZoom} ph={pick(p.after, selAfter)} label="After" />{p.after.length > 1 ? <Thumbs list={p.after} sel={selAfter} onSel={setSelAfter} /> : null}</div>
        </div>
        {p.during.length ? <p className="text-xs text-muted">{p.during.length} "during" photo(s) are on the ticket page.</p> : null}
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="h2">Context</h2>
          <p><b>Category:</b> {p.category}</p>
          <p><b>Location:</b> {p.context.location}</p>
          <p><b>Resident report:</b> {p.context.description}</p>
          {p.context.accessRestored ? <p className="text-ok"><b>Access restored:</b> {p.context.accessRestored}</p> : null}
          {p.context.needsSupply ? <p className={p.context.supplyRestored ? 'text-ok' : 'text-crit'}><b>Water supply restored:</b> {p.context.supplyRestored ?? 'not recorded'}</p> : null}
          <h3 className="pt-2 font-semibold">Officer's notes</h3>
          <ul className="space-y-1">{p.notes.map((n, i) => <li key={i} className="text-xs"><span className="text-muted">{n.at} · {n.who}:</span> {n.note || n.type.replace(/_/g, ' ')}</li>)}</ul>
        </section>
      </div>

      <div className="space-y-4">
        <section className="card space-y-3 p-4" aria-labelledby="ai-h">
          <h2 id="ai-h" className="h2 flex items-center gap-2"><Icon name="sparkle" className="h-5 w-5 text-action" />Claude-assisted assessment</h2>
          <p className="text-xs text-muted">Advisory only. Claude compares the before and after photos and says what it cannot verify. You make the decision.</p>
          {open ? <button className="btn-secondary w-full" disabled={!!busy} onClick={assess}>{busy === 'assess' ? 'Assessing… (can take ~20 s)' : latest ? 'Run assessment again' : 'Run Claude assessment'}</button> : null}
          {p.provider === 'unavailable' ? <Alert tone="warn">Claude is not configured on this server (no API key). Use the manual checklist below.</Alert> : null}
          {latest ? <AssessmentCard a={latest} /> : <p className="text-sm text-muted">No assessment yet.</p>}
        </section>

        {open ? (
          <section className="card space-y-3 p-4" aria-labelledby="dec-h">
            <h2 id="dec-h" className="h2">Your decision</h2>
            <p className="text-xs text-muted"><b>Closure check:</b> {p.closureCheck}</p>
            <fieldset className="space-y-2 text-sm">
              <legend className="sr-only">Manual checklist</legend>
              {([['same_location', 'Before and after show the same location'], ['issue_resolved', 'The reported problem is no longer visible'], ['notes_match', "Officer's notes match the photos and timestamps"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={check[k]} onChange={(e) => setCheck((c) => ({ ...c, [k]: e.target.checked }))} />{l}</label>
              ))}
            </fieldset>
            <div><label className="label" htmlFor="reason">Reason (stored in the history and shown to the resident)</label><textarea id="reason" rows={3} className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. After photo shows the same stretch near the church with the road clear; access restored 10:40." /></div>
            {err ? <Alert tone="error">{err}</Alert> : null}
            <div className="grid gap-2">
              <button className="btn-primary" disabled={!!busy || !p.after.length && !reason} onClick={() => decide('approve')} data-testid="approve">{busy === 'approve' ? 'Saving…' : 'Approve closure'}</button>
              <button className="btn-secondary" disabled={!!busy} onClick={() => decide('request_evidence')}>Request more evidence</button>
              <button className="btn-danger" disabled={!!busy} onClick={() => decide('rework')} data-testid="rework">Return for rework</button>
            </div>
          </section>
        ) : <Alert tone="info">This ticket is not awaiting verification.</Alert>}

        {p.decisions.length ? (
          <section className="card space-y-2 p-4 text-sm">
            <h2 className="h2">Earlier decisions</h2>
            {p.decisions.map((d) => <div key={d.id} className="rounded-lg border border-line p-2"><b>{d.decision.replace('_', ' ')}</b> · {d.reviewer} · {d.created_at} · {d.manual ? 'manual' : `with ${d.model_version}`}<div className="text-muted">{d.reason}</div></div>)}
          </section>
        ) : null}
        {p.assessments.length > 1 ? <details className="card p-4 text-sm"><summary className="cursor-pointer font-semibold">Earlier assessments ({p.assessments.length - 1})</summary><div className="mt-2 space-y-2">{p.assessments.slice(1).map((a) => <AssessmentCard key={a.id} a={a} />)}</div></details> : null}
      </div>

      {zoom ? (
        <div role="dialog" aria-modal="true" aria-label="Photo zoom" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          <img src={`/api/evidence/${zoom.id}`} alt="Zoomed evidence" className="max-h-[90vh] max-w-full rounded" />
          <button autoFocus className="btn-secondary btn-sm absolute right-4 top-4" onClick={() => setZoom(null)}>Close</button>
        </div>
      ) : null}
    </div>
  );
}

function Pic({ ph, label, onZoom }: { ph: Photo | undefined; label: string; onZoom: (p: Photo) => void }) {
  return (
    <figure className="card overflow-hidden">
      <figcaption className="flex items-center justify-between border-b border-line bg-gray-50 px-3 py-2 text-sm font-semibold">{label}{ph?.origin === 'illustration' ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Illustration</span> : null}</figcaption>
      {ph ? (
        <button type="button" className="block w-full" onClick={() => onZoom(ph)} aria-label={`Zoom ${label}`}>
          <img src={`/api/evidence/${ph.id}`} alt={`${label} photo`} className="aspect-[4/3] w-full bg-gray-100 object-contain" />
        </button>
      ) : <div className="flex aspect-[4/3] items-center justify-center bg-gray-50 text-sm text-muted">No photo</div>}
      {ph ? <div className="space-y-1 p-3 text-xs"><div>{ph.created_at} · uploaded by {ph.uploader_role}</div>{ph.note ? <div>{ph.note}</div> : null}{ph.duplicate ? <div className="font-semibold text-crit">Warning: this exact photo was uploaded before (possible re-use)</div> : null}</div> : null}
    </figure>
  );
}

function Thumbs({ list, sel, onSel }: { list: Photo[]; sel: string | null; onSel: (id: string) => void }) {
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto">
      {list.map((x) => (
        <button key={x.id} type="button" onClick={() => onSel(x.id)} className={`shrink-0 rounded border-2 ${sel === x.id ? 'border-action' : 'border-transparent'}`} aria-label={`Show photo from ${x.created_at}`}>
          <img src={`/api/evidence/${x.id}?thumb=1`} alt="" className="h-14 w-20 object-cover" />
        </button>
      ))}
    </div>
  );
}

function AssessmentCard({ a }: { a: AssessmentView }) {
  if (a.status !== 'completed' || !a.result) {
    return <div className="rounded-lg border border-med-edge bg-med-soft p-3 text-sm text-med"><b>Assessment unavailable</b> ({a.created_at}). {a.error} <span className="block text-xs">Manual review applies.</span></div>;
  }
  const r = a.result as { same_place: string; same_issue: string; verdict: string; confidence: string; visible_changes: string[]; supporting_details: string[]; cannot_verify: string[]; summary: string };
  const tone = r.verdict === 'repaired' ? 'border-green-200 bg-ok-soft' : r.verdict === 'mismatched' ? 'border-red-200 bg-crit-soft' : 'border-med-edge bg-med-soft';
  return (
    <div className={`space-y-2 rounded-lg border p-3 text-sm ${tone}`} data-testid="assessment">
      <div className="flex flex-wrap items-center gap-2"><b className="capitalize">Suggests: {r.verdict.replace('_', ' ')}</b><span className="chip border-gray-300 bg-white text-gray-700">{r.confidence} confidence</span></div>
      <p>{r.summary}</p>
      <ul className="text-xs"><li>Same place: <b>{r.same_place}</b> · Same issue: <b>{r.same_issue}</b></li></ul>
      {r.visible_changes.length ? <div className="text-xs"><b>Visible changes:</b><ul className="list-disc pl-5">{r.visible_changes.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {r.supporting_details.length ? <div className="text-xs"><b>Supporting details:</b><ul className="list-disc pl-5">{r.supporting_details.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      {r.cannot_verify.length ? <div className="text-xs"><b>Cannot verify from photos:</b><ul className="list-disc pl-5">{r.cannot_verify.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
      <p className="text-[11px] text-muted">{a.provider === 'stub' ? 'Stub provider (test only)' : `Model ${a.model}`} · {a.created_at} · {Math.round(a.latency_ms / 100) / 10} s</p>
    </div>
  );
}
