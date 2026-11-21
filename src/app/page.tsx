import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, homeFor } from '@/lib/session';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { Icon } from '@/components/icons';
import { CATEGORIES } from '@/lib/config';
import { getDb, withSystem } from '@/lib/db';
import { loadHistory } from '@/lib/history';
import { publicFigures } from '@/lib/figures';
import { SyntheticNote } from '@/components/ui';
import { AnimatedBar, CountUp } from '@/components/Visuals';
import { TrailLine } from '@/components/charts/TrailLine';
import { formatDateIST, inrShort } from '@/lib/time';

export const dynamic = 'force-dynamic';

const TRACE_WO = 'WO25-01590';

export default async function Home() {
  const u = await currentUser();
  if (u) redirect(homeFor(u.role));
  const locale = await getLocale();
  const d = await withSystem(async (q) => {
    const h = await loadHistory(q);
    const f = await publicFigures(q, h);
    const wo = h.wos.find((w) => w.work_order_id === TRACE_WO);
    return {
      f,
      billed: f.billed,
      questioned: f.questioned,
      workOrders: f.workOrders,
      complaints: f.complaints,
      wards: f.wards,
      cases: f.cases,
      trace: {
        billed: wo?.cost_inr ?? 23311,
        rate: wo?.expected_cost ?? 12220,
        road: wo?.road?.road_name ?? 'Link Road',
        ward: wo?.ward_code ?? 'K/W',
        budget: h.wards.find((x) => x.ward_code === (wo?.ward_code ?? 'K/W'))?.budget_inr_2025 ?? 0,
        assigned: wo?.assigned_at ?? null,
        remark: !!wo?.engineer_remark,
        reopened: !!wo?.reopened_within_30d,
      },
    };
  }, await getDb());
  const ratio = d.trace.rate ? d.trace.billed / d.trace.rate : 0;
  const rs = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

  const stats: { label: string; value: number; format: 'inr' | 'number'; tone: string; href: string }[] = [
    { label: 'Total billed', value: d.billed, format: 'inr', tone: 'text-white', href: '/spending' },
    { label: 'Amount questioned', value: d.questioned, format: 'inr', tone: 'text-red-300', href: '/spending#questioned' },
    { label: 'Work orders', value: d.workOrders, format: 'number', tone: 'text-white', href: '/spending#wards' },
    { label: 'Complaints', value: d.complaints, format: 'number', tone: 'text-white', href: '/accountability/complaints' },
    { label: 'Wards', value: d.wards, format: 'number', tone: 'text-teal-300', href: '/spending#budget-chart' },
    { label: 'Accountability cases', value: d.cases, format: 'number', tone: 'text-amber-300', href: '/spending/cases' },
  ];

  const entries = [
    { href: '/login?next=%2Freport', icon: 'camera', title: 'Report a problem', body: 'Pothole, flooding, garbage, a broken light. Snap it, pin it, and watch who owns it and by when.', cta: t(locale, 'nav.report'), accent: 'bg-teal-400/15 text-teal-300' },
    { href: '/spending', icon: 'rupee', title: 'Where did the money go?', body: 'Every ward budget, every bill, and every amount that needs an explanation. No sign-in needed.', cta: 'Follow the money', accent: 'bg-amber-400/15 text-amber-300' },
    { href: '/live', icon: 'map', title: 'Live dashboard', body: 'Open complaints, deadlines and fixes across all 24 wards, updating as work happens.', cta: 'Open the live view', accent: 'bg-sky-400/15 text-sky-300', live: true },
  ];

  const steps = [
    { icon: 'pin', title: 'Report', body: 'A resident files a complaint with a photo and a pin on the map.' },
    { icon: 'clock', title: 'Routed with a deadline', body: 'Location → ward → responsible team. The clock starts and is shown to everyone.' },
    { icon: 'camera', title: 'Fixed with photo proof', body: 'The crew uploads before and after photos. No photo, no closure.' },
    { icon: 'shield', title: 'Verified independently', body: 'A reviewer checks the evidence and records the decision with a reason.' },
  ];

  return (
    <div className="space-y-12 sm:space-y-16">
      {/* ------------------------------------------------------------ hero */}
      <section className="hero-drift relative -mx-4 -mt-6 overflow-hidden bg-linear-to-br from-navy-950 to-navy-800 px-5 pb-8 pt-12 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-10 sm:pb-10 sm:pt-16 lg:px-14">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow teal -right-24 -top-24 h-80 w-80 sm:h-[28rem] sm:w-[28rem]" aria-hidden="true" />
        <div className="hero-glow amber -bottom-32 -left-20 h-72 w-72 sm:h-96 sm:w-96" aria-hidden="true" />

        <div className="relative">
          <div className="fade-up d1 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-300">
            <Icon name="sparkle" className="h-3.5 w-3.5" />CivicOps Mumbai + WardProof
          </div>
          <h1 className="fade-up d2 mt-5 max-w-4xl text-[2.1rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Every complaint has an owner.{' '}
            <span className="bg-linear-to-r from-teal-300 via-emerald-200 to-amber-200 bg-clip-text text-transparent">Every rupee has a reason.</span>
          </h1>
          <p className="fade-up d3 mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            {t(locale, 'app.tagline')} Each report gets a ward, a responsible team, a visible deadline and a timestamped history, and every road-repair bill can be traced back to its budget.
          </p>

          {/* three entry cards */}
          <div className="fade-up d4 mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
            {entries.map((e) => (
              <Link key={e.href} href={e.href} className="lift group relative flex flex-col rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-sm hover:border-teal-300/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${e.accent}`}><Icon name={e.icon} className="h-6 w-6" /></span>
                  {e.live ? (
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <span className="pulse-ring inline-block h-2 w-2 rounded-full bg-emerald-400 text-emerald-400/60" aria-hidden="true" />Live
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-xl font-bold">{e.title}</h2>
                <p className="mt-1.5 flex-1 text-sm text-slate-300">{e.body}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-300">
                  {e.cta}<Icon name="arrowRight" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>

          {/* animated stats strip */}
          <ul className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-6" aria-label="Key figures">
            {stats.map((s) => (
              <li key={s.label} className="bg-navy-950/70 hover:bg-navy-900/80">
                <Link href={s.href} className="block h-full px-4 py-4">
                  <span className={`block whitespace-nowrap text-2xl font-extrabold tnum md:text-3xl lg:text-2xl xl:text-[1.7rem] ${s.tone}`}><CountUp value={s.value} format={s.format} /></span>
                  <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">Billed and work orders: budget period {d.f.period}. Questioned money is counted once per work order. Synthetic dataset; contractors are fictional.</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ how it works */}
      <section aria-labelledby="how-h">
        <div className="kicker text-action">How it works</div>
        <h2 id="how-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">From a pothole photo to a verified fix</h2>
        <ol className="mt-8 grid gap-0 md:grid-cols-4 md:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-8 md:flex-col md:pb-0">
              {i < steps.length - 1 ? (
                <span aria-hidden="true" className="absolute left-6 top-14 bottom-0 w-0.5 bg-linear-to-b from-action to-action/20 md:left-[3.75rem] md:right-[-1.5rem] md:top-6 md:bottom-auto md:h-0.5 md:w-auto md:bg-linear-to-r" />
              ) : null}
              <span className={`relative z-10 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-4 ring-surface ${i === steps.length - 1 ? 'bg-ok text-white' : 'bg-action text-white'}`}>
                <Icon name={s.icon} className="h-6 w-6" />
              </span>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-muted">Step {i + 1}</div>
                <h3 className="mt-0.5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-crit-soft p-3 text-sm"><span className="h-3 w-3 shrink-0 rounded-full bg-crit" aria-hidden="true" /><span><b className="text-crit">Critical</b> · first action within 5 hours</span></div>
          <div className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-med-soft p-3 text-sm"><span className="h-3 w-3 shrink-0 rounded-full bg-med-edge" aria-hidden="true" /><span><b className="text-med">Medium</b> · resolved by day 7</span></div>
          <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-std-soft p-3 text-sm"><span className="h-3 w-3 shrink-0 rounded-full bg-std" aria-hidden="true" /><span><b className="text-std">Standard</b> · resolved by day 10</span></div>
        </div>
      </section>

      {/* ------------------------------------------------------------ follow the rupee */}
      <section aria-labelledby="rupee-h" className="overflow-hidden rounded-3xl border border-line bg-card">
        <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-10">
          <div>
            <div className="kicker text-crit">Follow the rupee</div>
            <h2 id="rupee-h" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">One repair on {d.trace.road}, billed at {ratio.toFixed(2)}× the rate card</h2>
            <p className="mt-3 text-muted">Work order <span className="font-mono font-semibold text-ink">{TRACE_WO}</span> in ward {d.trace.ward}. The bill is compared with the city rate card for the same method and area. Nothing is called fraud: the office is asked to explain, in public, with a deadline.</p>
            <Link href={`/spending/wo/${TRACE_WO}`} className="btn-primary mt-5"><span className="inline-flex items-center gap-2 text-white"><Icon name="link" />Trace {TRACE_WO}<Icon name="arrowRight" /></span></Link>
          </div>
          <Link href={`/spending/wo/${TRACE_WO}`} className="group block rounded-2xl bg-surface p-5 sm:p-6" aria-label={`${TRACE_WO}: billed ${rs(d.trace.billed)} against a rate-card estimate of ${rs(d.trace.rate)}`}>
            <div className="space-y-5">
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-crit">Billed</span>
                  <span className="text-2xl font-extrabold text-crit tnum sm:text-3xl">{rs(d.trace.billed)}</span>
                </div>
                <div className="mt-2"><AnimatedBar pct={100} tone="crit" label={`Billed ${rs(d.trace.billed)}`} height="h-5" /></div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-action">Rate card estimate</span>
                  <span className="text-2xl font-extrabold text-action tnum sm:text-3xl">{rs(d.trace.rate)}</span>
                </div>
                <div className="mt-2"><AnimatedBar pct={d.trace.billed ? (d.trace.rate / d.trace.billed) * 100 : 0} trackPct={0} tone="action" label={`Rate card ${rs(d.trace.rate)}`} height="h-5" delayMs={250} /></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                <span className="chip border-red-200 bg-crit-soft text-crit"><Icon name="alert" className="h-3.5 w-3.5" />{ratio.toFixed(2)}× the rate card</span>
                <span className="text-sm font-semibold text-muted tnum">Gap {rs(d.trace.billed - d.trace.rate)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-action group-hover:underline">See the full trail<Icon name="arrowRight" /></span>
              </div>
            </div>
          </Link>
        </div>
        <div className="border-t border-line bg-surface/60 p-5 sm:px-8 sm:py-6">
          <div className="kicker mb-3 text-action">The trail for {TRACE_WO}</div>
          <TrailLine label={`Money trail for ${TRACE_WO}`} steps={[
            { key: 'b', label: 'Approved budget', value: inrShort(d.trace.budget), sub: `Ward ${d.trace.ward}, monsoon 2025`, state: 'done', href: `/spending/ward/${encodeURIComponent(d.trace.ward)}` },
            { key: 'w', label: 'Work order', value: d.trace.assigned ? formatDateIST(d.trace.assigned) : '—', sub: `Pothole on ${d.trace.road}`, state: 'done' },
            { key: 'bill', label: 'Bill', value: rs(d.trace.billed), sub: `${ratio.toFixed(2)}× the rate card`, state: 'crit' },
            { key: 'e', label: 'Evidence', value: d.trace.remark ? 'Remark only' : 'None', sub: d.trace.reopened ? 'Reopened within 30 days' : 'Held 30 days', state: d.trace.reopened || !d.trace.remark ? 'warn' : 'done' },
            { key: 'r', label: 'Review', value: 'Office must answer', sub: 'Then an independent decision', state: 'current', href: `/spending/wo/${TRACE_WO}#ask` },
          ]} />
        </div>
      </section>

      {/* ------------------------------------------------------------ categories */}
      <section aria-labelledby="cat-h">
        <h2 id="cat-h" className="h2">What you can report</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <li key={c.code}><Link href={`/login?next=${encodeURIComponent(`/report?category=${c.code}`)}`} className="card lift flex h-full items-center gap-2 p-3 text-sm font-medium hover:border-action"><Icon name={c.icon} className="h-5 w-5 shrink-0 text-action" />{c.label}</Link></li>
          ))}
        </ul>
      </section>

      <SyntheticNote>Historical complaints, work orders, budgets and bills are a synthetic hackathon dataset from the Claude Impact Lab repo. They are not BMC records, and contractors are fictional.</SyntheticNote>
    </div>
  );
}
