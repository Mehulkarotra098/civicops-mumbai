'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEPARTMENTS } from '@/lib/config';
import { Alert, postJson } from '@/components/client';
import { Icon } from '@/components/icons';
import { EvidenceUploader } from './EvidenceUploader';

const WARDS = ['A', 'B', 'C', 'D', 'E', 'F/S', 'F/N', 'G/S', 'G/N', 'H/E', 'H/W', 'K/E', 'K/W', 'P/S', 'P/N', 'R/S', 'R/C', 'R/N', 'L', 'M/E', 'M/W', 'N', 'S', 'T'];

interface Props {
  ticket: { id: string; ref: string; status: string; version: number; priority: string; ward_code: string | null; department_code: string | null; category_code: string; suggested_ward_code: string | null; verified_at: string | null; details: Record<string, unknown> };
  role: string; actions: string[]; officers: { id: string; name: string }[];
  links: { related_ticket_id: string; status: string; distance_m: number | null; reason: string | null; ref: string | null }[];
  needsAccess: boolean; needsSupply: boolean; photoRequired: boolean; closureCheck: string;
}

export function ActionPanel({ ticket, role, actions, officers, links, needsAccess, needsSupply, photoRequired, closureCheck }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const has = (a: string) => actions.includes(a);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setMsg(null);
    const r = await postJson(`/api/tickets/${ticket.id}/actions`, { action, expectedVersion: ticket.version, ...extra });
    setBusy(null);
    if (!r.ok) { setMsg({ tone: 'error', text: r.message }); if (r.status === 409) router.refresh(); return; }
    setMsg({ tone: 'success', text: 'Saved. The timeline is updated.' }); setOpen(null); setF({});
    router.refresh();
  }

  const ctx: Ctx = { has, busy, open, setOpen, act, f, set };
  const staff = role !== 'resident';
  const canUpload = staff ? ['assigned', 'acknowledged', 'in_progress'].includes(ticket.status) : ['submitted', 'assigned', 'acknowledged', 'needs_info'].includes(ticket.status);
  const suggestions = links.filter((l) => l.status === 'suggested');

  if (!actions.length && !canUpload) {
    return <section className="card p-5 text-sm text-muted"><h2 className="h2 text-ink">Actions</h2><p className="mt-2">No actions are available to you at this stage.</p></section>;
  }

  return (
    <section className="card space-y-3 p-5" aria-labelledby="act-h">
      <h2 id="act-h" className="h2">{role === 'resident' ? 'Your options' : 'Take action'}</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

      {role === 'super_admin' && ticket.status === 'awaiting_verification' ? (
        <Link href={`/admin/review/${ticket.ref}`} className="btn-primary w-full"><Icon name="zoom" />Open evidence review</Link>
      ) : null}

      {/* Officer workflow, in order */}
      <Btn c={ctx} a="acknowledge" label="Acknowledge" primary onClick={() => act('acknowledge')} />
      <Btn c={ctx} a="first_action" label="Record first action" primary={ticket.priority === 'critical'} />
      <Form c={ctx} a="first_action" submitLabel="Save first action" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="What was done on site?" required placeholder="e.g. Pump deployed, area barricaded, crew dispatched" /></Form>
      <Btn c={ctx} a="start_work" label="Start work" onClick={() => act('start_work', { note: 'Work started on site' })} />
      <Btn c={ctx} a="progress" label="Post progress update" />
      <Form c={ctx} a="progress" submitLabel="Post update" payload={() => ({ note: f.note, workOrderRef: f.wo || undefined })}>
        <Text c={ctx} k="note" label="Update" required placeholder="e.g. Water receding, now ankle-deep" />
        <div><label className="label" htmlFor="f-wo">Linked work order (optional)</label><input id="f-wo" className="input" value={f.wo ?? ''} onChange={(e) => set('wo', e.target.value)} placeholder="e.g. WO26-00012" /></div>
      </Form>
      {has('restore') && (needsAccess || needsSupply) ? (
        <button type="button" className="btn-secondary w-full" disabled={!!busy} onClick={() => act('restore', { restored: needsSupply ? 'supply' : 'access' })}>
          <Icon name="checkCircle" />{needsSupply ? 'Record: water supply restored' : 'Record: access restored'}
        </button>
      ) : null}
      {staff && canUpload ? <EvidenceUploader ticketId={ticket.id} staff onUploaded={() => router.refresh()} /> : null}
      <Btn c={ctx} a="submit_review" label="Submit completion for review" primary={ticket.status === 'in_progress'} />
      <Form c={ctx} a="submit_review" submitLabel="Submit for review" payload={() => ({ note: f.note, noPhotoReason: f.nophoto || undefined, workOrderRef: f.wo || undefined })}>
        <p className="text-xs text-muted"><b>Closure check:</b> {closureCheck}</p>
        <Text c={ctx} k="note" label="Repair note" required placeholder="What was fixed, how, and by whom" />
        <div><label className="label" htmlFor="f-wo2">Linked work order (optional)</label><input id="f-wo2" className="input" value={f.wo ?? ''} onChange={(e) => set('wo', e.target.value)} /></div>
        {photoRequired ? <Text c={ctx} k="nophoto" label="Only if no after-photo is possible: why?" placeholder="e.g. Underground repair verified by pressure test" /> : null}
      </Form>

      {/* Ownership and triage */}
      {has('route') ? (
        <>
          <Btn c={ctx} a="route" label="Route from triage" primary />
          <Form c={ctx} a="route" submitLabel="Route ticket" payload={() => ({ wardCode: f.ward ?? ticket.suggested_ward_code, departmentCode: f.dept, reason: f.reason })}>
            <Select k="ward" label="Ward" value={f.ward ?? ticket.suggested_ward_code ?? ''} options={WARDS.map((w) => [w, `Ward ${w}`])} onChange={set} />
            <Select k="dept" label="Department" value={f.dept ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
            <Text c={ctx} k="reason" label="Note" placeholder="e.g. Caller confirmed Andheri West station side" />
          </Form>
        </>
      ) : null}
      {has('assign') && officers.length ? (
        <>
          <Btn c={ctx} a="assign" label="Assign officer" />
          <Form c={ctx} a="assign" submitLabel="Assign" payload={() => ({ officerId: f.officer })}>
            <Select k="officer" label="Officer" value={f.officer ?? ''} options={officers.map((o) => [o.id, o.name])} onChange={set} />
          </Form>
        </>
      ) : null}
      <Btn c={ctx} a="transfer" label="Transfer to another team or ward" />
      <Form c={ctx} a="transfer" submitLabel="Transfer (keeps ticket ID, evidence and deadline)" payload={() => ({ wardCode: f.ward ?? ticket.ward_code, departmentCode: f.dept ?? ticket.department_code, reason: f.reason })}>
        <Select k="ward" label="Ward" value={f.ward ?? ticket.ward_code ?? ''} options={WARDS.map((w) => [w, `Ward ${w}`])} onChange={set} />
        <Select k="dept" label="Department" value={f.dept ?? ticket.department_code ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
        <Text c={ctx} k="reason" label="Reason" required />
      </Form>
      <Btn c={ctx} a="add_supporting" label="Hand off to a supporting team" />
      <Form c={ctx} a="add_supporting" submitLabel="Record handoff" payload={() => ({ departmentCode: f.dept, note: f.note })}>
        <Select k="dept" label="Supporting department" value={f.dept ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
        <Text c={ctx} k="note" label="Handoff note" required placeholder="e.g. Electrical to isolate the cable before cutting" />
      </Form>
      <Btn c={ctx} a="priority" label="Change priority" />
      <Form c={ctx} a="priority" submitLabel="Change priority" payload={() => ({ priority: f.priority, reason: f.reason })}>
        <Select k="priority" label="New priority" value={f.priority ?? ''} options={[['critical', 'Red · Critical'], ['medium', 'Yellow · Medium'], ['standard', 'Orange · Standard']].filter(([p]) => p !== ticket.priority)} onChange={set} />
        <Text c={ctx} k="reason" label="Reason (recorded in the history)" required />
      </Form>
      <Btn c={ctx} a="request_info" label="Ask the resident a question" />
      <Form c={ctx} a="request_info" submitLabel="Send question" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="Question" required /></Form>

      {suggestions.length && has('confirm_duplicate') ? (
        <div className="rounded-lg border border-med-edge bg-med-soft p-3 text-sm">
          <b>Possible duplicate</b>
          {suggestions.map((s) => (
            <div key={s.related_ticket_id} className="mt-2 space-y-2">
              <p>Same category, {s.distance_m} m from {s.ref ?? 'another ticket'}. Confirm only if it is the same problem.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => act('confirm_duplicate', { duplicateOf: s.related_ticket_id, reason: `Same ${ticket.category_code.replace('_', ' ')} at the same spot as ${s.ref}` })}>Confirm duplicate of {s.ref}</button>
                <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => act('reject_duplicate', { duplicateOf: s.related_ticket_id, reason: 'Different problem' })}>Not a duplicate</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Btn c={ctx} a="refer" label="Refer to another agency" />
      <Form c={ctx} a="refer" submitLabel="Refer" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="Agency and reason" required placeholder="e.g. MMRDA road: forwarded to MMRDA" /></Form>

      {/* Resident options */}
      {has('provide_info') ? <><Btn c={ctx} a="provide_info" label="Reply to the ward team" primary /><Form c={ctx} a="provide_info" submitLabel="Send reply" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="Your reply" required /></Form></> : null}
      {!staff && canUpload ? <EvidenceUploader ticketId={ticket.id} onUploaded={() => router.refresh()} /> : null}
      {has('reopen') ? <><Btn c={ctx} a="reopen" label="The problem is back: request reopening" /><Form c={ctx} a="reopen" submitLabel="Reopen" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="What is wrong now?" required /></Form></> : null}
      {has('cancel') ? <><Btn c={ctx} a="cancel" label={role === 'resident' ? 'Withdraw my report' : 'Cancel ticket'} /><Form c={ctx} a="cancel" submitLabel="Confirm" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="Reason" required /></Form></> : null}
      {role === 'super_admin' && ['request_evidence', 'rework', 'approve'].some(has) ? <p className="text-xs text-muted">Approve, request more evidence and return for rework are on the evidence review screen.</p> : null}
    </section>
  );
}


interface Ctx {
  has: (a: string) => boolean; busy: string | null; open: string | null; setOpen: (a: string | null) => void;
  act: (a: string, extra?: Record<string, unknown>) => void; f: Record<string, string>; set: (k: string, v: string) => void;
}

// Top-level helpers (stable component identity, so inputs keep focus while typing).
function Btn({ c, a, label, primary, onClick }: { c: Ctx; a: string; label: string; primary?: boolean; onClick?: () => void }) {
  if (!c.has(a)) return null;
  return <button type="button" className={primary ? 'btn-primary w-full' : 'btn-secondary w-full'} disabled={!!c.busy} onClick={onClick ?? (() => c.setOpen(c.open === a ? null : a))} aria-expanded={c.open === a}>{c.busy === a ? 'Saving…' : label}</button>;
}

function Form({ c, a, children, submitLabel, payload }: { c: Ctx; a: string; children: React.ReactNode; submitLabel: string; payload: () => Record<string, unknown> }) {
  if (c.open !== a) return null;
  return (
    <form className="space-y-3 rounded-lg border border-line bg-gray-50 p-3" onSubmit={(e) => { e.preventDefault(); c.act(a, payload()); }}>
      {children}
      <div className="flex gap-2"><button className="btn-primary btn-sm" disabled={!!c.busy}>{c.busy === a ? 'Saving…' : submitLabel}</button><button type="button" className="btn-secondary btn-sm" onClick={() => c.setOpen(null)}>Cancel</button></div>
    </form>
  );
}

function Text({ c, k, label, required, rows = 2, placeholder }: { c: Ctx; k: string; label: string; required?: boolean; rows?: number; placeholder?: string }) {
  return <div><label className="label" htmlFor={`f-${k}`}>{label}</label><textarea id={`f-${k}`} className="input" rows={rows} required={required} value={c.f[k] ?? ''} placeholder={placeholder} onChange={(e) => c.set(k, e.target.value)} /></div>;
}

function Select({ k, label, value, options, onChange }: { k: string; label: string; value: string; options: string[][]; onChange: (k: string, v: string) => void }) {
  return (
    <div><label className="label" htmlFor={`s-${k}`}>{label}</label>
      <select id={`s-${k}`} className="input" value={value} required onChange={(e) => onChange(k, e.target.value)}>
        <option value="">Choose…</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
  );
}
