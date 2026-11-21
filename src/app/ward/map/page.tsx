import { requirePageUser } from '@/lib/session';
import { getDb, withSystem, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { PageHeader } from '@/components/ui';
import MumbaiMap from '@/components/MumbaiMap';

export default async function WardMapPage() {
  const user = await requirePageUser(['officer', 'ward_admin', 'super_admin']);
  const db = await getDb();
  const { wards, mine } = await withUser(user, async (q) => ({
    wards: (await q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select ward_code, ward_name, boundary_geojson from wards order by ward_code')).rows,
    mine: (await q.query<{ ward_code: string }>('select distinct ward_code from memberships where user_id = $1', [user.id])).rows.map((r) => r.ward_code),
  }), db);
  // Row-level security limits this to the tickets the signed-in staff member may see (their ward).
  const tickets = (await withUser(user, (q) => q.query<TicketRow>(`select * from tickets where status not in ('cancelled','duplicate') and lat is not null`), db)).rows;
  const hotspots = (await withSystem((q) => q.query<{ name: string; lat: number; lon: number; ward_code: string }>('select name, lat, lon, ward_code from flood_hotspots where lat is not null'), db)).rows;
  const now = Date.now();
  const points = tickets.map((t) => {
    const r = t as unknown as { ref: string; lat: number; lon: number; priority: string; status: string; title: string; resolution_due_at?: string | Date | null; sla_stopped_at?: unknown };
    const due = r.resolution_due_at ? new Date(r.resolution_due_at).getTime() : null;
    return {
      id: r.ref, lat: Number(r.lat), lon: Number(r.lon), priority: r.priority, status: r.status, href: `/tickets/${r.ref}`,
      overdue: r.status !== 'verified_resolved' && !r.sla_stopped_at && due != null && due < now,
      label: `${r.ref} · ${r.title}`,
    };
  });
  const counts = {
    open: points.filter((p) => p.status !== 'verified_resolved').length,
    critical: points.filter((p) => p.status !== 'verified_resolved' && p.priority === 'critical').length,
    overdue: points.filter((p) => p.overdue).length,
    verified: points.filter((p) => p.status === 'verified_resolved').length,
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Ward map" kicker={mine.length ? `Your wards: ${mine.join(', ')}` : 'All wards'}>
        Every ticket you can see, grouped when they are close together. Select a group to zoom in; select a dot to open the ticket.
      </PageHeader>
      <div className="flex flex-wrap gap-2" aria-label="Tickets on this map">
        {([['Open', counts.open, 'border-line bg-white text-ink'], ['Critical', counts.critical, 'border-red-200 bg-crit-soft text-crit'], ['Overdue', counts.overdue, 'border-red-200 bg-crit-soft text-crit'], ['Verified fixed', counts.verified, 'border-green-200 bg-ok-soft text-ok']] as const).map(([l, n, cls]) => (
          <span key={l} className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 text-sm font-semibold ${cls}`}><span className="tnum text-base font-extrabold">{n}</span>{l}</span>
        ))}
      </div>
      <div className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-line shadow-sm lg:h-[max(520px,calc(100vh-250px))]">
        <MumbaiMap
          wards={wards.filter((w) => w.boundary_geojson?.coordinates?.[0]).map((w) => ({ code: w.ward_code, name: w.ward_name, polygon: w.boundary_geojson.coordinates[0] as [number, number][] }))}
          selectedWard={mine.length === 1 ? mine[0] : null}
          points={points}
          pointsLabel="Tickets"
          layers={[{ id: 'flood', label: 'Flood hotspots', kind: 'points', color: '#2563eb', defaultOn: true,
            features: hotspots.filter((h) => !mine.length || mine.includes(h.ward_code)).map((h) => ({ lat: Number(h.lat), lon: Number(h.lon), label: `Flood hotspot: ${h.name}` })) }]}
          height="100%"
          ariaLabel="Map of the tickets you can see, with flood hotspots"
        />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {([['#b42318', 'Critical'], ['#d4a000', 'Medium'], ['#d4570b', 'Standard'], ['#067647', 'Verified fixed'], ['#0f1b33', 'Group of tickets (red ring = includes critical or overdue)']] as const).map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: c }} aria-hidden />{l}</span>
        ))}
      </p>
    </div>
  );
}
