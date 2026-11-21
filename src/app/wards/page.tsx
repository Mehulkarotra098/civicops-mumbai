import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { inr } from '@/lib/time';
import { PageHeader, SyntheticNote } from '@/components/ui';
import { WardsRealMap } from '@/components/WardsRealMap';
import { loadHistory, moneyTrail } from '@/lib/history';

export default async function Wards({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const rows = await withSystem((tx) => tx.query<{ ward_code: string; ward_name: string; zone: string; office_name: string; population_est: number; low_lying_index: number; engineering_crews: number; budget_inr_2025: number; localities_text: string; boundary_geojson: { coordinates: number[][][] }; aliases: string }>(
    `select w.*, (select string_agg(array_to_string(l.aliases, ' '), ' ') from localities l where l.ward_code = w.ward_code) as aliases from wards w order by w.ward_code`), await getDb());
  const live = await withSystem(async (tx) => {
    const trail = moneyTrail(await loadHistory(tx));
    const open = new Map((await tx.query<{ ward_code: string; n: number }>(`select ward_code, count(*)::int as n from tickets where status not in ('verified_resolved','cancelled','duplicate','referred') and ward_code is not null group by ward_code`)).rows.map((r) => [r.ward_code, r.n]));
    return trail.map((w) => ({ w, open: open.get(w.ward_code) ?? 0 }));
  }, await getDb());
  const liveWards = rows.rows.filter((w) => w.boundary_geojson?.coordinates?.[0]).map((w) => {
    const m = live.find((x) => x.w.ward_code === w.ward_code);
    const ring = w.boundary_geojson.coordinates[0] as unknown as [number, number][];
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return { code: w.ward_code, name: w.ward_name, centroid: [cy, cx] as [number, number], polygon: ring, budget: Number(w.budget_inr_2025), spend: m?.w.spend ?? 0,
      utilisation: m?.w.utilisation ?? 0, flags: m ? m.w.flag_counts.over_rate + m.w.flag_counts.double_billing + m.w.flag_counts.dlp_paid : 0, openTickets: m?.open ?? 0 };
  });
  const needle = q.trim().toLowerCase();
  const list = rows.rows.filter((w) => !needle || [w.ward_code, w.ward_name, w.localities_text, w.aliases ?? ''].join(' ').toLowerCase().includes(needle));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Directory" title="Mumbai's 24 wards">Each ward has an office, a working board, and its own routing rules. Search by ward, area or a Marathi/Hindi name.</PageHeader>
      <SyntheticNote>Ward codes, names and localities are real; boundaries, budgets, populations and offices are synthetic.</SyntheticNote>
      <form className="flex gap-2"><input name="q" defaultValue={q} className="input max-w-md" placeholder="Search: Juhu, Andheri, अंधेरी, K/W…" aria-label="Search wards" /><button className="btn-primary">Search</button></form>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <WardsRealMap wards={liveWards} />
        <ul className="grid content-start gap-3 sm:grid-cols-2">
          {list.map((w) => (
            <li key={w.ward_code}>
              <Link href={`/wards/${encodeURIComponent(w.ward_code)}`} className="card block p-4 hover:border-action">
                <div className="flex items-center justify-between"><span className="text-lg font-bold">Ward {w.ward_code}</span><span className="chip border-gray-300 text-gray-700">{w.zone}</span></div>
                <div className="text-sm">{w.ward_name}</div>
                <div className="mt-1 text-xs text-muted">{w.office_name} · {w.engineering_crews} crews · budget {inr(w.budget_inr_2025)}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
