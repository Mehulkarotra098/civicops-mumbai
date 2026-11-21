import { requirePageUser } from '@/lib/session';
import { getDb, withSystem, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { PageHeader } from '@/components/ui';
import { WardMap } from '@/components/WardMap';

export default async function WardMapPage() {
  const user = await requirePageUser(['officer', 'ward_admin', 'super_admin']);
  const db = await getDb();
  const { wards, mine } = await withUser(user, async (q) => ({
    wards: (await q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select ward_code, ward_name, boundary_geojson from wards')).rows,
    mine: (await q.query<{ ward_code: string }>('select distinct ward_code from memberships where user_id = $1', [user.id])).rows.map((r) => r.ward_code),
  }), db);
  const tickets = (await withUser(user, (q) => q.query<TicketRow>(`select * from tickets where status not in ('cancelled','duplicate') and lat is not null`), db)).rows;
  const hotspots = (await withSystem((q) => q.query<{ name: string; lat: number; lon: number; ward_code: string }>('select name, lat, lon, ward_code from flood_hotspots'), db)).rows;
  return (
    <div>
      <PageHeader title="Ward map" kicker={mine.length ? `Your wards: ${mine.join(', ')}` : 'All wards'}>Coloured dots are tickets you can see (red critical, yellow medium, orange standard, green verified). Blue dots are known flood hotspots from the dataset. Select a dot to open it.</PageHeader>
      <WardMap wards={wards.map((w) => ({ code: w.ward_code, name: w.ward_name, polygon: w.boundary_geojson.coordinates[0] }))} highlight={mine.length === 1 ? mine[0] : null}
        points={[...hotspots.filter((h) => !mine.length || mine.includes(h.ward_code)).map((h) => ({ lat: h.lat, lon: h.lon, label: `Flood hotspot: ${h.name}`, tone: 'hotspot' as const })),
          ...tickets.map((t) => ({ lat: t.lat as number, lon: t.lon as number, label: `${t.ref} · ${t.title} · ${t.status}`, href: `/tickets/${t.ref}`, tone: (t.status === 'verified_resolved' ? 'ok' : t.priority === 'critical' ? 'crit' : t.priority === 'medium' ? 'med' : 'std') as 'ok' }))]}
        height={620} />
    </div>
  );
}
