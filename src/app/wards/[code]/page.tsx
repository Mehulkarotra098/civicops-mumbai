import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem, withUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import type { TicketRow } from '@/lib/tickets';
import { loadHistory, moneyTrail, BUDGET_PERIOD } from '@/lib/history';
import { questionedByWorkOrder } from '@/lib/figures';
import { activeClock } from '@/lib/sla';
import { inr, inrShort } from '@/lib/time';
import { Kpi, PageHeader, SyntheticNote } from '@/components/ui';
import { WardMap } from '@/components/WardMap';
import { CATEGORY_BY_CODE } from '@/lib/config';
import { Icon } from '@/components/icons';
import { Ring } from '@/components/charts/Ring';
import { TrailLine } from '@/components/charts/TrailLine';

export default async function WardPage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code);
  const db = await getDb();
  const user = await currentUser();
  const d = await withSystem(async (q) => {
    const w = (await q.query<Record<string, unknown> & { ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select * from wards where ward_code = $1', [code])).rows[0];
    if (!w) return null;
    const all = (await q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select ward_code, ward_name, boundary_geojson from wards')).rows;
    const roads = (await q.query<{ road_id: string; geometry: { coordinates: number[][] }; under_dlp: boolean }>('select road_id, geometry, under_dlp from roads where ward_code = $1', [code])).rows;
    const hotspots = (await q.query<{ name: string; lat: number; lon: number; years_flagged_last_5: number }>('select name, lat, lon, years_flagged_last_5 from flood_hotspots where ward_code = $1', [code])).rows;
    const locs = (await q.query<{ name: string; aliases: string[] }>('select name, aliases from localities where ward_code = $1 order by name', [code])).rows;
    const h = await loadHistory(q);
    const recurring = (await q.query<{ mapped_category: string; locality_text: string; n: number }>(
      `select mapped_category, locality_text, count(*)::int as n from hist_complaints where ward_code = $1 and status <> 'Closed - Duplicate' group by 1,2 having count(*) >= 8 order by n desc limit 8`, [code])).rows;
    return { w, all, roads, hotspots, locs, trail: moneyTrail(h, code)[0], h, recurring };
  }, db);
  if (!d) notFound();
  // Live tickets: only what the viewer may see (RLS). Signed-out visitors see none.
  const tickets = user ? (await withUser(user, (q) => q.query<TicketRow>('select * from tickets where ward_code = $1', [code]), db)).rows : [];
  const now = new Date();
  const active = tickets.filter((t) => !['verified_resolved', 'cancelled', 'duplicate', 'referred'].includes(t.status));
  const byDept = Object.entries(active.reduce<Record<string, number>>((m, t) => { const k = t.department_code ?? 'triage'; m[k] = (m[k] ?? 0) + 1; return m; }, {}));
  const jobs = d.h.wos.filter((w) => w.ward_code === code);
  const w = d.w as Record<string, unknown>;
  const usedPct = d.trail.budget_inr_2025 ? (d.trail.spend / d.trail.budget_inr_2025) * 100 : 0;
  const over = usedPct > 100;
  const qd = questionedByWorkOrder(d.h.flags.filter((f) => f.ward_code === code));
  const noProof = d.h.flags.filter((f) => f.ward_code === code && f.type === 'incomplete_evidence').length;

  return (
    <div className="space-y-6">
      <PageHeader kicker={`${String(w.zone)} · ${String(w.office_name)}`} title={`Ward ${code} · ${d.w.ward_name}`} actions={user && user.role !== 'resident' ? <Link className="btn-primary" href={`/ward?ward=${encodeURIComponent(code)}`}><span className="inline-flex items-center gap-2 text-white">Open ward board</span></Link> : <Link className="btn-primary" href="/report"><span className="inline-flex items-center gap-2 text-white">Report an issue here</span></Link>}>
        Population ~{Number(w.population_est).toLocaleString('en-IN')} · {String(w.engineering_crews)} engineering crews · low-lying index {String(w.low_lying_index)} · {Number(w.approx_area_km2)} km²
      </PageHeader>
      {/* Focal: budget used this monsoon */}
      <section className={`card overflow-hidden ${over ? 'border-red-200' : ''}`} aria-labelledby="budget-h">
        <div className={`grid gap-5 p-5 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center ${over ? 'bg-linear-to-br from-crit-soft to-white' : 'bg-linear-to-br from-action-soft/60 to-white'}`}>
          <div className="flex justify-center">
            <Ring pct={usedPct} size={160} label={`Ward ${code}: billed ${inr(d.trail.spend)} of ${inr(d.trail.budget_inr_2025)} (${Math.round(usedPct)}%)`}>
              <span className={`text-4xl font-extrabold tnum ${over ? 'text-crit' : ''}`}>{Math.round(usedPct)}%</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">of budget billed</span>
            </Ring>
          </div>
          <div className="min-w-0">
            <div className="kicker">Monsoon road-repair budget · {BUDGET_PERIOD.label}</div>
            <h2 id="budget-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{over ? `Billed ${inrShort(d.trail.spend - d.trail.budget_inr_2025)} past the approved budget` : `${inrShort(d.trail.budget_inr_2025 - d.trail.spend)} of the budget is left`}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-white p-3"><div className="kicker">Approved</div><div className="text-lg font-extrabold tnum">{inrShort(d.trail.budget_inr_2025)}</div></div>
              <div className="rounded-xl border border-line bg-white p-3"><div className="kicker">Billed</div><div className={`text-lg font-extrabold tnum ${over ? 'text-crit' : ''}`}>{inrShort(d.trail.spend)}</div><div className="text-xs text-muted tnum">{d.trail.jobs} work orders</div></div>
              <div className="rounded-xl border border-line bg-white p-3"><div className="kicker">Failed fixes</div><div className="text-lg font-extrabold text-med tnum">{inrShort(d.trail.failed_fix_spend)}</div><div className="text-xs text-muted">reopened in 30 days</div></div>
              <div className="rounded-xl border border-line bg-white p-3"><div className="kicker">Paid</div><div className="text-sm font-semibold text-muted">Not published in the dataset</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-primary btn-sm" href={`/spending/ward/${encodeURIComponent(code)}`}><span className="inline-flex items-center gap-2 text-white"><Icon name="rupee" className="h-4 w-4" />Follow this ward&apos;s money</span></Link>
              <Link className="btn-secondary btn-sm" href={`/accountability?tab=rupee&ward=${encodeURIComponent(code)}`}>Next-rupee plan</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-line p-5 sm:p-6">
          <TrailLine label={`Money path for Ward ${code}`} steps={[
            { key: 'b', label: 'Approved budget', value: inrShort(d.trail.budget_inr_2025), sub: 'No revisions on record', state: 'done' },
            { key: 'w', label: 'Work orders', value: String(d.trail.jobs), sub: `${d.trail.jobs_outside_period} more after the period`, state: 'done', href: `/spending/ward/${encodeURIComponent(code)}#orders` },
            { key: 'bill', label: 'Bills', value: inrShort(d.trail.spend), sub: 'Paid: not published in the dataset', state: over ? 'crit' : 'done' },
            { key: 'e', label: 'Evidence', value: `${noProof} with no proof`, sub: `${jobs.filter((j) => j.reopened_within_30d).length} repairs reopened`, state: noProof ? 'warn' : 'done' },
            { key: 'r', label: 'Review', value: inrShort(qd.total), sub: `${qd.workOrders} work orders questioned`, state: qd.total ? 'crit' : 'done', href: `/spending/cases?ward=${encodeURIComponent(code)}` },
          ]} />
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <WardMap wards={d.all.filter((x) => x.boundary_geojson?.coordinates?.[0]).map((x) => ({ code: x.ward_code, name: x.ward_name, polygon: x.boundary_geojson.coordinates[0] }))} highlight={code}
          roads={d.roads.filter((r) => r.geometry).map((r) => ({ id: r.road_id, coords: r.geometry.coordinates, dlp: r.under_dlp }))}
          points={[...d.hotspots.map((h) => ({ lat: h.lat, lon: h.lon, label: `Flood hotspot: ${h.name} (${h.years_flagged_last_5}/5 years)`, tone: 'hotspot' as const })),
            ...tickets.filter((t) => t.lat != null).map((t) => ({ lat: t.lat as number, lon: t.lon as number, label: `${t.ref} ${t.title}`, tone: (t.status === 'verified_resolved' ? 'ok' : t.priority === 'critical' ? 'crit' : t.priority === 'medium' ? 'med' : 'std') as 'ok', href: `/tickets/${t.ref}` }))]}
          height={440} label={`Map of Ward ${code} with roads, flood hotspots and tickets`} />
        <div className="space-y-3">
          <h2 className="h2">Live workload (CivicOps tickets)</h2>
          {user ? (
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Active tickets" value={active.length} href={user.role !== 'resident' ? `/ward?ward=${encodeURIComponent(code)}` : undefined} />
              <Kpi label="Overdue" value={active.filter((t) => activeClock(t, now).state === 'overdue').length} tone="crit" href={user.role !== 'resident' ? `/ward?ward=${encodeURIComponent(code)}&tab=overdue` : undefined} />
              <div className="card col-span-2 p-4 text-sm"><div className="kicker">Workload by department</div><ul className="mt-2 space-y-1">{byDept.length ? byDept.map(([k, n]) => <li key={k} className="flex justify-between"><span>{k}</span><b>{n}</b></li>) : <li className="text-muted">No active tickets you can see.</li>}</ul></div>
            </div>
          ) : <p className="text-sm text-muted">Sign in to see live tickets you have access to.</p>}
          <h2 className="h2 pt-2">Localities</h2>
          <p className="text-sm">{d.locs.map((l) => l.name + (l.aliases.length ? ` (${l.aliases.join(', ')})` : '')).join(' · ')}</p>
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="h2">Historical context · synthetic 2025 monsoon</h2>
        <SyntheticNote>Separate from live workload: these are imported historical records with their own SLA policy.</SyntheticNote>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi label="Repair jobs" value={jobs.length} sub={`${Math.round((jobs.filter((j) => j.sla_met).length / Math.max(1, jobs.length)) * 100)}% met SLA`} href={`/accountability?tab=flags&ward=${encodeURIComponent(code)}`} />
          <Kpi label="Reopened in 30 days" value={jobs.filter((j) => j.reopened_within_30d).length} sub={inr(d.trail.failed_fix_spend) + ' spent on failed fixes'} tone="med" />
          <Kpi label="Next rupee" value="Plan" sub="Ranked by risk" href={`/accountability?tab=rupee&ward=${encodeURIComponent(code)}`} />
        </div>
        {d.recurring.length ? (
          <div className="card p-4 text-sm"><h3 className="font-semibold">Recurring problem spots (8+ complaints, duplicates excluded)</h3>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">{d.recurring.map((r) => <li key={r.mapped_category + r.locality_text}>{r.locality_text}: <b>{r.n}</b> {CATEGORY_BY_CODE[r.mapped_category]?.short ?? r.mapped_category} complaints</li>)}</ul></div>
        ) : null}
      </section>
    </div>
  );
}
