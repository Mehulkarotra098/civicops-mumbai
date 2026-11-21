import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { loadHistory, scorecards, NORMAL_BAND_MAX } from '@/lib/history';
import { inr, inrShort, formatDateIST } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { FairBars, durabilityWord } from '@/components/charts/FairBars';
import { ChartCaption, RecordsToggle } from '@/components/charts/ChartCard';

const TYPE_LABEL: Record<string, string> = { over_rate: 'Above rate card', double_billing: 'Possible double bill', dlp_paid: 'Paid under DLP', over_budget: 'After budget ran out', incomplete_evidence: 'No completion evidence', sla_missed: 'Missed time target (context)', reopened: 'Fix failed in 30 days (context)', data_quality: 'Record inconsistent' };
const MONEY = ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'];

export default async function Contractor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { h, card } = await withSystem(async (q) => { const h = await loadHistory(q); return { h, card: scorecards(h).find((c) => c.contractor_id === id) }; }, await getDb());
  if (!card) notFound();
  const flags = h.flags.filter((f) => f.contractor_id === id);
  const moneyFlags = flags.filter((f) => MONEY.includes(f.type)).sort((a, b) => b.amount_at_issue - a.amount_at_issue);
  const jobs = h.wos.filter((w) => w.contractor_id === id);
  const dur = durabilityWord(card);
  const flagN = card.over_rate_flags + card.double_billing_flags;
  const byType = Object.entries(flags.reduce<Record<string, number>>((m, f) => { m[f.type] = (m[f.type] ?? 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <nav className="text-xs text-muted"><Link className="underline" href="/accountability?tab=contractors">Contractor scorecards</Link> › {card.contractor_name}</nav>
      <header>
        <div className="kicker">Contractor scorecard · synthetic, fictional contractor</div>
        <h1 className="h1 mt-1 font-extrabold">{card.contractor_name}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="chip border-gray-300 bg-white text-ink tnum">{card.jobs} jobs · {inrShort(card.billed)} billed</span>
          <span className={`chip ${dur.tone === 'crit' ? 'border-red-200 bg-crit-soft text-crit' : dur.tone === 'ok' ? 'border-green-200 bg-ok-soft text-ok' : 'border-gray-300 bg-white text-ink'}`}><Icon name={dur.tone === 'crit' ? 'alert' : 'checkCircle'} className="h-3.5 w-3.5" />Repairs: {dur.word.toLowerCase()}</span>
          <span className={`chip ${flagN ? 'border-red-200 bg-crit-soft text-crit' : 'border-green-200 bg-ok-soft text-ok'}`}>{flagN ? `${flagN} bills need a closer look` : 'No bill flags'}</span>
        </div>
      </header>

      <section className="card p-4 sm:p-6" aria-labelledby="fair-h">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="kicker text-action">Fair comparison</div>
            <h2 id="fair-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Speed, durability and cost, adjusted for rain and repair method</h2>
            <div className="mt-4"><FairBars c={card} large /></div>
            <div className="mt-4"><ChartCaption c={{ period: 'Jun–Oct 2025', unit: '% of jobs; × rate card', n: `${card.jobs} jobs (${card.heavy_rain_jobs} with heavy rain ≥ 64.5 mm)`, source: 'work_orders.csv, rainfall.csv, rate_card.csv' }} /></div>
          </div>
          <div className="min-w-0 rounded-2xl bg-surface p-4 sm:p-5">
            <div className="kicker">In plain words</div>
            <p className="mt-2 text-sm leading-relaxed">{card.summary}</p>
            {byType.length ? (
              <>
                <div className="kicker mt-4">Review signals</div>
                <ul className="mt-2 flex flex-wrap gap-1.5">{byType.map(([t, n]) => <li key={t} className={`chip ${MONEY.includes(t) ? 'border-red-200 bg-crit-soft text-crit' : 'border-gray-300 bg-white text-gray-700'}`}><span className="tnum">{n}</span> {TYPE_LABEL[t] ?? t}</li>)}</ul>
              </>
            ) : null}
          </div>
        </div>
      </section>
      <SyntheticNote />

      <section className="space-y-3" aria-labelledby="flag-h">
        <h2 id="flag-h" className="text-xl font-extrabold tracking-tight">Bills to look at <span className="text-sm font-normal text-muted tnum">({moneyFlags.length})</span></h2>
        {moneyFlags.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {moneyFlags.slice(0, 12).map((f) => (
              <li key={f.type + f.work_order_id} className="card min-w-0 p-4">
                <div className="flex items-baseline justify-between gap-2"><Link className="font-mono font-bold text-action! underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link><b className="text-lg text-crit tnum">{inr(f.amount_at_issue)}</b></div>
                <span className="chip mt-1 border-red-200 bg-crit-soft text-crit">{TYPE_LABEL[f.type]}</span>
                <p className="mt-2 text-xs text-ink/80">{f.reason}</p>
              </li>
            ))}
          </ul>
        ) : <p className="card p-4 text-sm text-muted">No money flags for this contractor.</p>}
        <RecordsToggle rows={flags.length} label="Show all review signals">
          <table className="table"><thead><tr><th>Work order</th><th>Type</th><th>Amount at issue</th><th>Reason</th></tr></thead>
            <tbody>{flags.map((f) => <tr key={f.type + f.work_order_id}><td><Link className="font-mono text-action! underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link></td><td>{TYPE_LABEL[f.type] ?? f.type}</td><td>{MONEY.includes(f.type) ? inr(f.amount_at_issue) : '—'}</td><td className="text-xs">{f.reason}</td></tr>)}</tbody></table>
        </RecordsToggle>
      </section>

      <section className="space-y-3" aria-labelledby="jobs-h">
        <h2 id="jobs-h" className="text-xl font-extrabold tracking-tight">All jobs <span className="text-sm font-normal text-muted tnum">({jobs.length})</span></h2>
        <RecordsToggle rows={Math.min(400, jobs.length)}>
          <table className="table"><thead><tr><th>Work order</th><th>Ward</th><th>Method</th><th>Completed</th><th>Bill</th><th>× rate</th><th>SLA</th><th>Reopened</th></tr></thead>
            <tbody>{jobs.slice(0, 400).map((w) => <tr key={w.work_order_id}><td><Link className="font-mono underline" href={`/accountability/work-orders/${w.work_order_id}`}>{w.work_order_id}</Link></td><td>{w.ward_code}</td><td>{w.repair_method}</td><td className="whitespace-nowrap">{formatDateIST(w.completed_at)}</td><td>{inr(w.cost_inr)}</td><td className={w.cost_ratio > NORMAL_BAND_MAX ? 'font-semibold text-crit' : ''}>{w.cost_ratio.toFixed(2)}</td><td>{w.sla_met ? 'met' : 'missed'}</td><td>{w.reopened_within_30d ? 'yes' : 'no'}</td></tr>)}</tbody></table>
        </RecordsToggle>
      </section>
    </div>
  );
}
