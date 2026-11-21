import { getDb, withSystem } from '@/lib/db';
import { PageHeader, SyntheticNote } from '@/components/ui';
import { WardsRealMap, type ExplorerWard, type ExplorerHotspot, type ExplorerRoad } from '@/components/WardsRealMap';
import { loadHistory, moneyTrail, MONEY_FLAGS } from '@/lib/history';
import { questionedByWorkOrder } from '@/lib/figures';

type Geo = { coordinates?: unknown[]; type?: string } | null;
function lineCoords(g: Geo, fallback: [number, number][]): [number, number][] {
  const c = g?.coordinates;
  if (g?.type === 'LineString' && Array.isArray(c) && c.length >= 2) return (c as number[][]).map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
  if (g?.type === 'MultiLineString' && Array.isArray(c?.[0])) return (c[0] as number[][]).map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
  return fallback;
}

export default async function Wards({ searchParams }: { searchParams: Promise<{ q?: string; ward?: string; layer?: string }> }) {
  const { q = '', ward = '', layer = '' } = await searchParams;
  const db = await getDb();
  const data = await withSystem(async (tx) => {
    const rows = (await tx.query<{ ward_code: string; ward_name: string; zone: string; office_name: string; engineering_crews: number; budget_inr_2025: number; localities_text: string; centroid_lat: number; centroid_lon: number; boundary_geojson: { coordinates: number[][][] }; aliases: string | null }>(
      `select w.ward_code, w.ward_name, w.zone, w.office_name, w.engineering_crews, w.budget_inr_2025, w.localities_text, w.centroid_lat, w.centroid_lon, w.boundary_geojson,
              (select string_agg(l.name || ' ' || array_to_string(l.aliases, ' '), ' ') from localities l where l.ward_code = w.ward_code) as aliases
       from wards w order by w.ward_code`)).rows;
    const h = await loadHistory(tx);
    const trail = moneyTrail(h);
    const questioned = questionedByWorkOrder(h.flags);
    const qByWard = new Map<string, { amount: number; bills: number }>();
    for (const f of questioned.perWorkOrder.values()) {
      const e = qByWard.get(f.ward_code) ?? { amount: 0, bills: 0 };
      e.amount += f.amount_at_issue; e.bills++;
      qByWard.set(f.ward_code, e);
    }
    const flagsByWard = new Map<string, number>();
    for (const f of h.flags) if (MONEY_FLAGS.includes(f.type)) flagsByWard.set(f.ward_code, (flagsByWard.get(f.ward_code) ?? 0) + 1);
    // Aggregate counts only: no reporter details or individual tickets on this public page.
    const open = new Map((await tx.query<{ ward_code: string; n: number; crit: number }>(
      `select ward_code, count(*)::int as n, count(*) filter (where priority = 'critical')::int as crit from tickets
       where status not in ('verified_resolved','cancelled','duplicate','referred') and ward_code is not null group by ward_code`)).rows.map((r) => [r.ward_code, r]));
    const hotspots = (await tx.query<{ hotspot_id: string; name: string; ward_code: string; lat: number; lon: number; avg_water_depth_cm: number | null; years_flagged_last_5: number | null }>(
      'select hotspot_id, name, ward_code, lat, lon, avg_water_depth_cm, years_flagged_last_5 from flood_hotspots where lat is not null and lon is not null')).rows;
    const roads = (await tx.query<{ road_id: string; road_name: string; ward_code: string; start_lat: number; start_lon: number; end_lat: number; end_lon: number; geometry: Geo; under_dlp: boolean }>(
      'select road_id, road_name, ward_code, start_lat, start_lon, end_lat, end_lon, geometry, under_dlp from roads')).rows;
    const jobsByRoad = new Map<string, { jobs: number; reopened: number }>();
    for (const w of h.wos) {
      const e = jobsByRoad.get(w.road_id) ?? { jobs: 0, reopened: 0 };
      e.jobs++; if (w.reopened_within_30d) e.reopened++;
      jobsByRoad.set(w.road_id, e);
    }
    return { rows, trail, qByWard, flagsByWard, open, hotspots, roads, jobsByRoad };
  }, db);

  const wards: ExplorerWard[] = data.rows.filter((w) => w.boundary_geojson?.coordinates?.[0]).map((w) => {
    const t = data.trail.find((x) => x.ward_code === w.ward_code);
    const ring = w.boundary_geojson.coordinates[0] as unknown as [number, number][];
    const o = data.open.get(w.ward_code);
    return {
      code: w.ward_code, name: w.ward_name, zone: w.zone, office: w.office_name, crews: w.engineering_crews,
      centroid: [Number(w.centroid_lat), Number(w.centroid_lon)] as [number, number], polygon: ring,
      budget: Number(w.budget_inr_2025), spend: t?.spend ?? 0, utilisation: t?.utilisation ?? 0, jobs: t?.jobs ?? 0,
      flags: data.flagsByWard.get(w.ward_code) ?? 0, openTickets: o?.n ?? 0, criticalOpen: o?.crit ?? 0,
      questioned: data.qByWard.get(w.ward_code)?.amount ?? 0, questionedBills: data.qByWard.get(w.ward_code)?.bills ?? 0,
      localities: (w.localities_text ?? '').split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
      search: [w.ward_code, w.ward_name, w.localities_text, w.aliases ?? '', w.office_name].join(' ').toLowerCase(),
      hotspots: data.hotspots.filter((x) => x.ward_code === w.ward_code).length,
    };
  });
  const hotspots: ExplorerHotspot[] = data.hotspots.map((x) => ({ id: x.hotspot_id, name: x.name, ward: x.ward_code, lat: Number(x.lat), lon: Number(x.lon), depthCm: x.avg_water_depth_cm, years: x.years_flagged_last_5 }));
  const roads: ExplorerRoad[] = data.roads.map((r) => {
    const j = data.jobsByRoad.get(r.road_id);
    return {
      id: r.road_id, name: r.road_name, ward: r.ward_code, dlp: r.under_dlp,
      coords: lineCoords(r.geometry, [[Number(r.start_lon), Number(r.start_lat)], [Number(r.end_lon), Number(r.end_lat)]]),
      jobs: j?.jobs ?? 0, reopenRate: j && j.jobs ? j.reopened / j.jobs : null,
    };
  }).filter((r) => r.coords.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));

  return (
    <div className="space-y-4">
      <PageHeader kicker="Ward explorer" title="Mumbai's 24 wards">Pick a ward on the map or in the list to see its budget, open problems and flood spots. Search by ward, area or a Marathi/Hindi name.</PageHeader>
      <SyntheticNote>Ward codes, names and localities are real; boundaries, budgets, populations and offices are synthetic.</SyntheticNote>
      <WardsRealMap wards={wards} hotspots={hotspots} roads={roads} initialWard={ward} initialLayer={layer} initialQuery={q} />
    </div>
  );
}
