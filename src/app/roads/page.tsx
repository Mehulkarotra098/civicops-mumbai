// /roads: public directory of road segments with their warranty clocks and QR codes.
import type { Metadata } from 'next';
import { getDb, withSystem } from '@/lib/db';
import { roadDirectory } from '@/lib/roads';
import { Icon } from '@/components/icons';
import { siteOrigin } from '../r/shared';
import { RoadDirectory } from './RoadDirectory';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Road warranty directory · CivicOps Mumbai', description: 'Every road segment, its free-repair period and a QR code to its page (synthetic demo data).' };

export default async function RoadsPage() {
  const [d, origin] = await Promise.all([withSystem((q) => roadDirectory(q), await getDb()), siteOrigin()]);
  const s = d.stats;
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-navy-900 px-4 py-5 text-white sm:px-6 sm:py-7">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-teal-200"><Icon name="road" className="h-4 w-4" />Road QR</div>
        <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight sm:text-4xl">Is your road still under warranty?</h1>
        <p className="mt-2 max-w-2xl text-sm text-indigo-100">
          After a road is resurfaced, the contractor must repair defects for free until the defect-liability period ends (concrete 10 years, mastic 5, asphalt 3).
          Every segment gets a QR site board that opens its warranty clock, the money spent on it and a one-tap report.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 sm:max-w-2xl sm:gap-3">
          <HeroStat value={s.underWarranty} label="Roads in free-repair period" tone="text-emerald-300" />
          <HeroStat value={s.expiring} label="Ending in 90 days" tone="text-amber-300" />
          <HeroStat value={s.paidTwiceFlags} label={`“Paid twice?” bills on ${s.paidTwiceRoads} roads`} tone="text-red-300" />
        </dl>
        <p className="mt-3 text-[11px] text-indigo-200">{s.roads} segments · {s.expired} past their period · {s.unknown} with no standard period (paver blocks). Synthetic Claude Impact Lab dataset, not BMC records.</p>
      </section>
      <RoadDirectory cards={d.cards} wards={d.wards} origin={origin} />
    </div>
  );
}

function HeroStat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-2.5 py-2.5 sm:px-4">
      <dd className={`tnum text-2xl font-extrabold sm:text-3xl ${tone}`}>{value.toLocaleString('en-IN')}</dd>
      <dt className="text-[11px] leading-tight text-indigo-100 sm:text-xs">{label}</dt>
    </div>
  );
}
