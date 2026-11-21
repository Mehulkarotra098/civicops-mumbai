'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, postJson } from './client';

/** Respond (ward office) or decide (independent reviewer) on an accountability case. */
export function CaseActions({ caseId, mode, status, billed, reference, correctionOpen }: { caseId: string; mode: 'respond' | 'review'; status: string; billed: number; reference: number; correctionOpen: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [ev, setEv] = useState([{ kind: 'Approved scope change', reference: '' }, { kind: 'Inspection record', reference: '' }]);
  const [decision, setDecision] = useState('justified');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(reference ? String(Math.round(reference * 1.3)) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const send = async (url: string, payload: unknown) => {
    setBusy(true); setMsg(null);
    const r = await postJson(url, payload);
    setBusy(false);
    if (!r.ok) { setMsg({ tone: 'error', text: r.message }); return; }
    setMsg({ tone: 'success', text: 'Saved and published to the case history.' });
    router.refresh();
  };
  if (mode === 'respond') {
    return (
      <section className="card space-y-3 p-5" aria-labelledby="respond-h">
        <h2 id="respond-h" className="h2">{correctionOpen ? 'Report the correction' : 'Publish a written response'}</h2>
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        {correctionOpen ? (
          <>
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Corrected bill issued; excess deducted from the next running bill" aria-label="Correction note" />
            <button className="btn-primary" disabled={busy} onClick={() => send(`/api/cases/${caseId}/correct`, { note })}>Report correction done</button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">Explain the variance and attach supporting records. Your reply is published as a new version; it does not close the case. An independent reviewer decides.</p>
            <label className="label" htmlFor="resp-body">Explanation</label>
            <textarea id="resp-body" className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            {ev.map((e, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr]">
                <select className="input" value={e.kind} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, kind: x.target.value } : y)))} aria-label={`Record type ${i + 1}`}>
                  {['Approved scope change', 'Corrected invoice', 'Inspection record', 'Rate justification', 'Measurement book', 'Site photos'].map((k) => <option key={k}>{k}</option>)}
                </select>
                <input className="input" value={e.reference} onChange={(x) => setEv(ev.map((y, j) => (j === i ? { ...y, reference: x.target.value } : y)))} placeholder="Record reference, e.g. SC/KW/2025/041" aria-label={`Record reference ${i + 1}`} />
              </div>
            ))}
            <button className="btn-primary" disabled={busy} onClick={() => send(`/api/cases/${caseId}/respond`, { body, evidence: ev })} data-testid="respond-submit">{busy ? 'Publishing…' : 'Publish response'}</button>
          </>
        )}
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-5" aria-labelledby="review-h">
      <h2 id="review-h" className="h2">Independent decision</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {correctionOpen ? (
        <>
          <p className="text-sm">A correction is open. Close the case once the corrected bill is verified.</p>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Verification note" aria-label="Verification note" />
          <button className="btn-primary" disabled={busy} onClick={() => send(`/api/cases/${caseId}/correct`, { note })}>Verify correction and close</button>
        </>
      ) : (
        <>
          {status === 'awaiting_response' ? <p className="text-xs text-med">No written response yet. You can only refer the case for further review until the office replies.</p> : null}
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
            {[['justified', 'Explanation justified'], ['correction_required', 'Correction required'], ['needs_evidence', 'Needs more evidence'], ['referred', 'Refer for further review']].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={decision === k} onClick={() => setDecision(k)} className={`rounded-full border px-3 py-2 text-sm ${decision === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</button>
            ))}
          </div>
          {decision === 'correction_required' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className="label" htmlFor="corr-amt">Corrected bill (₹)</label><input id="corr-amt" className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /><p className="help">Billed ₹{Math.round(billed).toLocaleString('en-IN')}. Prefilled at 1.3× the rate-card estimate (top of the normal band).</p></div>
            </div>
          ) : null}
          <label className="label" htmlFor="dec-reason">Reason (published)</label>
          <textarea id="dec-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary" disabled={busy} data-testid="decide-submit" onClick={() => send(`/api/cases/${caseId}/decide`, { decision, reason, correctedAmount: decision === 'correction_required' ? Number(amount) : null })}>{busy ? 'Saving…' : 'Record decision'}</button>
        </>
      )}
    </section>
  );
}
