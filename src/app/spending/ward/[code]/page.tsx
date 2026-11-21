import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { moneyTrail, BUDGET_PERIOD, NORMAL_BAND_MAX } from '@/lib/history';
import { questionedByWorkOrder } from '@/lib/figures';
import { loadPublic, MONEY_TYPES, PERIOD_NOTE } from '@/lib/spending';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatDateIST, inr, inrShort } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Ring } from '@/components/charts/Ring';
import { TrailLine } from '@/components/charts/TrailLine';
import { RankBars } from '@/components/charts/RankBars';
import { ChartCaption, RecordsToggle } from '@/components/charts/ChartCard';

export const dynamic = 'force-dynamic';

const FLAG_SHORT: Record<string, string> = { over_rate: 'Above rate card', double_billing: 'Possible double bill', dlp_paid: 'Paid under DLP', over_budget: 'After budget ran out' };

export default async function WardSpending({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ flag?: string; contractor?: string; method?: string }> }) {
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const locale = await getLocale();
  const d = await withSystem(async (q) => {
    const w = (await q.query<{ ward_code: string; ward_name: string; office_name: string; budget_inr_2025: number; budget_period_start: Date; budget_period_end: Date }>('select * from wards where ward_code = $1', [code])).rows[0];
    if (!w) return null;
    const { h, loc } = await loadPublic(q);
    const cases = (await q.query<{ open: number; overdue: number }>(`select count(*) filter (where status not in ('justified','corrected','closed'))::int as open,
      count(*) filter (where status in ('awaiting_response','needs_evidence') and (response_due_at < now() or escalated_at is not null))::int as overdue from accountability_cases where ward_code = $1`, [code])).rows[0];
    return { w, h, loc, trail: moneyTrail(h, code)[0], cases };
  }, await getDb());
  if (!d) notFound();
  const { w, h, loc, trail } = d;
  const budget = Number(w.budget_inr_2025);
  const flags = h.flags.filter((f) => f.ward_code === code && MONEY_TYPES.includes(f.type));
  const qd = questionedByWorkOrder(h.flags.filter((f) => f.ward_code === code));
  const noProof = h.flags.filter((f) => f.ward_code === code && f.type === 'incomplete_evidence').length;
  let orders = h.wos.filter((x) => x.ward_code === code).sort((a, b) => a.assigned_at.getTime() - b.assigned_at.getTime());
  if (sp.flag) orders = orders.filter((o) => flags.some((f) => f.work_order_id === o.work_order_id));
  if (sp.contractor) orders = orders.filter((o) => o.contractor_id === sp.contractor);
  if (sp.method) orders = orders.filter((o) => o.repair_method === sp.method);
  const href = `/spending/ward/${encodeURIComponent(code)}`;
  const usedPct = budget ? (trail.spend / budget) * 100 : 0;
  const over = trail.spend > budget;
  const filtered = !!(sp.flag || sp.contractor || sp.method);

  const ordersTable = (
    <table className="table">
      <thead><tr><th>Work order</th><th>Locality · road</th><th>Purpose</th><th>Contractor</th><th>{t(locale, 'f.billed')}</th><th>{t(locale, 'f.paid')}</th><th>Completed</th><th>Review</th></tr></thead>
      <tbody>{orders.map((o) => {
        const f = flags.filter((x) => x.work_order_id === o.work_order_id);
        return (
          <tr key={o.work_order_id}>
            <td><Link className="font-mono font-semibold text-action! underline" href={`/spending/wo/${o.work_order_id}`}>{o.work_order_id}</Link></td>
            <td className="text-xs">{loc.get(o.work_order_id) ?? '—'} · {o.road?.road_name} seg {o.road?.segment_no}</td>
            <td className="text-xs">{o.work_type} · {o.repair_method}</td>
            <td className="text-xs">{o.contractor_name}</td>
            <td>{inr(o.cost_inr)}</td><td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
            <td className="whitespace-nowrap text-xs">{formatDateIST(o.completed_at)}{o.reopened_within_30d ? <div className="text-crit">reopened</div> : null}</td>
            <td className="text-xs">{f.length ? f.map((x) => <div key={x.type} className="text-crit">{FLAG_SHORT[x.type] ?? x.type}</div>) : '—'}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted"><Link className="underline" href="/spending">{t(locale, 'spend.title')}</Link> › Ward {code}</nav>
      <header>
        <div className="kicker">Ward budget → work orders → bills → evidence</div>
        <h1 className="h1 mt-1 font-extrabold">Ward {code} · {w.ward_name}</h1>
        <p className="mt-1 text-sm text-muted">{PERIOD_NOTE}</p>
      </header>

      {/* Focal: how much of the approved budget was billed */}
      <section className={`card overflow-hidden ${over ? 'border-red-200' : ''}`} aria-labelledby="approved-h">
        <div className={`grid gap-6 p-5 sm:p-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center ${over ? 'bg-linear-to-br from-crit-soft to-white' : 'bg-linear-to-br from-action-soft/60 to-white'}`}>
          <div className="flex justify-center">
            <Ring pct={usedPct} size={176} label={`Ward ${code}: billed ${inr(trail.spend)} of ${inr(budget)} approved (${Math.round(usedPct)}%)`}>
              <span className={`text-4xl font-extrabold tnum ${over ? 'text-crit' : 'text-ink'}`}>{Math.round(usedPct)}%</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">of budget billed</span>
            </Ring>
          </div>
          <div className="min-w-0">
            <h2 id="approved-h" className="text-xl font-extrabold tracking-tight sm:text-2xl">{over ? `Billed ${inrShort(trail.spend - budget)} more than approved` : `${inrShort(budget - trail.spend)} of the budget is left`}</h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-white p-3"><dt className="kicker">Original budget</dt><dd className="mt-0.5 text-lg font-extrabold tnum">{inr(budget)}</dd><dd className="text-xs text-muted">No approved revisions on record</dd></div>
              <div className="rounded-xl border border-line bg-white p-3"><dt className="kicker">{t(locale, 'f.billed')} (in period)</dt><dd className={`mt-0.5 text-lg font-extrabold tnum ${over ? 'text-crit' : ''}`}><a className="underline" href="#orders">{inr(trail.spend)}</a></dd><dd className="text-xs text-muted tnum">{trail.jobs} work orders, each counted once</dd></div>
              <div className="rounded-xl border border-line bg-white p-3"><dt className="kicker">{t(locale, 'f.committed')}</dt><dd className="mt-0.5 font-semibold text-muted">Not published in the dataset</dd></div>
              <div className="rounded-xl border border-line bg-white p-3"><dt className="kicker">{t(locale, 'f.paid')}</dt><dd className="mt-0.5 font-semibold text-muted">Not published in the dataset</dd></div>
            </dl>
            {over ? <p className="mt-3 text-sm text-crit">Bills exceed the approved budget by <b className="tnum">{inr(trail.spend - budget)}</b> with no approved revision on record. Jobs billed after the budget ran out are marked “After budget ran out”. A question, not a finding.</p> : null}
            <p className="mt-2 text-xs text-muted">Authorizing office: {w.office_name} · Dates {formatDateIST(w.budget_period_start)} – {formatDateIST(w.budget_period_end)} · Supporting documents: {t(locale, 'f.unavailable')} · {t(locale, 'f.source')}: wards.csv, work_orders.csv</p>
          </div>
        </div>
        <div className="border-t border-line p-5 sm:p-6">
          <div className="kicker mb-3 text-action">The money path in Ward {code}</div>
          <TrailLine label={`Money path for Ward ${code}`} steps={[
            { key: 'b', label: 'Approved budget', value: inrShort(budget), sub: BUDGET_PERIOD.label, state: 'done' },
            { key: 'w', label: 'Work orders', value: String(trail.jobs), sub: `${trail.jobs_outside_period} more after the period`, state: 'done', href: '#orders' },
            { key: 'bill', label: 'Bills', value: inrShort(trail.spend), sub: 'Paid: not published in the dataset', state: over ? 'crit' : 'done', href: '#orders' },
            { key: 'e', label: 'Evidence', value: `${noProof} with no proof`, sub: 'Engineer remarks only', state: noProof ? 'warn' : 'done' },
            { key: 'r', label: 'Review', value: inrShort(qd.total), sub: `${qd.workOrders} work orders questioned · ${d.cases.open} open cases`, state: qd.total ? 'crit' : 'done', href: `/spending/cases?ward=${encodeURIComponent(code)}` },
          ]} />
        </div>
      </section>
      <SyntheticNote />

      <section className="card p-4 sm:p-6" aria-labelledby="flow-h">
        <div className="kicker">Where it went · {BUDGET_PERIOD.label}</div>
        <h2 id="flow-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Who was paid, for which repair</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">By contractor</h3>
            <RankBars rows={trail.by_contractor.map((c) => {
              const id = h.wos.find((x) => x.contractor_name === c.key)?.contractor_id;
              return { key: c.key, label: c.key, sub: `${c.jobs} jobs · ${c.reopened} reopened`, value: c.spend, display: inrShort(c.spend), href: `${href}?contractor=${id}#orders`, aria: `${c.key}: ${inr(c.spend)} billed over ${c.jobs} jobs` };
            })} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">By repair method</h3>
            <RankBars rows={trail.by_method.map((m) => ({ key: m.key, label: m.key, sub: `${m.jobs} jobs · ${m.reopened} reopened`, value: m.spend, display: inrShort(m.spend), tone: 'violet' as const, href: `${href}?method=${encodeURIComponent(m.key)}#orders`, aria: `${m.key}: ${inr(m.spend)} billed over ${m.jobs} jobs` }))} />
          </div>
        </div>
        <div className="mt-3"><ChartCaption c={{ period: BUDGET_PERIOD.label, unit: '₹ billed', n: `${trail.jobs} work orders`, source: 'work_orders.csv' }} /></div>
      </section>

      <section id="orders" className="scroll-mt-20 space-y-3" aria-labelledby="orders-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="orders-h" className="mr-2 text-xl font-extrabold tracking-tight">Work orders <span className="text-sm font-normal text-muted tnum">({orders.length})</span></h2>
          <Link href={`${href}#orders`} className={`chip min-h-9 ${!filtered ? 'border-action bg-action text-white!' : 'border-gray-300 bg-white'}`}>All</Link>
          <Link href={`${href}?flag=1#orders`} className={`chip min-h-9 ${sp.flag ? 'border-action bg-action text-white!' : 'border-gray-300 bg-white'}`}>Questioned only ({new Set(flags.map((f) => f.work_order_id)).size})</Link>
          {sp.contractor || sp.method ? <span className="chip border-gray-300 bg-white text-gray-700">{sp.method ?? h.wos.find((x) => x.contractor_id === sp.contractor)?.contractor_name}</span> : null}
        </div>
        {/* Phone: cards (first 20), full table one tap away */}
        <ul className="grid gap-3 md:hidden">
          {orders.slice(0, 20).map((o) => {
            const f = flags.filter((x) => x.work_order_id === o.work_order_id);
            return (
              <li key={o.work_order_id} className={`card p-4 ${f.length ? 'border-red-200' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <Link className="font-mono font-bold text-action! underline" href={`/spending/wo/${o.work_order_id}`}>{o.work_order_id}</Link>
                  <span className={`text-lg font-extrabold tnum ${o.cost_ratio > NORMAL_BAND_MAX ? 'text-crit' : ''}`}>{inr(o.cost_inr)}</span>
                </div>
                <p className="text-xs text-muted">{o.work_type} · {o.repair_method} · {loc.get(o.work_order_id) ?? o.road?.road_name} · {formatDateIST(o.completed_at)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {f.map((x) => <span key={x.type} className="chip border-red-200 bg-crit-soft text-crit"><Icon name="alert" className="h-3 w-3" />{FLAG_SHORT[x.type] ?? x.type}</span>)}
                  {o.reopened_within_30d ? <span className="chip border-yellow-200 bg-med-soft text-med">Reopened in 30 days</span> : null}
                  {!f.length && !o.reopened_within_30d ? <span className="chip border-green-200 bg-ok-soft text-ok">No flags</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="md:hidden"><RecordsToggle rows={orders.length} label="Full table">{ordersTable}</RecordsToggle></div>
        <div className="card hidden overflow-x-auto md:block">{ordersTable}</div>
      </section>
    </div>
  );
}
