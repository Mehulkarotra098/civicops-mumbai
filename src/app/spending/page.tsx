import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { publicFigures, questionedByWorkOrder } from '@/lib/figures';
import { moneyTrail, NORMAL_BAND_MAX } from '@/lib/history';
import { loadPublic, searchWorkOrders, PERIOD_NOTE, SOURCE_NOTE, MONEY_TYPES } from '@/lib/spending';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { inr, inrShort, formatDateIST } from '@/lib/time';
import { Kpi, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AnimatedBar, SegmentBar, type Tone } from '@/components/Visuals';
import { Ring } from '@/components/charts/Ring';
import { BandBar } from '@/components/charts/BandBar';
import { TrailLine } from '@/components/charts/TrailLine';
import { ChartCaption, Legend, RecordsToggle } from '@/components/charts/ChartCard';

const MONEY_META: Record<string, { label: string; note: string; tone: Tone; text: string; soft: string }> = {
  over_rate: { label: 'Above rate card', note: 'Excess over the rate-card estimate', tone: 'crit', text: 'text-crit', soft: 'border-red-200 bg-crit-soft' },
  double_billing: { label: 'Possible double bills', note: 'Same road, same work, billed again within days', tone: 'violet', text: 'text-violet-800', soft: 'border-violet-200 bg-violet-50' },
  dlp_paid: { label: 'Paid under defect liability', note: 'Road still under the contractor’s guarantee', tone: 'std', text: 'text-std', soft: 'border-orange-200 bg-std-soft' },
  over_budget: { label: 'Billed after budget ran out', note: 'Spending past the approved ward budget', tone: 'med', text: 'text-med', soft: 'border-yellow-200 bg-med-soft' },
};
const NOT_PUBLISHED = 'Not published in the dataset';

export const dynamic = 'force-dynamic';

export default async function Spending({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const locale = await getLocale();
  const d = await withSystem(async (tx) => {
    const { h, loc } = await loadPublic(tx);
    const cases = (await tx.query<{ ward_code: string; n: number; open: number; overdue: number }>(
      `select ward_code, count(*)::int as n, count(*) filter (where status not in ('justified','corrected','closed'))::int as open,
         count(*) filter (where status in ('awaiting_response','needs_evidence') and response_due_at < now())::int as overdue
       from accountability_cases group by ward_code`)).rows;
    return { h, loc, trail: moneyTrail(h), cases: new Map(cases.map((c) => [c.ward_code, c])), fig: await publicFigures(tx, h) };
  }, await getDb());
  const hits = searchWorkOrders(d.h.wos, d.loc, q).slice(0, 60);
  const wardHits = q ? d.trail.filter((w) => [w.ward_code, w.ward_name, w.zone].join(' ').toLowerCase().includes(q.trim().toLowerCase())) : [];
  const { billed, budget } = d.fig;
  const flagged = d.h.flags.filter((f) => MONEY_TYPES.includes(f.type));
  const noProof = d.h.flags.filter((f) => f.type === 'incomplete_evidence').length;
  const qd = questionedByWorkOrder(d.h.flags);
  const wardQ = new Map<string, number>();
  for (const f of qd.perWorkOrder.values()) wardQ.set(f.ward_code, (wardQ.get(f.ward_code) ?? 0) + f.amount_at_issue);
  const openCases = d.fig.casesOpen;
  const overdue = d.fig.casesOverdue;
  const usedPct = budget ? (billed / budget) * 100 : 0;
  const scale = Math.max(1, ...d.trail.map((w) => Math.max(w.budget_inr_2025, w.spend)));
  const byUse = [...d.trail].sort((a, b) => (b.budget_inr_2025 ? b.spend / b.budget_inr_2025 : 0) - (a.budget_inr_2025 ? a.spend / a.budget_inr_2025 : 0));
  const overWards = d.fig.wardsOverBudget;
  const money = MONEY_TYPES.map((type) => {
    const fs = flagged.filter((f) => f.type === type);
    return { type, ...MONEY_META[type], amount: fs.reduce((s, f) => s + f.amount_at_issue, 0), count: fs.length, href: `/accountability?tab=flags&type=${type}` };
  });
  const moneyTotal = d.fig.questionedRawSum;

  const wardTable = (
    <table className="table">
      <thead><tr><th>Ward</th><th>Approved budget</th><th>{t(locale, 'f.committed')}</th><th>{t(locale, 'f.billed')} (in period)</th><th>{t(locale, 'f.paid')}</th><th>Work orders</th><th>Questioned (once per work order)</th><th>Open cases</th></tr></thead>
      <tbody>
        {d.trail.map((w) => {
          const c = d.cases.get(w.ward_code);
          const href = `/spending/ward/${encodeURIComponent(w.ward_code)}`;
          return (
            <tr key={w.ward_code}>
              <td><Link className="font-semibold text-action! underline" href={href}>Ward {w.ward_code}</Link><div className="text-xs text-muted">{w.ward_name}</div></td>
              <td><Link className="underline" href={href}>{inr(w.budget_inr_2025)}</Link></td>
              <td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
              <td className={w.spend > w.budget_inr_2025 ? 'font-semibold text-crit' : ''}><Link className="underline" href={`${href}#orders`}>{inr(w.spend)}</Link>{w.spend > w.budget_inr_2025 ? <div className="text-xs">over budget by {inr(w.spend - w.budget_inr_2025)}</div> : null}</td>
              <td className="text-xs text-muted">{NOT_PUBLISHED}</td>
              <td><Link className="underline" href={`${href}#orders`}>{w.jobs}</Link></td>
              <td><Link className="underline" href={`${href}?flag=1#orders`}>{inr(wardQ.get(w.ward_code) ?? 0)}</Link></td>
              <td>{c ? <Link className="underline" href={`/spending/cases?ward=${encodeURIComponent(w.ward_code)}`}>{c.open}{c.overdue ? <span className="ml-1 text-crit">({c.overdue} overdue)</span> : null}</Link> : 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ hero: search + the city-wide budget ring */}
      <section className="hero-drift relative -mx-4 -mt-6 overflow-hidden px-5 pb-7 pt-9 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8 sm:pt-10 lg:px-10">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow teal -right-24 -top-24 h-80 w-80" aria-hidden="true" />
        <div className="relative grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div className="min-w-0">
            <div className="fade-up d1 kicker text-teal-300">WardProof Mumbai · public, no sign-in needed</div>
            <h1 className="fade-up d2 mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">{t(locale, 'spend.title')}</h1>
            <p className="fade-up d3 mt-3 max-w-2xl text-slate-300">{t(locale, 'spend.intro')}</p>
            <form className="fade-up d4 mt-5 flex max-w-2xl gap-2" role="search">
              <input name="q" defaultValue={q} className="input min-h-11" placeholder={t(locale, 'spend.search')} aria-label={t(locale, 'spend.search')} />
              <button className="btn-primary shrink-0"><Icon name="zoom" />Search</button>
            </form>
            <p className="mt-2 text-xs text-slate-400">Try: Juhu · K/W · Link Road · WO25-01590 · Arabian Sea · <Link className="underline" href="/spending/case">{t(locale, 'case.track')}</Link></p>
          </div>
          <div className="fade-up d3 flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4 sm:p-5">
            <Ring pct={usedPct} size={148} dark label={`City-wide: billed ${inrShort(billed)} of ${inrShort(budget)} approved (${Math.round(usedPct)}%)`}>
              <span className="text-3xl font-extrabold tnum">{Math.round(usedPct)}%</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">of budget<br />billed</span>
            </Ring>
            <div className="min-w-0 space-y-2 text-sm">
              <div><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Billed</div><div className="text-xl font-extrabold tnum sm:text-2xl">{inrShort(billed)}</div></div>
              <div><div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Approved budget</div><div className="text-lg font-bold tnum text-teal-200">{inrShort(budget)}</div></div>
              <div className="text-xs text-slate-300"><b className="text-red-300 tnum">{overWards} of {d.fig.wards} wards</b> billed past their budget</div>
            </div>
          </div>
        </div>
        <div className="relative mt-8 rounded-2xl border border-white/10 bg-navy-950/40 p-4 sm:p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-teal-300">The money path · {d.fig.period}</div>
          <TrailLine tone="dark" label="Money path for all 24 wards" steps={[
            { key: 'b', label: 'Approved budget', value: inrShort(budget), sub: `${d.fig.wards} ward budgets, no revisions on record`, state: 'done', href: '#budget-chart' },
            { key: 'w', label: 'Work orders', value: d.fig.workOrders.toLocaleString('en-IN'), sub: 'Committed (awarded): not published in the dataset', state: 'done', href: '#wards' },
            { key: 'bill', label: 'Bills', value: inrShort(billed), sub: 'Paid: not published in the dataset', state: 'done', href: '#wards' },
            { key: 'e', label: 'Evidence', value: `${noProof.toLocaleString('en-IN')} with no proof`, sub: 'Engineer remarks only; no photos published', state: noProof ? 'warn' : 'done' },
            { key: 'r', label: 'Review', value: inrShort(d.fig.questioned), sub: `${d.fig.questionedWorkOrders} work orders questioned · ${openCases} open cases`, state: 'crit', href: '/spending/cases' },
          ]} />
        </div>
      </section>
      <SyntheticNote>{SOURCE_NOTE}. {PERIOD_NOTE}. Contractors are fictional. Seeded office responses and audit outcomes are labelled “Demo example”.</SyntheticNote>

      {q ? (
        <section className="space-y-3" aria-labelledby="res-h">
          <h2 id="res-h" className="h2">Results for “{q}” <span className="text-sm font-normal text-muted tnum">({hits.length}{hits.length === 60 ? '+' : ''} work orders)</span></h2>
          {wardHits.length ? <div className="flex flex-wrap gap-2">{wardHits.map((w) => <Link key={w.ward_code} href={`/spending/ward/${encodeURIComponent(w.ward_code)}`} className="btn-secondary btn-sm">Ward {w.ward_code} · {w.ward_name}</Link>)}</div> : null}
          {hits.length ? (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {hits.map((w) => {
                const f = flagged.filter((x) => x.work_order_id === w.work_order_id);
                const above = w.cost_ratio > NORMAL_BAND_MAX;
                return (
                  <li key={w.work_order_id} className={`card p-4 ${f.length ? 'border-red-200' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link className="font-mono text-base font-bold text-action! underline" href={`/spending/wo/${w.work_order_id}`}>{w.work_order_id}</Link>
                        <div className="truncate text-xs text-muted">{w.ward_code} · {d.loc.get(w.work_order_id) ?? '—'} · {formatDateIST(w.completed_at)}</div>
                      </div>
                      {f.length ? <span className="chip border-red-200 bg-crit-soft text-crit"><Icon name="alert" className="h-3.5 w-3.5" />{f.length} for review</span> : <span className="chip border-green-200 bg-ok-soft text-ok"><Icon name="check" className="h-3.5 w-3.5" />No flags</span>}
                    </div>
                    <p className="mt-2 text-sm">{w.work_type} on {w.road?.road_name} (seg {w.road?.segment_no})</p>
                    <p className="text-xs text-muted">{w.contractor_name}</p>
                    <div className="mt-3"><BandBar compact billed={w.cost_inr} reference={w.expected_cost} /></div>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                      <span><span className="text-muted">{t(locale, 'f.billed')}</span> <b className="text-sm tnum">{inr(w.cost_inr)}</b> <span className={above ? 'font-semibold text-crit' : 'text-muted'}>({w.cost_ratio.toFixed(2)}× rate card)</span></span>
                      <span className="text-muted">{t(locale, 'f.paid')}: {t(locale, 'f.unavailable')}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : !wardHits.length ? <p className="text-sm text-muted">No matches. Try a ward code (K/W), a locality (Juhu), a road (Link Road), a work order (WO25-01590) or a contractor.</p> : null}
          {hits.length ? <Legend items={[{ label: 'Normal band (1.0× to 1.3× the rate card)', swatch: 'bg-action-soft' }, { label: 'Bill within the band', swatch: 'bg-ok' }, { label: 'Bill above the band', swatch: 'bg-crit' }]} /> : null}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Approved budgets (24 wards)" value={<span className="tnum">{inrShort(budget)}</span>} sub="Original 2025 monsoon budgets; no revisions on record" href="#wards" />
        <Kpi label={t(locale, 'f.billed')} value={<span className="tnum">{inrShort(billed)}</span>} sub={`${d.fig.workOrders.toLocaleString('en-IN')} work orders in ${d.fig.period}${d.fig.workOrdersOutsidePeriod ? ` · ${d.fig.workOrdersOutsidePeriod} more (${inrShort(d.fig.billedOutsidePeriod)}) outside it` : ''}`} href="#wards" />
        <Kpi label={t(locale, 'f.paid')} value={<span className="block text-base leading-snug text-muted">{NOT_PUBLISHED}</span>} sub="No payment records are published, so nothing is shown as paid" />
        <Kpi label="Questioned" value={<span className="tnum">{inrShort(d.fig.questioned)}</span>} sub={`${d.fig.questionedWorkOrders} work orders, each counted once · ${openCases} open cases`} href="/spending/cases" tone="crit" />
        <Kpi label={t(locale, 'case.overdue')} value={<span className="tnum">{overdue}</span>} sub="Escalated to the oversight queue" href="/spending/cases?status=overdue" tone={overdue ? 'crit' : undefined} />
      </div>

      <section id="questioned" className="card p-4 sm:p-6" aria-labelledby="q-h" data-testid="questioned-visual">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="kicker text-crit">Questioned money</div>
            <h2 id="q-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Where the questioned money is</h2>
          </div>
          <div className="sm:text-right"><div className="text-2xl font-extrabold text-crit tnum sm:text-3xl">{inrShort(d.fig.questioned)}</div><div className="max-w-md text-xs text-muted">{d.fig.questionedWorkOrders} work orders, each counted once. One bill can carry two flags, so the tiles add up to {inrShort(moneyTotal)}. A question, not proof of wrongdoing.</div></div>
        </div>
        <div className="mt-4"><SegmentBar segments={money.map((m) => ({ key: m.type, value: m.amount, tone: m.tone, href: m.href, label: `${m.label}: ${inrShort(m.amount)} across ${m.count} work orders` }))} /></div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money.map((m) => (
            <li key={m.type}>
              <Link href={m.href} className={`lift group block h-full rounded-xl border p-4 ${m.soft}`} data-testid={`money-${m.type}`}>
                <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-3 w-3 shrink-0 rounded-full bg-current ${m.text}`} aria-hidden="true" /><span className={m.text}>{m.label}</span></div>
                <div className={`mt-2 text-2xl font-extrabold tnum ${m.text}`}>{inrShort(m.amount)}</div>
                <div className="mt-0.5 text-xs text-muted tnum">{m.count} {m.count === 1 ? 'work order' : 'work orders'} · {moneyTotal ? Math.round((m.amount / moneyTotal) * 100) : 0}% of all flags</div>
                <div className="mt-1 text-xs text-muted">{m.note}</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-action group-hover:underline">See the flags <Icon name="arrowRight" className="h-3 w-3" /></div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4"><ChartCaption c={{ period: 'all work orders, Jun–Oct 2025', unit: '₹ at issue', n: `${d.fig.moneyFlags} money flags on ${d.fig.questionedWorkOrders} work orders`, source: 'work_orders.csv, rate_card.csv, roads.csv, wards.csv' }} /></div>
      </section>

      <section id="budget-chart" className="card p-4 sm:p-6" aria-labelledby="bc-h" data-testid="budget-chart">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">All 24 wards · {PERIOD_NOTE}</div>
            <h2 id="bc-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Budget vs billed by ward</h2>
            <p className="mt-1 text-sm text-muted">{overWards ? <><b className="text-crit">{overWards} {overWards === 1 ? 'ward' : 'wards'} billed more than the approved budget.</b> </> : null}Sorted by share of budget used. Tap a ward to see its work orders.</p>
          </div>
          <Legend items={[{ label: 'Approved budget', swatch: 'bg-action-soft' }, { label: 'Billed, within budget', swatch: 'bg-action' }, { label: 'Billed, over budget', swatch: 'bg-crit' }]} />
        </div>
        <ul className="mt-5 grid gap-x-10 gap-y-1 lg:grid-cols-2">
          {byUse.map((w, i) => {
            const over = w.spend > w.budget_inr_2025;
            const use = w.budget_inr_2025 ? Math.round((w.spend / w.budget_inr_2025) * 100) : 0;
            return (
              <li key={w.ward_code}>
                <Link href={`/spending/ward/${encodeURIComponent(w.ward_code)}`} className="group grid grid-cols-[4.5rem_1fr_3.25rem] items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface sm:grid-cols-[7.5rem_1fr_3.5rem]" data-testid={`ward-bar-${w.ward_code}`}>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink group-hover:text-action">{w.ward_code}</span>
                    <span className="block truncate text-xs text-muted">{w.ward_name}</span>
                  </span>
                  <span className="min-w-0">
                    <AnimatedBar pct={(w.spend / scale) * 100} trackPct={(w.budget_inr_2025 / scale) * 100} tone={over ? 'crit' : 'action'} trackTone="action" delayMs={Math.min(i * 30, 600)}
                      label={`Ward ${w.ward_code}: billed ${inrShort(w.spend)} of ${inrShort(w.budget_inr_2025)} budget (${use}%)${over ? ', over budget' : ''}`} />
                    <span className="mt-1 block truncate text-[11px] text-muted tnum">{inrShort(w.spend)} of {inrShort(w.budget_inr_2025)}{over ? <b className="text-crit"> · over by {inrShort(w.spend - w.budget_inr_2025)}</b> : null}</span>
                  </span>
                  <span className={`text-right text-sm font-bold tnum ${over ? 'text-crit' : 'text-ink'}`}>{use}%{over ? <Icon name="alert" className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" title="Over budget" /> : null}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4"><ChartCaption c={{ period: d.fig.period, unit: '₹ (Cr = crore, L = lakh)', n: `${d.fig.wards} wards, ${d.fig.workOrders.toLocaleString('en-IN')} work orders`, source: 'wards.csv budget, work_orders.csv cost_inr' }} /></div>
      </section>

      <section id="wards" className="space-y-3" aria-labelledby="w-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="w-h" className="text-xl font-extrabold tracking-tight sm:text-2xl">Ward budgets → work orders</h2>
          <a className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action! underline" href="/spending/export.csv"><Icon name="upload" className="h-4 w-4" />Download CSV of public figures</a>
        </div>
        {/* Phone: one card per ward, full table one tap away */}
        <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
          {d.trail.map((w) => {
            const c = d.cases.get(w.ward_code);
            const over = w.spend > w.budget_inr_2025;
            const use = w.budget_inr_2025 ? Math.round((w.spend / w.budget_inr_2025) * 100) : 0;
            const wq = wardQ.get(w.ward_code) ?? 0;
            return (
              <li key={w.ward_code} className={`card min-w-0 p-4 ${over ? 'border-red-200' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link className="text-base font-bold text-action! underline" href={`/spending/ward/${encodeURIComponent(w.ward_code)}`}>Ward {w.ward_code}</Link>
                  <span className={`text-lg font-extrabold tnum ${over ? 'text-crit' : ''}`}>{use}%</span>
                </div>
                <div className="truncate text-xs text-muted">{w.ward_name}</div>
                <div className="mt-2"><AnimatedBar pct={Math.min(100, use)} tone={over ? 'crit' : 'action'} label={`Ward ${w.ward_code}: ${use}% of budget billed`} /></div>
                <div className="mt-1 text-xs tnum">{inrShort(w.spend)} billed of {inrShort(w.budget_inr_2025)} · {w.jobs} work orders</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {wq ? <span className="chip border-red-200 bg-crit-soft text-crit tnum">{inrShort(wq)} questioned</span> : <span className="chip border-green-200 bg-ok-soft text-ok">Nothing questioned</span>}
                  {c?.open ? <span className="chip border-gray-300 bg-white text-gray-700 tnum">{c.open} open cases{c.overdue ? ` · ${c.overdue} overdue` : ''}</span> : null}
                  <span className="chip border-gray-300 bg-white text-muted">Paid: not published</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="md:hidden"><RecordsToggle rows={d.trail.length} label="Full table">{wardTable}</RecordsToggle></div>
        {/* Desktop: the full table below the visual */}
        <div className="card hidden overflow-x-auto md:block">{wardTable}</div>
        <p className="text-xs text-muted">{t(locale, 'f.source')}: work_orders.csv, wards.csv · {t(locale, 'f.period')}: {PERIOD_NOTE}. Committed and paid amounts are not published in the dataset, so they are never shown as ₹0.</p>
      </section>
    </div>
  );
}
