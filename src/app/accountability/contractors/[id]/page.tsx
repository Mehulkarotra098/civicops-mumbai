import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { loadHistory, scorecards } from '@/lib/history';
import { inr, inrShort, formatDateIST } from '@/lib/time';
import { Kpi, PageHeader, SyntheticNote } from '@/components/ui';

export default async function Contractor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { h, card } = await withSystem(async (q) => { const h = await loadHistory(q); return { h, card: scorecards(h).find((c) => c.contractor_id === id) }; }, await getDb());
  if (!card) notFound();
  const flags = h.flags.filter((f) => f.contractor_id === id);
  const jobs = h.wos.filter((w) => w.contractor_id === id);
  return (
    <div className="space-y-5">
      <PageHeader kicker="Contractor scorecard · synthetic, fictional contractor" title={card.contractor_name}>{card.summary}</PageHeader>
      <SyntheticNote />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Jobs" value={card.jobs} sub={inrShort(card.billed)} />
        <Kpi label="Met time target" value={`${Math.round(card.sla_met_pct * 100)}%`} sub={`${card.sla_met_pct_outside_heavy_rain != null ? Math.round(card.sla_met_pct_outside_heavy_rain * 100) : '—'}% without heavy rain (${card.heavy_rain_jobs} rainy jobs)`} />
        <Kpi label="Reopened in 30 days" value={`${Math.round(card.reopen_pct * 100)}%`} sub={`${Math.round(card.expected_reopen_pct * 100)}% expected for the methods used`} tone={card.reopen_pct > card.expected_reopen_pct * 1.1 ? 'crit' : undefined} />
        <Kpi label="Typical bill" value={`${card.median_cost_ratio.toFixed(2)}×`} sub="median bill ÷ rate-card reference" />
        <Kpi label="Flags to review" value={card.over_rate_flags + card.double_billing_flags} sub={`${card.over_rate_flags} above rate · ${card.double_billing_flags} possible double bills`} tone={card.over_rate_flags + card.double_billing_flags ? 'crit' : 'ok'} />
      </div>
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">Flagged jobs ({flags.length})</h2>
        <table className="table mt-2"><thead><tr><th>Work order</th><th>Type</th><th>Amount at issue</th><th>Reason</th></tr></thead>
          <tbody>{flags.map((f) => <tr key={f.type + f.work_order_id}><td><Link className="font-mono text-action underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link></td><td>{f.type.replace('_', ' ')}</td><td>{inr(f.amount_at_issue)}</td><td className="text-xs">{f.reason}</td></tr>)}</tbody></table>
      </section>
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">All jobs ({jobs.length})</h2>
        <table className="table mt-2"><thead><tr><th>Work order</th><th>Ward</th><th>Method</th><th>Completed</th><th>Bill</th><th>× rate</th><th>SLA</th><th>Reopened</th></tr></thead>
          <tbody>{jobs.slice(0, 400).map((w) => <tr key={w.work_order_id}><td><Link className="font-mono underline" href={`/accountability/work-orders/${w.work_order_id}`}>{w.work_order_id}</Link></td><td>{w.ward_code}</td><td>{w.repair_method}</td><td className="whitespace-nowrap">{formatDateIST(w.completed_at)}</td><td>{inr(w.cost_inr)}</td><td>{w.cost_ratio.toFixed(2)}</td><td>{w.sla_met ? 'met' : 'missed'}</td><td>{w.reopened_within_30d ? 'yes' : 'no'}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
