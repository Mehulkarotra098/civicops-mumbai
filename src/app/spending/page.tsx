import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { moneyTrail } from '@/lib/history';
import { loadPublic, searchWorkOrders, PERIOD_NOTE, SOURCE_NOTE, MONEY_TYPES } from '@/lib/spending';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { inr, inrShort, formatDateIST } from '@/lib/time';
import { Kpi, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AnimatedBar, SegmentBar, type Tone } from '@/components/Visuals';

const MONEY_META: Record<string, { label: string; note: string; tone: Tone; text: string; soft: string }> = {
  over_rate: { label: 'Above rate card', note: 'Excess over the rate-card estimate', tone: 'crit', text: 'text-crit', soft: 'border-red-200 bg-crit-soft' },
  double_billing: { label: 'Possible double bills', note: 'Same road, same work, billed again within days', tone: 'violet', text: 'text-violet-800', soft: 'border-violet-200 bg-violet-50' },
  dlp_paid: { label: 'Paid under defect liability', note: 'Road still under the contractor’s guarantee', tone: 'std', text: 'text-std', soft: 'border-orange-200 bg-std-soft' },
  over_budget: { label: 'Billed after budget ran out', note: 'Spending past the approved ward budget', tone: 'med', text: 'text-med', soft: 'border-yellow-200 bg-med-soft' },
};

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
    return { h, loc, trail: moneyTrail(h), cases: new Map(cases.map((c) => [c.ward_code, c])) };
  }, await getDb());
  const hits = searchWorkOrders(d.h.wos, d.loc, q).slice(0, 60);
  const wardHits = q ? d.trail.filter((w) => [w.ward_code, w.ward_name, w.zone].join(' ').toLowerCase().includes(q.trim().toLowerCase())) : [];
  const billed = d.h.wos.reduce((s, w) => s + w.cost_inr, 0);
  const budget = d.trail.reduce((s, w) => s + w.budget_inr_2025, 0);
  const flagged = d.h.flags.filter((f) => MONEY_TYPES.includes(f.type));
  const openCases = [...d.cases.values()].reduce((s, c) => s + c.open, 0);
  const overdue = [...d.cases.values()].reduce((s, c) => s + c.overdue, 0);
  const scale = Math.max(1, ...d.trail.map((w) => Math.max(w.budget_inr_2025, w.spend)));
  const byUse = [...d.trail].sort((a, b) => (b.budget_inr_2025 ? b.spend / b.budget_inr_2025 : 0) - (a.budget_inr_2025 ? a.spend / a.budget_inr_2025 : 0));
  const overWards = d.trail.filter((w) => w.spend > w.budget_inr_2025).length;
  const money = MONEY_TYPES.map((type) => {
    const fs = flagged.filter((f) => f.type === type);
    return { type, ...MONEY_META[type], amount: fs.reduce((s, f) => s + f.amount_at_issue, 0), count: fs.length, href: `/accountability?tab=flags&type=${type}` };
  });
  const moneyTotal = money.reduce((s, m) => s + m.amount, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-navy-900 px-6 py-8 text-white">
        <div className="kicker text-teal-300">WardProof Mumbai · public, no sign-in needed</div>
        <h1 className="mt-2 text-3xl font-bold">{t(locale, 'spend.title')}</h1>
        <p className="mt-2 max-w-3xl text-slate-300">{t(locale, 'spend.intro')}</p>
        <form className="mt-5 flex max-w-2xl gap-2" role="search">
          <input name="q" defaultValue={q} className="input" placeholder={t(locale, 'spend.search')} aria-label={t(locale, 'spend.search')} />
          <button className="btn-primary">Search</button>
        </form>
        <p className="mt-2 text-xs text-slate-400">Try: Juhu · K/W · Link Road · WO25-01590 · Arabian Sea · <Link className="underline" href="/spending/case">{t(locale, 'case.track')}</Link></p>
      </section>
      <SyntheticNote>{SOURCE_NOTE}. {PERIOD_NOTE}. Contractors are fictional. Seeded office responses and audit outcomes are labelled “Demo example”.</SyntheticNote>

      {q ? (
        <section className="space-y-3" aria-labelledby="res-h">
          <h2 id="res-h" className="h2">Results for “{q}”</h2>
          {wardHits.length ? <div className="flex flex-wrap gap-2">{wardHits.map((w) => <Link key={w.ward_code} href={`/spending/ward/${encodeURIComponent(w.ward_code)}`} className="btn-secondary btn-sm">Ward {w.ward_code} · {w.ward_name}</Link>)}</div> : null}
          {hits.length ? (
            <div className="card overflow-x-auto"><table className="table">
              <thead><tr><th>Work order</th><th>Ward · locality</th><th>Project</th><th>Contractor</th><th>{t(locale, 'f.billed')}</th><th>{t(locale, 'f.paid')}</th><th>Flags</th></tr></thead>
              <tbody>{hits.map((w) => {
                const f = flagged.filter((x) => x.work_order_id === w.work_order_id);
                return (
                  <tr key={w.work_order_id}>
                    <td><Link className="font-mono font-semibold text-action underline" href={`/spending/wo/${w.work_order_id}`}>{w.work_order_id}</Link><div className="text-xs text-muted">{formatDateIST(w.completed_at)}</div></td>
                    <td>{w.ward_code} · {d.loc.get(w.work_order_id) ?? '—'}</td>
                    <td className="text-xs">{w.work_type} on {w.road?.road_name} (seg {w.road?.segment_no})</td>
                    <td className="text-xs">{w.contractor_name}</td>
                    <td>{inr(w.cost_inr)}</td><td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
                    <td>{f.length ? <span className="chip border-red-200 bg-crit-soft text-crit">{f.length} for review</span> : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : !wardHits.length ? <p className="text-sm text-muted">No matches. Try a ward code (K/W), a locality (Juhu), a road (Link Road), a work order (WO25-01590) or a contractor.</p> : null}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Approved budgets (24 wards)" value={inrShort(budget)} sub="Original 2025 monsoon budgets; no revisions on record" href="#wards" />
        <Kpi label={t(locale, 'f.billed')} value={inrShort(billed)} sub={`${d.h.wos.length.toLocaleString('en-IN')} work orders, each counted once`} href="#wards" />
        <Kpi label={t(locale, 'f.paid')} value={t(locale, 'f.unavailable')} sub="No payment records are published, so nothing is shown as paid" />
        <Kpi label="Questioned" value={inrShort(flagged.reduce((s, f) => s + f.amount_at_issue, 0))} sub={`${flagged.length} flagged amounts · ${openCases} open cases`} href="/spending/cases" tone="crit" />
        <Kpi label={t(locale, 'case.overdue')} value={overdue} sub="Escalated to the oversight queue" href="/spending/cases?status=overdue" tone={overdue ? 'crit' : undefined} />
      </div>

      <section id="questioned" className="card p-4 sm:p-6" aria-labelledby="q-h" data-testid="questioned-visual">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="kicker text-crit">Questioned money</div>
            <h2 id="q-h" className="mt-1 text-xl font-bold sm:text-2xl">Where the questioned money is</h2>
          </div>
          <div className="text-right"><div className="text-2xl font-extrabold text-crit sm:text-3xl">{inrShort(moneyTotal)}</div><div className="text-xs text-muted">{flagged.length} flagged amounts, each for review, not proof of wrongdoing</div></div>
        </div>
        <div className="mt-4"><SegmentBar segments={money.map((m) => ({ key: m.type, value: m.amount, tone: m.tone, href: m.href, label: `${m.label}: ${inrShort(m.amount)} across ${m.count} work orders` }))} /></div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {money.map((m) => (
            <li key={m.type}>
              <Link href={m.href} className={`group block h-full rounded-xl border p-4 hover:shadow-md ${m.soft}`} data-testid={`money-${m.type}`}>
                <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-3 w-3 shrink-0 rounded-full bg-current ${m.text}`} aria-hidden="true" /><span className={m.text}>{m.label}</span></div>
                <div className={`mt-2 text-2xl font-extrabold ${m.text}`}>{inrShort(m.amount)}</div>
                <div className="mt-0.5 text-xs text-muted">{m.count} {m.count === 1 ? 'work order' : 'work orders'} · {moneyTotal ? Math.round((m.amount / moneyTotal) * 100) : 0}% of questioned</div>
                <div className="mt-1 text-xs text-muted">{m.note}</div>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-action group-hover:underline">See the flags <Icon name="arrowRight" className="h-3 w-3" /></div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="budget-chart" className="card p-4 sm:p-6" aria-labelledby="bc-h" data-testid="budget-chart">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">All 24 wards · {PERIOD_NOTE}</div>
            <h2 id="bc-h" className="mt-1 text-xl font-bold sm:text-2xl">Budget vs billed by ward</h2>
            <p className="mt-1 text-sm text-muted">{overWards ? <><b className="text-crit">{overWards} {overWards === 1 ? 'ward' : 'wards'} billed more than the approved budget.</b> </> : null}Sorted by share of budget used. Tap a ward to see its work orders.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-action-soft" />Approved budget</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-action" />Billed, within budget</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-crit" />Billed, over budget</span>
          </div>
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
                    <span className="mt-1 block truncate text-[11px] text-muted">{inrShort(w.spend)} of {inrShort(w.budget_inr_2025)}{over ? <b className="text-crit"> · over by {inrShort(w.spend - w.budget_inr_2025)}</b> : null}</span>
                  </span>
                  <span className={`text-right text-sm font-bold tabular-nums ${over ? 'text-crit' : 'text-ink'}`}>{use}%{over ? <Icon name="alert" className="ml-0.5 inline h-3.5 w-3.5 align-[-2px]" title="Over budget" /> : null}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="wards" className="card overflow-x-auto" aria-labelledby="w-h">
        <h2 id="w-h" className="h2 p-4 pb-0">Ward budgets → work orders</h2>
        <table className="table mt-2">
          <thead><tr><th>Ward</th><th>Approved budget</th><th>{t(locale, 'f.committed')}</th><th>{t(locale, 'f.billed')} (in period)</th><th>{t(locale, 'f.paid')}</th><th>Work orders</th><th>Amount questioned</th><th>Open cases</th></tr></thead>
          <tbody>
            {d.trail.map((w) => {
              const c = d.cases.get(w.ward_code);
              const fq = flagged.filter((f) => f.ward_code === w.ward_code).reduce((s, f) => s + f.amount_at_issue, 0);
              const href = `/spending/ward/${encodeURIComponent(w.ward_code)}`;
              return (
                <tr key={w.ward_code}>
                  <td><Link className="font-semibold text-action underline" href={href}>Ward {w.ward_code}</Link><div className="text-xs text-muted">{w.ward_name}</div></td>
                  <td><Link className="underline" href={href}>{inr(w.budget_inr_2025)}</Link></td>
                  <td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
                  <td className={w.spend > w.budget_inr_2025 ? 'font-semibold text-crit' : ''}><Link className="underline" href={`${href}#orders`}>{inr(w.spend)}</Link>{w.spend > w.budget_inr_2025 ? <div className="text-xs">over budget by {inr(w.spend - w.budget_inr_2025)}</div> : null}</td>
                  <td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
                  <td><Link className="underline" href={`${href}#orders`}>{w.jobs}</Link></td>
                  <td><Link className="underline" href={`${href}?flag=1#orders`}>{inr(fq)}</Link></td>
                  <td>{c ? <Link className="underline" href={`/spending/cases?ward=${encodeURIComponent(w.ward_code)}`}>{c.open}{c.overdue ? <span className="ml-1 text-crit">({c.overdue} overdue)</span> : null}</Link> : 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="flex flex-wrap items-center gap-3 border-t border-line p-3 text-xs text-muted">
          <span>{t(locale, 'f.source')}: work_orders.csv, wards.csv · {t(locale, 'f.period')}: {PERIOD_NOTE}</span>
          <a className="inline-flex items-center gap-1 font-semibold text-action underline" href="/spending/export.csv"><Icon name="upload" className="h-3 w-3" />Download CSV of public figures</a>
        </p>
      </section>
    </div>
  );
}
