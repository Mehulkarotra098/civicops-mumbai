'use client';
import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEPARTMENTS } from '@/lib/config';
import { Alert, postJson } from '@/components/client';
import { Icon } from '@/components/icons';
import { EvidenceUploader } from './EvidenceUploader';

const WARDS = ['A', 'B', 'C', 'D', 'E', 'F/S', 'F/N', 'G/S', 'G/N', 'H/E', 'H/W', 'K/E', 'K/W', 'P/S', 'P/N', 'R/S', 'R/C', 'R/N', 'L', 'M/E', 'M/W', 'N', 'S', 'T'];

interface Props {
  ticket: { id: string; ref: string; status: string; version: number; priority: string; ward_code: string | null; department_code: string | null; category_code: string; suggested_ward_code: string | null; verified_at: string | null; details: Record<string, unknown> };
  role: string; actions: string[]; officers: { id: string; name: string }[]; contractors?: { id: string; name: string; local: boolean }[];
  links: { related_ticket_id: string; status: string; distance_m: number | null; reason: string | null; ref: string | null }[];
  needsAccess: boolean; needsSupply: boolean; photoRequired: boolean; closureCheck: string;
  firstActionDone?: boolean; hasOfficer?: boolean;
}

const HELP: Record<string, string> = {
  route: 'Confirm the ward and department so the right team gets it.',
  provide_info: 'The ward team asked you something. Your reply restarts the work.',
  assign: 'Nobody is in charge yet. Pick the officer and the crew.',
  first_action: 'Log the first response on site. This stops the first-action clock, not the repair clock.',
  start_work: 'Tell everyone the crew is on the job.',
  submit_review: 'Add an after-photo above, then send the repair for verification.',
  acknowledge: 'Confirm your team has seen this ticket.',
};

export function ActionPanel({ ticket, role, actions, officers, contractors = [], links, needsAccess, needsSupply, photoRequired, closureCheck, firstActionDone, hasOfficer = true }: Props) {
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
  const reviewLink = role === 'super_admin' && ticket.status === 'awaiting_verification';

  if (!actions.length && !canUpload) {
    return <section className="card p-5 text-sm text-muted"><h2 className="h2 text-ink">Actions</h2><p className="mt-2">No actions are available to you at this stage.</p></section>;
  }

  // The one recommended next step for this stage.
  const primary = reviewLink ? 'review'
    : has('route') ? 'route'
    : has('provide_info') ? 'provide_info'
    : has('assign') && !hasOfficer && officers.length ? 'assign'
    : has('first_action') && !firstActionDone ? 'first_action'
    : has('start_work') ? 'start_work'
    : has('submit_review') && ticket.status === 'in_progress' ? 'submit_review'
    : has('acknowledge') ? 'acknowledge'
    : null;

  // Each action: its button plus the small form it opens.
  const item: Record<string, () => ReactNode> = {
    review: () => <Link href={`/admin/review/${ticket.ref}`} className="btn-primary w-full"><Icon name="zoom" />Open evidence review</Link>,
    acknowledge: () => <Btn c={ctx} a="acknowledge" label="Acknowledge" primary={primary === 'acknowledge'} icon="check" onClick={() => act('acknowledge')} />,
    first_action: () => (
      <>
        <Btn c={ctx} a="first_action" label="Record first action" primary={primary === 'first_action'} icon="wrench" />
        <Form c={ctx} a="first_action" submitLabel="Save first action" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="What was done on site?" required placeholder="e.g. Pump deployed, area barricaded, crew dispatched" /></Form>
      </>
    ),
    start_work: () => <Btn c={ctx} a="start_work" label="Start work" primary={primary === 'start_work'} icon="arrowRight" onClick={() => act('start_work', { note: 'Work started on site' })} />,
    progress: () => (
      <>
        <Btn c={ctx} a="progress" label="Post progress update" icon="history" />
        <Form c={ctx} a="progress" submitLabel="Post update" payload={() => ({ note: f.note, workOrderRef: f.wo || undefined })}>
          <Text c={ctx} k="note" label="Update" required placeholder="e.g. Water receding, now ankle-deep" />
          <div><label className="label" htmlFor="f-wo">Linked work order (optional)</label><input id="f-wo" className="input" value={f.wo ?? ''} onChange={(e) => set('wo', e.target.value)} placeholder="e.g. WO26-00012" /></div>
        </Form>
      </>
    ),
    restore: () => has('restore') && (needsAccess || needsSupply) ? (
      <button type="button" className="btn-secondary w-full" disabled={!!busy} onClick={() => act('restore', { restored: needsSupply ? 'supply' : 'access' })}>
        <Icon name="checkCircle" />{needsSupply ? 'Record: water supply restored' : 'Record: access restored'}
      </button>
    ) : null,
    upload: () => staff && canUpload ? <EvidenceUploader ticketId={ticket.id} staff onUploaded={() => router.refresh()} /> : null,
    submit_review: () => (
      <>
        <Btn c={ctx} a="submit_review" label="Submit completion for review" primary={primary === 'submit_review'} icon="upload" />
        <Form c={ctx} a="submit_review" submitLabel="Submit for review" payload={() => ({ note: f.note, noPhotoReason: f.nophoto || undefined, workOrderRef: f.wo || undefined })}>
          <p className="text-xs text-muted"><b>Closure check:</b> {closureCheck}</p>
          <Text c={ctx} k="note" label="Repair note" required placeholder="What was fixed, how, and by whom" />
          <div><label className="label" htmlFor="f-wo2">Linked work order (optional)</label><input id="f-wo2" className="input" value={f.wo ?? ''} onChange={(e) => set('wo', e.target.value)} /></div>
          {photoRequired ? <Text c={ctx} k="nophoto" label="Only if no after-photo is possible: why?" placeholder="e.g. Underground repair verified by pressure test" /> : null}
        </Form>
      </>
    ),
    route: () => has('route') ? (
      <>
        <Btn c={ctx} a="route" label="Route from triage" primary={primary === 'route'} icon="transfer" />
        <Form c={ctx} a="route" submitLabel="Route ticket" payload={() => ({ wardCode: f.ward ?? ticket.suggested_ward_code, departmentCode: f.dept, reason: f.reason })}>
          <Select k="ward" label="Ward" value={f.ward ?? ticket.suggested_ward_code ?? ''} options={WARDS.map((w) => [w, `Ward ${w}`])} onChange={set} />
          <Select k="dept" label="Department" value={f.dept ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
          <Text c={ctx} k="reason" label="Note" placeholder="e.g. Caller confirmed Andheri West station side" />
        </Form>
      </>
    ) : null,
    assign: () => has('assign') && officers.length ? (
      <>
        <Btn c={ctx} a="assign" label="Assign officer and contractor" primary={primary === 'assign'} icon="user" />
        <Form c={ctx} a="assign" submitLabel="Assign" payload={() => ({ officerId: f.officer, contractorId: f.contractor || null })}>
          <Select k="officer" label="Officer in charge" value={f.officer ?? ''} options={officers.map((o) => [o.id, o.name])} onChange={set} />
          <Select k="contractor" label="Contractor doing the work" value={f.contractor ?? ''} options={contractors.map((c) => [c.id, `${c.name}${c.local ? ' · works in this ward' : ''}`])} onChange={set} />
        </Form>
      </>
    ) : null,
    provide_info: () => has('provide_info') ? <><Btn c={ctx} a="provide_info" label="Reply to the ward team" primary icon="user" /><Form c={ctx} a="provide_info" submitLabel="Send reply" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="Your reply" required /></Form></> : null,
    resident_upload: () => !staff && canUpload ? <EvidenceUploader ticketId={ticket.id} onUploaded={() => router.refresh()} /> : null,
    reopen: () => has('reopen') ? <><Btn c={ctx} a="reopen" label="The problem is back: request reopening" icon="history" /><Form c={ctx} a="reopen" submitLabel="Reopen" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="What is wrong now?" required /></Form></> : null,
    transfer: () => (
      <>
        <Btn c={ctx} a="transfer" label="Transfer to another team or ward" icon="transfer" />
        <Form c={ctx} a="transfer" submitLabel="Transfer (keeps ticket ID, evidence and deadline)" payload={() => ({ wardCode: f.ward ?? ticket.ward_code, departmentCode: f.dept ?? ticket.department_code, reason: f.reason })}>
          <Select k="ward" label="Ward" value={f.ward ?? ticket.ward_code ?? ''} options={WARDS.map((w) => [w, `Ward ${w}`])} onChange={set} />
          <Select k="dept" label="Department" value={f.dept ?? ticket.department_code ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
          <Text c={ctx} k="reason" label="Reason" required />
        </Form>
      </>
    ),
    add_supporting: () => (
      <>
        <Btn c={ctx} a="add_supporting" label="Hand off to a supporting team" icon="link" />
        <Form c={ctx} a="add_supporting" submitLabel="Record handoff" payload={() => ({ departmentCode: f.dept, note: f.note })}>
          <Select k="dept" label="Supporting department" value={f.dept ?? ''} options={DEPARTMENTS.map((d) => [d.code, d.name])} onChange={set} />
          <Text c={ctx} k="note" label="Handoff note" required placeholder="e.g. Electrical to isolate the cable before cutting" />
        </Form>
      </>
    ),
    priority: () => (
      <>
        <Btn c={ctx} a="priority" label="Change priority" icon="alert" />
        <Form c={ctx} a="priority" submitLabel="Change priority" payload={() => ({ priority: f.priority, reason: f.reason })}>
          <Select k="priority" label="New priority" value={f.priority ?? ''} options={[['critical', 'Red · Critical'], ['medium', 'Yellow · Medium'], ['standard', 'Orange · Standard']].filter(([p]) => p !== ticket.priority)} onChange={set} />
          <Text c={ctx} k="reason" label="Reason (recorded in the history)" required />
        </Form>
      </>
    ),
    request_info: () => <><Btn c={ctx} a="request_info" label="Ask the resident a question" icon="info" /><Form c={ctx} a="request_info" submitLabel="Send question" payload={() => ({ note: f.note })}><Text c={ctx} k="note" label="Question" required /></Form></>,
    refer: () => <><Btn c={ctx} a="refer" label="Refer to another agency" icon="arrowRight" /><Form c={ctx} a="refer" submitLabel="Refer" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="Agency and reason" required placeholder="e.g. MMRDA road: forwarded to MMRDA" /></Form></>,
    cancel: () => has('cancel') ? <><Btn c={ctx} a="cancel" label={role === 'resident' ? 'Withdraw my report' : 'Cancel ticket'} icon="x" /><Form c={ctx} a="cancel" submitLabel="Confirm" payload={() => ({ reason: f.reason })}><Text c={ctx} k="reason" label="Reason" required /></Form></> : null,
  };

  const shown = (k: string) => k === 'restore' ? has('restore') && (needsAccess || needsSupply)
    : k === 'upload' ? staff && canUpload
    : k === 'resident_upload' ? !staff && canUpload
    : k === 'assign' ? has('assign') && officers.length > 0
    : has(k);

  // Work on this stage (always visible, in workflow order) versus everything else (folded away).
  const stage = ['route', 'provide_info', ...(hasOfficer ? [] : ['assign']), 'acknowledge', 'first_action', 'start_work', 'progress', 'restore', 'upload', 'submit_review', 'resident_upload', 'reopen']
    .filter((k) => k !== primary && shown(k));
  const moreKeys = [...(hasOfficer ? ['assign'] : []), 'transfer', 'add_supporting', 'priority', 'request_info', 'refer', 'cancel']
    .filter((k) => (k === 'assign' ? has('assign') && officers.length > 0 : has(k)));

  return (
    <section className="card space-y-3 p-5" aria-labelledby="act-h">
      <h2 id="act-h" className="h2">{role === 'resident' ? 'Your options' : 'Take action'}</h2>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}

      {primary ? (
        <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
          <div className="kicker flex items-center gap-1.5 text-action"><Icon name="arrowRight" className="h-3.5 w-3.5" />Next step</div>
          {item[primary]()}
          {HELP[primary] ? <p className="text-xs text-teal-900">{HELP[primary]}</p> : null}
        </div>
      ) : null}

      {stage.length ? <div className="space-y-2">{stage.map((k) => <Fragment key={k}>{item[k]()}</Fragment>)}</div> : null}

      {suggestions.length && has('confirm_duplicate') ? (
        <div className="rounded-lg border border-med-edge bg-med-soft p-3 text-sm">
          <b className="flex items-center gap-1.5"><Icon name="link" />Possible duplicate</b>
          {suggestions.map((s) => (
            <div key={s.related_ticket_id} className="mt-2 space-y-2">
              <p>Same category, {s.distance_m} m from {s.ref ?? 'another ticket'}. Confirm only if it is the same problem.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary btn-sm min-h-11" disabled={!!busy} onClick={() => act('confirm_duplicate', { duplicateOf: s.related_ticket_id, reason: `Same ${ticket.category_code.replace('_', ' ')} at the same spot as ${s.ref}` })}>Confirm duplicate of {s.ref}</button>
                <button type="button" className="btn-secondary btn-sm min-h-11" disabled={!!busy} onClick={() => act('reject_duplicate', { duplicateOf: s.related_ticket_id, reason: 'Different problem' })}>Not a duplicate</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {moreKeys.length ? (
        <details className="group rounded-xl border border-line" open={moreKeys.includes(open ?? '') || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Icon name="more" />More actions <span className="tnum chip border-gray-300 bg-gray-50 text-gray-700">{moreKeys.length}</span></span>
            <Icon name="arrowRight" className="h-4 w-4 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" />
          </summary>
          <div className="space-y-2 border-t border-line p-3">{moreKeys.map((k) => <Fragment key={k}>{item[k]()}</Fragment>)}</div>
        </details>
      ) : null}

      {role === 'super_admin' && ['request_evidence', 'rework', 'approve'].some(has) ? <p className="text-xs text-muted">Approve, request more evidence and return for rework are on the evidence review screen.</p> : null}
    </section>
  );
}

interface Ctx {
  has: (a: string) => boolean; busy: string | null; open: string | null; setOpen: (a: string | null) => void;
  act: (a: string, extra?: Record<string, unknown>) => void; f: Record<string, string>; set: (k: string, v: string) => void;
}

// Top-level helpers (stable component identity, so inputs keep focus while typing).
function Btn({ c, a, label, primary, onClick, icon }: { c: Ctx; a: string; label: string; primary?: boolean; onClick?: () => void; icon?: string }) {
  if (!c.has(a)) return null;
  return (
    <button type="button" className={primary ? 'btn-primary w-full text-base' : 'btn-secondary w-full'} disabled={!!c.busy} onClick={onClick ?? (() => c.setOpen(c.open === a ? null : a))} aria-expanded={onClick ? undefined : c.open === a}>
      {icon ? <Icon name={icon} /> : null}{c.busy === a ? 'Saving…' : label}
    </button>
  );
}

function Form({ c, a, children, submitLabel, payload }: { c: Ctx; a: string; children: React.ReactNode; submitLabel: string; payload: () => Record<string, unknown> }) {
  if (c.open !== a) return null;
  return (
    <form className="space-y-3 rounded-lg border border-line bg-gray-50 p-3 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none" onSubmit={(e) => { e.preventDefault(); c.act(a, payload()); }}>
      {children}
      <div className="flex flex-wrap gap-2"><button className="btn-primary min-h-11" disabled={!!c.busy}>{c.busy === a ? 'Saving…' : submitLabel}</button><button type="button" className="btn-secondary min-h-11" onClick={() => c.setOpen(null)}>Cancel</button></div>
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
