import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { moneyTrail, BUDGET_PERIOD } from '@/lib/history';
import { loadPublic, MONEY_TYPES, PERIOD_NOTE } from '@/lib/spending';
import { getLocale } from '@/lib/locale';
import { t } from '@/i18n';
import { formatDateIST, inr } from '@/lib/time';
import { PageHeader, SyntheticNote } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function WardSpending({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ flag?: string; contractor?: string; method?: string }> }) {
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const locale = await getLocale();
  const d = await withSystem(async (q) => {
    const w = (await q.query<{ ward_code: string; ward_name: string; office_name: string; budget_inr_2025: number; budget_period_start: Date; budget_period_end: Date }>('select * from wards where ward_code = $1', [code])).rows[0];
    if (!w) return null;
    const { h, loc } = await loadPublic(q);
    return { w, h, loc, trail: moneyTrail(h, code)[0] };
  }, await getDb());
  if (!d) notFound();
  const { w, h, loc, trail } = d;
  const flags = h.flags.filter((f) => f.ward_code === code && MONEY_TYPES.includes(f.type));
  let orders = h.wos.filter((x) => x.ward_code === code).sort((a, b) => a.assigned_at.getTime() - b.assigned_at.getTime());
  if (sp.flag) orders = orders.filter((o) => flags.some((f) => f.work_order_id === o.work_order_id));
  if (sp.contractor) orders = orders.filter((o) => o.contractor_id === sp.contractor);
  if (sp.method) orders = orders.filter((o) => o.repair_method === sp.method);
  const href = `/spending/ward/${encodeURIComponent(code)}`;

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted"><Link className="underline" href="/spending">{t(locale, 'spend.title')}</Link> › Ward {code}</nav>
      <PageHeader kicker="Ward budget → work orders → bills → evidence" title={`Ward ${code} · ${w.ward_name}`}>{PERIOD_NOTE}</PageHeader>
      <SyntheticNote />
      <section className="card p-5" aria-labelledby="approved-h">
        <h2 id="approved-h" className="h2">{t(locale, 'q.approved')}</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="kicker">Original budget</dt><dd className="text-xl font-bold">{inr(w.budget_inr_2025)}</dd><dd className="text-xs text-muted">Monsoon road repair, {BUDGET_PERIOD.label}</dd></div>
          <div><dt className="kicker">Approved revisions</dt><dd>None on record</dd></div>
          <div><dt className="kicker">Authorizing office</dt><dd>{w.office_name}</dd></div>
          <div><dt className="kicker">Dates</dt><dd>{formatDateIST(w.budget_period_start)} – {formatDateIST(w.budget_period_end)}</dd></div>
          <div><dt className="kicker">Supporting documents</dt><dd className="text-muted">{t(locale, 'f.unavailable')}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted">{t(locale, 'f.source')}: wards.csv (monsoon_repair_budget_inr_2025, assistant_commissioner_office).</p>
      </section>

      <section className="card p-5" aria-labelledby="flow-h">
        <h2 id="flow-h" className="h2">Where it went</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[
            ['Approved', inr(w.budget_inr_2025), 'wards.csv', '#approved-h'],
            [t(locale, 'f.committed'), t(locale, 'f.unavailable'), 'No award records published', null],
            [`${t(locale, 'f.billed')} (in period)`, inr(trail.spend), `${trail.jobs} work orders, each counted once · work_orders.csv`, '#orders'],
            [t(locale, 'f.paid'), t(locale, 'f.unavailable'), 'No payment records published', null],
          ].map(([label, value, src, link]) => (
            <div key={label} className="rounded-lg border border-line p-3">
              <div className="kicker">{label}</div>
              <div className="text-lg font-bold">{link ? <a className="underline" href={link}>{value}</a> : value}</div>
              <div className="text-xs text-muted">{src}</div>
            </div>
          ))}
        </div>
        {trail.spend > w.budget_inr_2025 ? <p className="mt-3 rounded-lg border border-red-200 bg-crit-soft p-3 text-sm text-crit">Bills exceed the approved budget by <b>{inr(trail.spend - w.budget_inr_2025)}</b> with no approved revision on record. The jobs billed after the budget ran out are flagged “Billed after the budget ran out”.</p> : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><h3 className="text-sm font-semibold">By contractor</h3><ul className="mt-1 text-sm">{trail.by_contractor.map((c) => { const id = h.wos.find((x) => x.contractor_name === c.key)?.contractor_id; return <li key={c.key} className="flex justify-between border-b border-line py-1"><Link className="underline" href={`${href}?contractor=${id}#orders`}>{c.key}</Link><span>{inr(c.spend)} · {c.jobs} jobs</span></li>; })}</ul></div>
          <div><h3 className="text-sm font-semibold">By repair method</h3><ul className="mt-1 text-sm">{trail.by_method.map((m) => <li key={m.key} className="flex justify-between border-b border-line py-1"><Link className="underline" href={`${href}?method=${encodeURIComponent(m.key)}#orders`}>{m.key}</Link><span>{inr(m.spend)} · {m.jobs} jobs</span></li>)}</ul></div>
        </div>
      </section>

      <section id="orders" className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 p-4 pb-0">
          <h2 className="h2 mr-2">Work orders ({orders.length})</h2>
          <Link href={`${href}#orders`} className={`chip ${!sp.flag && !sp.contractor && !sp.method ? 'border-action bg-action text-white' : 'border-gray-300'}`}>All</Link>
          <Link href={`${href}?flag=1#orders`} className={`chip ${sp.flag ? 'border-action bg-action text-white' : 'border-gray-300'}`}>Questioned only ({new Set(flags.map((f) => f.work_order_id)).size})</Link>
        </div>
        <table className="table mt-2">
          <thead><tr><th>Work order</th><th>Locality · road</th><th>Purpose</th><th>Contractor</th><th>{t(locale, 'f.billed')}</th><th>{t(locale, 'f.paid')}</th><th>Completed</th><th>Review</th></tr></thead>
          <tbody>{orders.map((o) => {
            const f = flags.filter((x) => x.work_order_id === o.work_order_id);
            return (
              <tr key={o.work_order_id}>
                <td><Link className="font-mono font-semibold text-action underline" href={`/spending/wo/${o.work_order_id}`}>{o.work_order_id}</Link></td>
                <td className="text-xs">{loc.get(o.work_order_id) ?? '—'} · {o.road?.road_name} seg {o.road?.segment_no}</td>
                <td className="text-xs">{o.work_type} · {o.repair_method}</td>
                <td className="text-xs">{o.contractor_name}</td>
                <td>{inr(o.cost_inr)}</td><td className="text-xs text-muted">{t(locale, 'f.unavailable')}</td>
                <td className="whitespace-nowrap text-xs">{formatDateIST(o.completed_at)}{o.reopened_within_30d ? <div className="text-crit">reopened</div> : null}</td>
                <td className="text-xs">{f.length ? f.map((x) => <div key={x.type} className="text-crit">{x.type.replace('_', ' ')}</div>) : '—'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>
    </div>
  );
}
