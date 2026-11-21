import { requirePageUser } from '@/lib/session';
import { getDb, withSystem } from '@/lib/db';
import { CATEGORIES } from '@/lib/config';
import { ReportWizard } from './ReportWizard';

export default async function ReportPage() {
  await requirePageUser(['resident']);
  const wards = await withSystem((q) => q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } }>('select ward_code, ward_name, boundary_geojson from wards order by ward_code'), await getDb());
  return (
    <ReportWizard
      categories={CATEGORIES}
      wards={wards.rows.filter((w) => w.boundary_geojson?.coordinates?.[0]).map((w) => ({ code: w.ward_code, name: w.ward_name, polygon: w.boundary_geojson.coordinates[0] }))}
    />
  );
}
