import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { loadHistory, moneyTrail, scorecards } from '@/lib/history';
import { formatIST } from '@/lib/time';
import { CategoryIcon, Empty, Meter, PageHeader, PriorityBadge, ProgressRing, StatusBadge, SyntheticNote, type RingTone } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

function Tile({ label, value, of, tone = 'action', href, sub, icon }: { label: string; value: number; of: number; tone?: RingTone; href: string; sub: string; icon: string }) {
  const pct = of ? (value / of) * 100 : 0;
  return (
    <Link href={href} className="card group flex min-w-0 flex-col items-start gap-2 p-3 transition-shadow sm:flex-row sm:items-center sm:gap-3 sm:p-4 duration-200 hover:border-action hover:shadow-[var(--shadow-2)] motion-reduce:transition-none">
      <ProgressRing pct={pct} size={56} stroke={6} tone={value ? tone : 'muted'} label={`${label}: ${value} of ${of}`}><Icon name={icon} className={`h-5 w-5 ${value && tone === 'crit' ? 'text-crit' : value && tone === 'ok' ? 'text-ok' : 'text-action'}`} /></ProgressRing>
      <div className="min-w-0">
        <div className={`tnum text-2xl font-extrabold tracking-tight ${value && tone === 'crit' ? 'text-crit' : value && tone === 'ok' ? 'text-ok' : 'text-ink'}`}>{value}</div>
        <div className="text-sm font-semibold leading-tight">{label}</div>
        <div className="tnum text-xs text-muted">{sub}</div>
      </div>
    </Link>
  );
}

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
  const last24 = tickets.filter((t) => now.getTime() - new Date(t.submitted_at).getTime() < 86_400_000).length;
  const wards = [...new Set(tickets.map((t) => t.ward_code).filter(Boolean))].sort() as string[];
  const trail = moneyTrail(hist);
  const cards = scorecards(hist);
  const wardRows = trail.map((w) => {
    const tw = tickets.filter((t) => t.ward_code === w.ward_code);
    const ver = tw.filter((t) => t.status === 'verified_resolved');
    const jobs = hist.wos.filter((x) => x.ward_code === w.ward_code);
    return {
      code: w.ward_code, hasLive: wards.includes(w.ward_code),
      active: tw.filter((t) => active.includes(t)).length, overdue: tw.filter((t) => overdue.includes(t)).length, escalated: tw.filter((t) => escalated.includes(t)).length,
      verified: ver.length, within: ver.length ? Math.round((ver.filter((t) => t.sla_outcome === 'met').length / ver.length) * 100) : null,
      jobs: jobs.length, slaMet: jobs.length ? Math.round((jobs.filter((j) => j.sla_met).length / jobs.length) * 100) : null,
      reopen: jobs.length ? Math.round((jobs.filter((j) => j.reopened_within_30d).length / jobs.length) * 100) : null,
      used: w.utilisation != null ? Math.round(w.utilisation * 100) : null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Super admin · all wards" title="Command centre" actions={<AutoRefresh />}>Escalations, evidence waiting for a decision, and how each ward is doing. Every tile opens the records behind it.</PageHeader>

      <section aria-label="Live operations" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Tile label="Active tickets" value={active.length} of={tickets.length || 1} href="/ward" sub={`${last24} reported in last 24 h`} icon="list" />
        <Tile label="Escalations" value={escalated.length} of={active.length} tone="crit" href="#escalations" sub="Missed first action or resolution" icon="alert" />
        <Tile label="Overdue now" value={overdue.length} of={active.length} tone="crit" href="/ward?tab=overdue" sub={`of ${active.length} active`} icon="clock" />
        <Tile label="Awaiting verification" value={awaiting.length} of={active.length} href="/admin/review" sub="Evidence to review" icon="zoom" />
        <Tile label="Triage queue" value={triage.length} of={active.length} tone="med" href="/admin/triage" sub="Ward or team unclear" icon="transfer" />
        <Tile label="Verified resolved" value={verified.length} of={verified.length || 1} tone="ok" href="/ward?status=verified_resolved" sub={verified.length ? `${Math.round((met / verified.length) * 100)}% within deadline` : 'None yet'} icon="checkCircle" />
        <Tile label="Reopened" value={reopened.length} of={tickets.length || 1} tone="med" href="/ward?reopened=1" sub="Problem came back" icon="history" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-5" aria-labelledby="new-h">
          <h2 id="new-h" className="h2 flex items-center gap-2"><Icon name="sparkle" className="h-5 w-5 text-action" />New reports</h2>
          <p className="mt-1 text-sm text-muted">Newest first, across all wards.</p>
          {tickets.length ? (
            <ul className="mt-3 grid gap-2">
              {tickets.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.ref}`} className="flex min-h-11 items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-action motion-reduce:transition-none">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action-soft text-action"><CategoryIcon code={t.category_code} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5"><span className="tnum font-mono text-xs font-bold text-action">{t.ref}</span><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></span>
                      <span className="mt-0.5 block truncate text-sm font-semibold">{t.title}</span>
                      <span className="tnum block text-xs text-muted">{t.in_triage ? 'Triage queue' : `Ward ${t.ward_code ?? '—'} · ${t.department_code ?? '—'}`} · {formatIST(t.submitted_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="mt-3"><Empty title="No reports yet" /></div>}
        </section>

        <div className="space-y-6">
          <section id="escalations" className="card p-5" aria-labelledby="esc-h">
            <h2 id="esc-h" className="h2 flex items-center gap-2"><Icon name="alert" className="h-5 w-5 text-crit" />Escalation inbox <span className="tnum chip border-red-200 bg-crit-soft text-crit">{escalated.length}</span></h2>
            {escalated.length ? (
              <ul className="mt-3 grid gap-2">
                {escalated.map((t) => {
                  const c = activeClock(t, now);
                  return (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.ref}`} className="block rounded-xl border border-red-200 bg-crit-soft/60 p-3 hover:border-crit">
                        <span className="flex flex-wrap items-center gap-1.5"><span className="tnum font-mono text-xs font-bold">{t.ref}</span><PriorityBadge priority={t.priority} /><span className="text-xs text-muted">Ward {t.ward_code} · {t.department_code}</span></span>
                        <span className="mt-0.5 block text-sm font-semibold">{t.title}</span>
                        <span className="tnum mt-0.5 flex items-center gap-1 text-xs font-semibold text-crit"><Icon name="clock" className="h-3.5 w-3.5" />{t.escalation_level >= 2 ? 'Resolution deadline missed' : 'First-action deadline missed'} · was due {formatIST(c.dueAt)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <div className="mt-3"><Empty title="No escalations">Every ticket is inside its deadline.</Empty></div>}
          </section>
          <section className="card p-5" aria-labelledby="rev-h">
            <h2 id="rev-h" className="h2 flex items-center gap-2"><Icon name="zoom" className="h-5 w-5 text-action" />Awaiting verification <span className="tnum chip border-violet-200 bg-violet-50 text-violet-800">{awaiting.length}</span></h2>
            {awaiting.length ? (
              <ul className="mt-3 grid gap-2">
                {awaiting.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <div className="min-w-0"><span className="tnum font-mono text-xs font-bold">{t.ref}</span><div className="text-sm font-semibold">{t.title}</div><div className="tnum text-xs text-muted">Sent for review {formatIST(t.completion_submitted_at)}</div></div>
                    <Link href={`/admin/review/${t.ref}`} className="btn-primary btn-sm min-h-11"><Icon name="zoom" />Review evidence</Link>
                  </li>
                ))}
              </ul>
            ) : <div className="mt-3"><Empty title="Nothing waiting" /></div>}
          </section>
        </div>
      </div>

      <section className="card p-5" aria-labelledby="perf-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="perf-h" className="h2">Ward performance</h2>
            <p className="mt-1 text-sm text-muted">Live tickets in CivicOps on top; <b>2025 historical context</b> (synthetic monsoon records, a different system) underneath.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-red-300 bg-crit-soft" />Has overdue tickets</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-teal-200 bg-teal-50" />Live tickets</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-line bg-white" />No live tickets</span>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
          {wardRows.map((w) => (
            <li key={w.code} className={`min-w-0 rounded-xl border p-3 ${w.overdue ? 'border-red-300 bg-crit-soft/70' : w.hasLive ? 'border-teal-200 bg-teal-50/60' : 'border-line bg-white'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <Link className="text-lg font-extrabold tracking-tight text-action underline-offset-2 hover:underline" href={`/wards/${encodeURIComponent(w.code)}`}>{w.code}</Link>
                {w.hasLive ? <Link className="tnum text-xs font-semibold underline" href={`/ward?ward=${encodeURIComponent(w.code)}`}>{w.active} active</Link> : <span className="text-xs text-muted">0 active</span>}
              </div>
              <div className="tnum mt-1 flex flex-wrap gap-x-2 text-xs">
                {w.overdue ? <span className="flex items-center gap-0.5 font-semibold text-crit"><Icon name="clock" className="h-3 w-3" />{w.overdue} overdue</span> : null}
                {w.escalated ? <span className="flex items-center gap-0.5 font-semibold text-crit"><Icon name="alert" className="h-3 w-3" />{w.escalated} escalated</span> : null}
                {w.verified ? <span className="flex items-center gap-0.5 text-ok"><Icon name="checkCircle" className="h-3 w-3" />{w.verified} verified</span> : null}
              </div>
              <div className="mt-2 space-y-1.5 text-[11px] text-muted">
                <div><div className="tnum flex justify-between"><span>2025 SLA met</span><b className="text-ink">{w.slaMet != null ? `${w.slaMet}%` : '—'}</b></div><Meter pct={w.slaMet ?? 0} tone={w.slaMet != null && w.slaMet < 60 ? 'med' : 'ok'} label={`Ward ${w.code} 2025 SLA met ${w.slaMet ?? 0}%`} className="h-1.5" /></div>
                <div><div className="tnum flex justify-between"><span>2025 budget used</span><b className={w.used != null && w.used > 100 ? 'text-crit' : 'text-ink'}>{w.used != null ? `${w.used}%` : '—'}</b></div><Meter pct={w.used ?? 0} tone={w.used != null && w.used > 100 ? 'crit' : 'action'} label={`Ward ${w.code} 2025 budget used ${w.used ?? 0}%`} className="h-1.5" /></div>
              </div>
            </li>
          ))}
        </ul>
        <details className="mt-4 rounded-xl border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">Show records table</summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="table">
              <thead><tr><th>Ward</th><th>Active</th><th>Overdue</th><th>Escalated</th><th>Verified</th><th>Within deadline</th><th className="border-l border-line">2025 jobs</th><th>2025 SLA met</th><th>2025 reopened</th><th>2025 budget used</th></tr></thead>
              <tbody>
                {wardRows.map((w) => (
                  <tr key={w.code}>
                    <td><Link className="font-semibold text-action underline" href={`/wards/${encodeURIComponent(w.code)}`}>{w.code}</Link></td>
                    <td>{w.hasLive ? <Link className="underline" href={`/ward?ward=${encodeURIComponent(w.code)}`}>{w.active}</Link> : 0}</td>
                    <td className={w.overdue ? 'font-semibold text-crit' : ''}>{w.overdue}</td>
                    <td>{w.escalated}</td>
                    <td>{w.verified}</td>
                    <td>{w.within != null ? `${w.within}%` : '—'}</td>
                    <td className="border-l border-line"><Link className="underline" href={`/accountability?ward=${encodeURIComponent(w.code)}`}>{w.jobs}</Link></td>
                    <td>{w.slaMet != null ? `${w.slaMet}%` : '—'}</td>
                    <td>{w.reopen != null ? `${w.reopen}%` : '—'}</td>
                    <td className={w.used != null && w.used > 100 ? 'font-semibold text-crit' : ''}>{w.used != null ? `${w.used}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <div className="mt-3"><SyntheticNote /></div>
      </section>

      <section className="card p-5">
        <h2 className="h2">Contractor scorecards (historical, synthetic)</h2>
        <p className="mt-1 text-sm text-muted">Fair comparisons: durability is compared with what is expected for the repair methods each contractor used, and speed is also shown excluding heavy-rain days.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {cards.slice(0, 4).map((c) => <Link key={c.contractor_id} href={`/accountability/contractors/${c.contractor_id}`} className="flex gap-3 rounded-xl border border-line p-3 text-sm hover:border-action"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action-soft text-action"><Icon name="wrench" className="h-4 w-4" /></span><span><b>{c.contractor_name}</b><span className="mt-1 block text-muted">{c.summary}</span></span></Link>)}
        </div>
        <Link href="/accountability#contractors" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action">All 8 scorecards <Icon name="arrowRight" className="h-3 w-3" /></Link>
      </section>
    </div>
  );
}
