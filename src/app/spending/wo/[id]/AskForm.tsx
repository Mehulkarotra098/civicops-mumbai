'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, postJson } from '@/components/client';

export function AskForm({ workOrderId, types }: { workOrderId: string; types: Record<string, string> }) {
  const [type, setType] = useState('cost_increase');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; due: string; office: string } | null>(null);
  if (done) {
    return (
      <div className="mt-3 space-y-2">
        <Alert tone="success">Question sent. Your tracking ID is <b className="font-mono" data-testid="case-ref">{done.ref}</b>. {done.office} must reply by {done.due}.</Alert>
        <Link className="btn-primary" href={`/spending/case/${done.ref}`}><span className="inline-flex items-center gap-2 text-white">Track this question</span></Link>
      </div>
    );
  }
  return (
    <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      const r = await postJson<{ ref: string; due: string; office: string }>('/api/spending/ask', { workOrderId, type, text, name, contact });
      setBusy(false);
      if (r.ok) setDone(r.data); else setErr(r.message);
    }}>
      <fieldset className="md:col-span-2">
        <legend className="label">What are you asking?</legend>
        <div className="flex flex-wrap gap-2">{Object.entries(types).map(([k, v]) => (
          <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${type === k ? 'border-action bg-action text-white shadow-sm' : 'border-gray-300 bg-white hover:border-action'}`}>{v}</button>
        ))}</div>
      </fieldset>
      <div className="md:col-span-2"><label className="label" htmlFor="ask-text">Your question</label><textarea id="ask-text" rows={3} className="input" value={text} onChange={(e) => setText(e.target.value)} required placeholder="e.g. Why was this patch billed almost twice the rate card, and why did it reopen?" /></div>
      <div><label className="label" htmlFor="ask-name">Name (optional, kept private)</label><input id="ask-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="label" htmlFor="ask-contact">Email or phone for updates (optional, kept private)</label><input id="ask-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} /></div>
      {err ? <div className="md:col-span-2"><Alert tone="error">{err}</Alert></div> : null}
      <div className="md:col-span-2"><button className="btn-primary" disabled={busy} data-testid="ask-submit">{busy ? 'Sending…' : 'Send question'}</button></div>
    </form>
  );
}
