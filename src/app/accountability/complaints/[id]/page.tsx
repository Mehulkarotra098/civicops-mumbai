import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { loadRefData } from '@/lib/tickets';
import { loadTrail } from '@/lib/trail';
import { loadHistory } from '@/lib/history';
import { formatIST, inr } from '@/lib/time';
import { OriginBadge, PageHeader, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';

/** "What happened to my complaint?" in plain language, with the evidence behind each sentence. */
export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await withSystem(async (q) => {
    const trail = await loadTrail(q, await loadRefData(q));
    const c = trail.rows.find((r) => r.complaint_id === decodeURIComponent(id));
    if (!c) return null;
    const h = await loadHistory(q);
    return { c, siblings: (trail.issues.get(c.issue_id) ?? []).filter((x) => x.complaint_id !== c.complaint_id), jobs: h.wos.filter((w) => c.work_orders.includes(w.work_order_id)), flags: h.flags };
  }, await getDb());
  if (!d) notFound();
  const { c, siblings, jobs } = d;
  const job = jobs[0];
  const jobFlags = job ? d.flags.filter((f) => f.work_order_id === job.work_order_id) : [];
  const answer = job
    ? `Your complaint was linked to work order ${job.work_order_id}. ${job.contractor_name} repaired it with ${job.repair_method.toLowerCase()} and finished on ${formatIST(job.completed_at)}, ${job.sla_met ? 'within' : 'later than'} the ${job.sla_hours}-hour target. The bill was ${inr(job.cost_inr)} (${job.cost_ratio.toFixed(2)}× the rate card). ${job.reopened_within_30d ? 'The repair did not hold: it reopened within 30 days.' : 'The repair held for at least 30 days.'}`
    : c.status_class === 'open_unfixed' ? `No work order was ever linked to this complaint. It is still "${c.status}"${siblings.length ? `, together with ${siblings.length} other complaint${siblings.length === 1 ? '' : 's'} about the same problem` : ''}.`
      : c.status_class === 'forwarded' ? `The complaint was ${c.status.toLowerCase()}, so the ward did not repair it.` : `The complaint was ${c.status.toLowerCase()}.`;
  return (
    <div className="space-y-5">
      <PageHeader kicker="What happened to this complaint?" title={c.complaint_id} actions={<OriginBadge origin="synthetic_repo" />}>
        <span>{formatIST(c.received_at)} · {c.channel} · {c.locality_text} · Ward {c.inferred_ward ?? 'unknown'}{c.ward_source !== 'recorded' ? ` (ward was blank; inferred from ${c.ward_source})` : ''}</span>
      </PageHeader>
      <SyntheticNote />
      <section className={`card p-5 ${job ? (job.reopened_within_30d ? 'border-med-edge' : 'border-green-200') : 'border-red-200'}`}>
        <h2 className="h2 flex items-center gap-2"><Icon name={job ? 'checkCircle' : 'alert'} className={`h-5 w-5 ${job ? 'text-ok' : 'text-crit'}`} />In plain words</h2>
        <p className="mt-2 text-base">{answer}</p>
        {jobFlags.length ? <ul className="mt-3 space-y-1 text-sm">{jobFlags.map((f) => <li key={f.type} className="flex gap-2"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-med" />{f.reason}</li>)}</ul> : null}
      </section>
      <section className="card p-5 text-sm">
        <h2 className="h2">The complaint, as received</h2>
        <p className="mt-2 text-base">“{c.description}” <span className="text-xs text-muted">({c.language})</span></p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <div><dt className="kicker">Category picked</dt><dd>{c.category_reported}</dd></div>
          <div><dt className="kicker">Category from the words</dt><dd>{c.text_category ?? 'No clear keyword'}{c.text_matched ? ` (“${c.text_matched}”)` : ''}{c.category_mismatch ? <span className="ml-1 chip border-med-edge bg-med-soft text-med">differs</span> : null}</dd></div>
          <div><dt className="kicker">Recorded status</dt><dd>{c.status}{c.resolved_at ? ` · resolved ${formatIST(c.resolved_at)}` : ''}</dd></div>
          <div><dt className="kicker">Upvotes</dt><dd>{c.upvotes}</dd></div>
          <div><dt className="kicker">Photo</dt><dd>{c.photo_description ? `Described in the dataset: ${c.photo_description}` : 'None'}</dd></div>
          <div><dt className="kicker">Complainant</dt><dd>Anonymised ({c.complainant_hash.slice(0, 6)}…)</dd></div>
        </dl>
      </section>
      {siblings.length ? (
        <section className="card p-5 text-sm">
          <h2 className="h2">Same issue: {siblings.length} other complaint{siblings.length === 1 ? '' : 's'}</h2>
          <ul className="mt-2 space-y-2">{siblings.slice(0, 20).map((s) => <li key={s.complaint_id}><Link className="font-mono underline" href={`/accountability/complaints/${s.complaint_id}`}>{s.complaint_id}</Link> · {formatIST(s.received_at)} · {s.channel} · {s.status} · “{s.description.slice(0, 110)}”</li>)}</ul>
        </section>
      ) : null}
      {jobs.map((w) => (
        <Link key={w.work_order_id} href={`/accountability/work-orders/${w.work_order_id}`} className="card flex items-center justify-between gap-3 p-5 hover:border-action">
          <div><div className="kicker">Work order</div><div className="font-mono text-lg font-bold">{w.work_order_id}</div><div className="text-sm text-muted">{w.work_type} · {w.repair_method} · {inr(w.cost_inr)} · {w.reopened_within_30d ? 'reopened' : 'held'}</div></div>
          <span className="btn-primary">Full money trail <Icon name="arrowRight" /></span>
        </Link>
      ))}
    </div>
  );
}
