import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem, withUser } from '@/lib/db';
import { currentUser } from '@/lib/session';
import type { TicketRow } from '@/lib/tickets';
import { loadHistory, moneyTrail } from '@/lib/history';
import { activeClock } from '@/lib/sla';
import { inr } from '@/lib/time';
import { Kpi, PageHeader, SyntheticNote } from '@/components/ui';
import { WardMap } from '@/components/WardMap';
import { CATEGORY_BY_CODE } from '@/lib/config';

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

  return (
    <div className="space-y-6">
      <PageHeader kicker={`${String(w.zone)} · ${String(w.office_name)}`} title={`Ward ${code} · ${d.w.ward_name}`} actions={user && user.role !== 'resident' ? <Link className="btn-primary" href={`/ward?ward=${encodeURIComponent(code)}`}>Open ward board</Link> : <Link className="btn-primary" href="/report">Report an issue here</Link>}>
        Population ~{Number(w.population_est).toLocaleString('en-IN')} · {String(w.engineering_crews)} engineering crews · low-lying index {String(w.low_lying_index)} · {Number(w.approx_area_km2)} km²
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <WardMap wards={d.all.map((x) => ({ code: x.ward_code, name: x.ward_name, polygon: x.boundary_geojson.coordinates[0] }))} highlight={code}
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Budget (Jun–Sep 2025)" value={inr(d.trail.budget_inr_2025)} />
          <Kpi label="Spent in period" value={inr(d.trail.spend)} sub={`${Math.round((d.trail.utilisation ?? 0) * 100)}% used`} tone={(d.trail.utilisation ?? 0) > 1 ? 'crit' : undefined} href={`/accountability?ward=${encodeURIComponent(code)}`} />
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
