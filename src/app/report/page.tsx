import { requirePageUser } from '@/lib/session';
import { getDb, withSystem } from '@/lib/db';
import { CATEGORIES } from '@/lib/config';
import { ReportWizard } from './ReportWizard';

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ category?: string; road?: string }> }) {
  const { category, road } = await searchParams;
  const valid = CATEGORIES.some((c) => c.code === category) ? category : undefined;
  // Road QR codes link here with ?road=RD0158. Only a plain ID is carried through sign-in; it is checked against the roads table below.
  const roadId = road && /^[A-Za-z0-9_-]{1,32}$/.test(road) ? road : undefined;
  const qs = new URLSearchParams();
  if (valid) qs.set('category', valid);
  if (roadId) qs.set('road', roadId);
  await requirePageUser(['resident'], qs.toString() ? `/report?${qs.toString()}` : '/report');
  const db = await getDb();
  const { wards, roadRow } = await withSystem(async (q) => ({
    wards: (await q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select ward_code, ward_name, boundary_geojson from wards order by ward_code')).rows,
    roadRow: roadId
      ? (await q.query<{ road_id: string; road_name: string; ward_code: string | null; start_lat: number | null; start_lon: number | null; end_lat: number | null; end_lon: number | null }>(
        'select road_id, road_name, ward_code, start_lat, start_lon, end_lat, end_lon from roads where road_id = $1', [roadId])).rows[0] ?? null
      : null,
  }), db);
  const nums = roadRow ? [roadRow.start_lat, roadRow.start_lon, roadRow.end_lat, roadRow.end_lon].map((v) => (v == null ? NaN : Number(v))) : [];
  const initialRoad = roadRow && nums.every(Number.isFinite)
    ? { id: roadRow.road_id, name: roadRow.road_name, ward: roadRow.ward_code, lat: Math.round(((nums[0] + nums[2]) / 2) * 1e6) / 1e6, lon: Math.round(((nums[1] + nums[3]) / 2) * 1e6) / 1e6 }
    : undefined;
  return (
    <ReportWizard
      categories={CATEGORIES}
      initialCategory={valid}
      initialRoad={initialRoad}
      wards={wards.filter((w) => w.boundary_geojson?.coordinates?.[0]).map((w) => ({ code: w.ward_code, name: w.ward_name, polygon: w.boundary_geojson.coordinates[0] }))}
    />
  );
}
