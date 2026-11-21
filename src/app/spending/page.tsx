import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { moneyTrail } from '@/lib/history';
import { loadPublic, searchWorkOrders, PERIOD_NOTE, SOURCE_NOTE, MONEY_TYPES } from '@/lib/spending';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { inr, inrShort, formatDateIST } from '@/lib/time';
import { Kpi, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';

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
