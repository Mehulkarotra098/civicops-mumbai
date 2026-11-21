import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { loadHistory } from '@/lib/history';
import { formatDateIST, inr } from '@/lib/time';
import { PageHeader, SyntheticNote } from '@/components/ui';

export default async function RoadHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await withSystem(async (q) => {
    const h = await loadHistory(q);
    const road = h.roads.get(id);
    if (!road) return null;
    const traffic = (await q.query<{ congestion_index: number; peak_hour_vehicles: number }>('select congestion_index, peak_hour_vehicles from road_traffic where road_id = $1', [id])).rows[0];
    const acc = (await q.query<{ accident_id: string; occurred_at: Date; severity: string; probable_cause: string }>('select accident_id, occurred_at, severity, probable_cause from hist_accidents where road_id = $1 order by occurred_at', [id])).rows;
    const fac = (await q.query<{ name: string; type: string }>('select name, type from facilities where ambulance_entry_road = $1', [id])).rows;
    return { h, road, traffic, acc, fac, jobs: h.wos.filter((w) => w.road_id === id), flags: h.flags.filter((f) => h.wos.find((w) => w.work_order_id === f.work_order_id)?.road_id === id) };
  }, await getDb());
  if (!d) notFound();
  const { road, jobs } = d;
  return (
    <div className="space-y-5">
      <PageHeader kicker={`Road segment ${road.road_id} · Ward ${road.ward_code}`} title={`${road.road_name}, segment ${road.segment_no}`}>
        {road.road_type} · {road.surface} · {road.lanes} lanes · {road.length_m} m{road.bus_route ? ' · bus route' : ''} · last resurfaced {road.last_resurfaced ? formatDateIST(road.last_resurfaced) : '—'} · {road.under_dlp ? 'under defect liability (original contractor repairs free)' : 'not under DLP'}
      </PageHeader>
      <SyntheticNote>Synthetic segment geometry; the road name is real and used only for realism.</SyntheticNote>
      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="card p-4"><div className="kicker">Repairs this monsoon</div><div className="text-2xl font-bold">{jobs.length}</div><div className="text-muted">{inr(jobs.reduce((s, j) => s + j.cost_inr, 0))} billed · {jobs.filter((j) => j.reopened_within_30d).length} reopened</div></div>
        <div className="card p-4"><div className="kicker">Traffic</div><div className="text-2xl font-bold">{d.traffic?.congestion_index ?? '—'}/10</div><div className="text-muted">{d.traffic?.peak_hour_vehicles?.toLocaleString('en-IN') ?? '—'} vehicles at peak</div></div>
        <div className="card p-4"><div className="kicker">Safety</div><div className="text-2xl font-bold">{d.acc.length}</div><div className="text-muted">accidents 2024–25{d.fac.length ? ` · ambulance route to ${d.fac.map((f) => f.name).join(', ')}` : ''}</div></div>
      </div>
      <section className="card overflow-x-auto">
        <table className="table"><thead><tr><th>Work order</th><th>Type</th><th>Method</th><th>Contractor</th><th>Completed</th><th>Bill</th><th>× rate</th><th>Reopened</th></tr></thead>
          <tbody>{jobs.map((x) => <tr key={x.work_order_id}><td><Link className="font-mono text-action underline" href={`/accountability/work-orders/${x.work_order_id}`}>{x.work_order_id}</Link></td><td>{x.work_type}</td><td>{x.repair_method}</td><td>{x.contractor_id}</td><td className="whitespace-nowrap">{formatDateIST(x.completed_at)}</td><td>{inr(x.cost_inr)}</td><td>{x.cost_ratio.toFixed(2)}</td><td>{x.reopened_within_30d ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
      </section>
      {d.acc.length ? <section className="card p-4 text-sm"><h2 className="h2">Accidents on this segment</h2><ul className="mt-2 space-y-1">{d.acc.map((a) => <li key={a.accident_id}>{formatDateIST(a.occurred_at)} · {a.severity} · {a.probable_cause}</li>)}</ul></section> : null}
    </div>
  );
}
