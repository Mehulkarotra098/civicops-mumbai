import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { loadHistory, moneyTrail, scorecards } from '@/lib/history';
import { formatIST } from '@/lib/time';
import { Empty, Kpi, PageHeader, PriorityBadge, StatusBadge, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const user = await requirePageUser(['super_admin']);
  const db = await getDb();
  const { tickets, hist } = await withUser(user, async (q) => ({
    tickets: (await q.query<TicketRow>('select * from tickets order by submitted_at desc')).rows,
    hist: await loadHistory(q),
  }), db);
  const now = new Date();
  const active = tickets.filter((t) => !['verified_resolved', 'cancelled', 'duplicate', 'referred'].includes(t.status));
  const escalated = active.filter((t) => t.escalation_level > 0);
  const awaiting = tickets.filter((t) => t.status === 'awaiting_verification');
  const triage = tickets.filter((t) => t.in_triage && t.status === 'submitted');
  const overdue = active.filter((t) => t.status !== 'awaiting_verification' && activeClock(t, now).state === 'overdue'); // same rule as the ward board
  const verified = tickets.filter((t) => t.status === 'verified_resolved');
  const met = verified.filter((t) => t.sla_outcome === 'met').length;
  const reopened = tickets.filter((t) => t.reopen_count > 0);
  const wards = [...new Set(tickets.map((t) => t.ward_code).filter(Boolean))].sort() as string[];
  const trail = moneyTrail(hist);
  const cards = scorecards(hist);

  return (
    <div className="space-y-8">
      <PageHeader kicker="Super admin · all wards" title="Command centre">Escalations, evidence waiting for a decision, and how each ward is performing. Every number opens the records behind it.</PageHeader>
      <div className="-mt-4"><AutoRefresh /></div>
      <section aria-label="Live operations" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Active tickets" value={active.length} href="/ward" sub={`${tickets.filter((t) => Date.now() - new Date(t.submitted_at).getTime() < 86_400_000).length} reported in last 24 h`} />
        <Kpi label="Escalations" value={escalated.length} tone={escalated.length ? 'crit' : undefined} href="#escalations" sub="Missed first action or resolution" />
        <Kpi label="Awaiting verification" value={awaiting.length} href="/admin/review" sub="Evidence to review" />
        <Kpi label="Triage queue" value={triage.length} href="/admin/triage" sub="Ward or team unclear" />
        <Kpi label="Overdue now" value={overdue.length} tone={overdue.length ? 'crit' : undefined} href="/ward?tab=overdue" />
        <Kpi label="Verified resolved" value={verified.length} tone="ok" href="/ward?status=verified_resolved" sub={verified.length ? `${Math.round((met / verified.length) * 100)}% within deadline` : 'None yet'} />
        <Kpi label="Reopened" value={reopened.length} href="/ward?reopened=1" />
      </section>

      <section className="card p-5" aria-labelledby="new-h">
        <h2 id="new-h" className="h2 flex items-center gap-2"><Icon name="sparkle" className="h-5 w-5 text-action" />New reports</h2>
        <p className="mt-1 text-sm text-muted">Latest tickets across all wards, newest first. This page refreshes itself every 15 seconds.</p>
        {tickets.length ? (
          <ul className="mt-3 divide-y divide-line">
            {tickets.slice(0, 10).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/tickets/${t.ref}`} className="font-mono text-sm font-bold text-action underline">{t.ref}</Link> <PriorityBadge priority={t.priority} /> <StatusBadge status={t.status} />
                  <div className="text-sm">{t.title}</div>
                </div>
                <span className="text-xs text-muted tabular-nums">{t.in_triage ? 'Triage queue' : `Ward ${t.ward_code ?? '—'} · ${t.department_code ?? '—'}`} · {formatIST(t.submitted_at)}</span>
              </li>
            ))}
          </ul>
        ) : <div className="mt-3"><Empty title="No reports yet" /></div>}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section id="escalations" className="card p-5" aria-labelledby="esc-h">
          <h2 id="esc-h" className="h2 flex items-center gap-2"><Icon name="alert" className="h-5 w-5 text-crit" />Escalation inbox</h2>
          {escalated.length ? (
            <ul className="mt-3 divide-y divide-line">
              {escalated.map((t) => {
                const c = activeClock(t, now);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`/tickets/${t.ref}`} className="font-mono text-sm font-bold text-action underline">{t.ref}</Link> <PriorityBadge priority={t.priority} />
                      <div className="text-sm">{t.title}</div>
                      <div className="text-xs text-crit">{t.escalation_level >= 2 ? 'Resolution deadline missed' : 'First-action deadline missed'} · {c.kind === 'first_action' ? 'first action' : 'resolution'} was due {formatIST(c.dueAt)}</div>
                    </div>
                    <span className="text-xs text-muted">Ward {t.ward_code} · {t.department_code}</span>
                  </li>
                );
              })}
            </ul>
          ) : <div className="mt-3"><Empty title="No escalations" /></div>}
        </section>
        <section className="card p-5" aria-labelledby="rev-h">
          <h2 id="rev-h" className="h2 flex items-center gap-2"><Icon name="zoom" className="h-5 w-5 text-action" />Awaiting verification</h2>
          {awaiting.length ? (
            <ul className="mt-3 divide-y divide-line">
              {awaiting.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div><span className="font-mono text-sm font-bold">{t.ref}</span> <StatusBadge status={t.status} /><div className="text-sm">{t.title}</div><div className="text-xs text-muted">Submitted for review {formatIST(t.completion_submitted_at)}</div></div>
                  <Link href={`/admin/review/${t.ref}`} className="btn-primary btn-sm">Review evidence</Link>
                </li>
              ))}
            </ul>
          ) : <div className="mt-3"><Empty title="Nothing waiting" /></div>}
        </section>
      </div>

      <section className="card overflow-x-auto p-5" aria-labelledby="perf-h">
        <h2 id="perf-h" className="h2">Ward performance</h2>
        <p className="mt-1 text-sm text-muted">Left: live tickets in CivicOps. Right: <b>historical context</b> from the synthetic 2025 monsoon records (a different system and SLA policy), shown separately.</p>
        <table className="table mt-3">
          <thead><tr><th>Ward</th><th>Active</th><th>Overdue</th><th>Escalated</th><th>Verified</th><th>Within deadline</th><th className="border-l border-line">2025 jobs</th><th>2025 SLA met</th><th>2025 reopened</th><th>2025 budget used</th></tr></thead>
          <tbody>
            {trail.map((w) => {
              const tw = tickets.filter((t) => t.ward_code === w.ward_code);
              const act = tw.filter((t) => active.includes(t));
              const ver = tw.filter((t) => t.status === 'verified_resolved');
              const jobs = hist.wos.filter((x) => x.ward_code === w.ward_code);
              const hasLive = wards.includes(w.ward_code);
              return (
                <tr key={w.ward_code}>
                  <td><Link className="font-semibold text-action underline" href={`/wards/${encodeURIComponent(w.ward_code)}`}>{w.ward_code}</Link></td>
                  <td>{hasLive ? <Link className="underline" href={`/ward?ward=${encodeURIComponent(w.ward_code)}`}>{act.length}</Link> : 0}</td>
                  <td className={tw.filter((t) => overdue.includes(t)).length ? 'font-semibold text-crit' : ''}>{tw.filter((t) => overdue.includes(t)).length}</td>
                  <td>{tw.filter((t) => escalated.includes(t)).length}</td>
                  <td>{ver.length}</td>
                  <td>{ver.length ? `${Math.round((ver.filter((t) => t.sla_outcome === 'met').length / ver.length) * 100)}%` : '—'}</td>
                  <td className="border-l border-line"><Link className="underline" href={`/accountability?ward=${encodeURIComponent(w.ward_code)}`}>{jobs.length}</Link></td>
                  <td>{jobs.length ? `${Math.round((jobs.filter((j) => j.sla_met).length / jobs.length) * 100)}%` : '—'}</td>
                  <td>{jobs.length ? `${Math.round((jobs.filter((j) => j.reopened_within_30d).length / jobs.length) * 100)}%` : '—'}</td>
                  <td className={w.utilisation && w.utilisation > 1 ? 'font-semibold text-crit' : ''}>{w.utilisation != null ? `${Math.round(w.utilisation * 100)}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3"><SyntheticNote /></div>
      </section>

      <section className="card p-5">
        <h2 className="h2">Contractor scorecards (historical, synthetic)</h2>
        <p className="mt-1 text-sm text-muted">Fair comparisons: durability is compared with what is expected for the repair methods each contractor used, and speed is also shown excluding heavy-rain days.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {cards.slice(0, 4).map((c) => <Link key={c.contractor_id} href={`/accountability/contractors/${c.contractor_id}`} className="rounded-lg border border-line p-3 text-sm hover:border-action"><b>{c.contractor_name}</b><p className="mt-1 text-muted">{c.summary}</p></Link>)}
        </div>
        <Link href="/accountability#contractors" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action">All 8 scorecards <Icon name="arrowRight" className="h-3 w-3" /></Link>
      </section>
    </div>
  );
}
