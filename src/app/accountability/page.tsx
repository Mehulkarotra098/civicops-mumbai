import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { BUDGET_PERIOD, DOUBLE_BILL_WINDOW_DAYS, OVER_RATE_THRESHOLD, loadHistory, moneyTrail, nextRupee, scorecards } from '@/lib/history';
import { inr, inrShort } from '@/lib/time';
import { Kpi, PageHeader, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';

type SP = Record<string, string | undefined>;
const FLAG_LABEL = { over_rate: 'Billed above the rate card', double_billing: 'Possible double billing', dlp_paid: 'Paid while under defect liability', over_budget: 'Billed after the budget ran out', incomplete_evidence: 'No completion evidence', sla_missed: 'Missed time target (context)', reopened: 'Fix failed in 30 days (context)', data_quality: 'Record inconsistent' } as const;

export default async function Accountability({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'trail';
  const ward = sp.ward ?? '';
  const db = await getDb();
  const data = await withSystem(async (q) => {
    const h = await loadHistory(q);
    return { h, trail: moneyTrail(h), cards: scorecards(h), rupee: tab === 'rupee' ? await nextRupee(q, h, ward || 'K/W') : null };
  }, db);
  const { h, trail } = data;
  const totals = trail.reduce((a, w) => ({ budget: a.budget + w.budget_inr_2025, spend: a.spend + w.spend, outside: a.outside + w.spend_outside_period, failed: a.failed + w.failed_fix_spend, over: a.over + w.flagged_over_rate_excess, dbl: a.dbl + w.flagged_double_billing, dlp: a.dlp + w.flagged_dlp_paid }), { budget: 0, spend: 0, outside: 0, failed: 0, over: 0, dbl: 0, dlp: 0 });
  const allSpend = h.wos.reduce((s, w) => s + w.cost_inr, 0);
  const MONEY = ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'];
  const flags = h.flags.filter((f) => (!ward || f.ward_code === ward) && (sp.type ? f.type === sp.type : MONEY.includes(f.type)) && (!sp.contractor || f.contractor_id === sp.contractor));
  const qs = (p: SP) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <PageHeader kicker="Historical accountability · synthetic 2025 monsoon records" title="Follow the rupee" actions={<Link href="/accountability/work-orders/WO25-01590" className="btn-primary"><Icon name="link" />Trace Link Road (WO25-01590)</Link>}>
        Where each ward's road-repair money went, whether the work held up, and where the next rupee should go. Every figure links to the work orders behind it.
      </PageHeader>
      <SyntheticNote>All figures here come from the organiser's synthetic dataset (2,499 work orders, 6,501 complaints). Contractors are fictional. Flags are <b>review signals, not findings of wrongdoing</b>.</SyntheticNote>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Recorded bills (all jobs)" value={inrShort(allSpend)} sub={`${h.wos.length.toLocaleString('en-IN')} work orders, Jun–Oct 2025`} href={qs({ tab: 'trail' })} />
        <Kpi label={`Budget ${BUDGET_PERIOD.start.slice(5)}→${BUDGET_PERIOD.end.slice(5)}`} value={inrShort(totals.budget)} sub={`Spent in period: ${inrShort(totals.spend)}`} href={qs({ tab: 'trail' })} />
        <Kpi label="Fixes that failed in 30 days" value={inrShort(totals.failed)} sub="Spend on jobs that reopened" href={qs({ tab: 'flags' })} tone="med" />
        <Kpi label="Above-rate-card excess" value={inrShort(totals.over)} sub={`${h.flags.filter((f) => f.type === 'over_rate').length} jobs over ${OVER_RATE_THRESHOLD}×`} href={qs({ tab: 'flags', type: 'over_rate' })} tone="crit" />
        <Kpi label="Paid under DLP" value={inrShort(totals.dlp)} sub={`${h.flags.filter((f) => f.type === 'dlp_paid').length} jobs; recoverable`} href={qs({ tab: 'flags', type: 'dlp_paid' })} tone="crit" />
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Sections">
        {[['trail', 'Ward money trail'], ['flags', `Audit flags (${h.flags.filter((f) => MONEY.includes(f.type)).length})`], ['contractors', 'Contractor scorecards'], ['rupee', 'Next-rupee plan']].map(([k, l]) => (
          <Link key={k} href={qs({ tab: k })} aria-current={tab === k ? 'page' : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</Link>
        ))}
        <Link href="/accountability/complaints" className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold">Complaints → work orders</Link>
        <form className="ml-auto flex gap-2"><input type="hidden" name="tab" value={tab} /><select name="ward" defaultValue={ward} className="input w-40" aria-label="Ward"><option value="">All wards</option>{trail.map((w) => <option key={w.ward_code} value={w.ward_code}>Ward {w.ward_code}</option>)}</select><button className="btn-secondary btn-sm">Go</button></form>
      </nav>

      {tab === 'trail' ? (
        <section className="card overflow-x-auto" id="trail">
          <table className="table">
            <thead><tr><th>Ward</th><th>Low-lying index</th><th>Budget ({BUDGET_PERIOD.label})</th><th>Spent in period</th><th>Used</th><th>Jobs</th><th>Failed-fix spend</th><th>Excess over 1.3× rate</th><th>Possible double bills</th><th>Paid under DLP</th><th>Bills after period</th></tr></thead>
            <tbody>
              {trail.filter((w) => !ward || w.ward_code === ward).map((w) => (
                <tr key={w.ward_code}>
                  <td><Link className="font-semibold text-action underline" href={`/wards/${encodeURIComponent(w.ward_code)}`}>{w.ward_code}</Link><div className="text-xs text-muted">{w.ward_name}</div></td>
                  <td>{w.low_lying_index}</td>
                  <td>{inr(w.budget_inr_2025)}</td><td>{inr(w.spend)}</td>
                  <td className={w.utilisation && w.utilisation > 1 ? 'font-semibold text-crit' : ''}>{w.utilisation != null ? `${Math.round(w.utilisation * 100)}%` : '—'}{w.utilisation && w.utilisation > 1 ? ' (over)' : ''}</td>
                  <td>{w.jobs}</td><td>{inr(w.failed_fix_spend)}</td>
                  <td><Link className="underline" href={qs({ tab: 'flags', type: 'over_rate', ward: w.ward_code })}>{inr(w.flagged_over_rate_excess)}</Link> <span className="text-xs text-muted">({w.flag_counts.over_rate})</span></td>
                  <td><Link className="underline" href={qs({ tab: 'flags', type: 'double_billing', ward: w.ward_code })}>{inr(w.flagged_double_billing)}</Link> <span className="text-xs text-muted">({w.flag_counts.double_billing})</span></td>
                  <td><Link className="underline" href={qs({ tab: 'flags', type: 'dlp_paid', ward: w.ward_code })}>{inr(w.flagged_dlp_paid)}</Link> <span className="text-xs text-muted">({w.flag_counts.dlp_paid})</span></td>
                  <td className="text-xs">{inr(w.spend_outside_period)} ({w.jobs_outside_period})</td>
                </tr>
              ))}
              {!ward ? <tr className="font-semibold"><td>City</td><td></td><td>{inr(totals.budget)}</td><td>{inr(totals.spend)}</td><td>{Math.round((totals.spend / totals.budget) * 100)}%</td><td>{trail.reduce((s, w) => s + w.jobs, 0)}</td><td>{inr(totals.failed)}</td><td>{inr(totals.over)}</td><td>{inr(totals.dbl)}</td><td>{inr(totals.dlp)}</td><td>{inr(totals.outside)}</td></tr> : null}
            </tbody>
          </table>
          <p className="border-t border-line p-3 text-xs text-muted">Period: jobs assigned {BUDGET_PERIOD.label}. Jobs assigned after 30 Sep are shown separately, not counted against the budget. Low-lying wards (index near 1) flood more, so higher spend there is context, not blame. "Excess" is the amount above 1.3× the rate-card reference (the top of the normal band), so normal variation is never counted.</p>
        </section>
      ) : null}

      {tab === 'flags' ? (
        <section className="space-y-3" id="flags">
          <div className="card p-4 text-sm">
            <h2 className="h2">How the auditor decides (and what it ignores)</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li><b className="text-ink">Above the rate card:</b> bill ÷ reference &gt; {OVER_RATE_THRESHOLD}. The repo says normal jobs vary 20–30%; in the data every normal job is ≤ 1.32× and the next value is 1.35×, so jobs inside the normal band are never flagged. Reference = area × rate for per-m² methods, or the flat per-job rate.</li>
              <li><b className="text-ink">Possible double billing:</b> no complaint linked, and the same road + same work type was billed within {DOUBLE_BILL_WINDOW_DAYS} days.</li>
              <li><b className="text-ink">Paid under defect liability:</b> the road is still in its DLP after resurfacing, so the original contractor should repair it at no cost.</li>
              <li>Missed time targets and fixes that failed within 30 days are listed as <b className="text-ink">context signals</b>, each with the rain recorded during the job and the redo work order. They are not counted as money at issue.</li>
              <li>Records whose SLA result contradicts their own timestamps are listed as <b className="text-ink">data-quality</b> issues.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['', 'over_rate', 'double_billing', 'dlp_paid', 'over_budget', 'sla_missed', 'reopened', 'incomplete_evidence', 'data_quality'] as const).map((t) => <Link key={t} href={qs({ type: t || undefined })} className={`chip ${sp.type === t || (!sp.type && !t) ? 'border-action bg-action text-white' : 'border-gray-300 bg-white text-gray-700'}`}>{t ? FLAG_LABEL[t] : 'Money flags'} ({h.flags.filter((f) => (t ? f.type === t : MONEY.includes(f.type))).filter((f) => !ward || f.ward_code === ward).length})</Link>)}
            </div>
          </div>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Work order</th><th>Flag</th><th>Ward</th><th>Contractor</th><th>Amount at issue</th><th>Why (one line)</th></tr></thead>
              <tbody>{flags.slice(0, 300).map((f) => (
                <tr key={`${f.type}-${f.work_order_id}`}>
                  <td><Link className="font-mono font-semibold text-action underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link></td>
                  <td><span className={`chip ${f.type === 'over_rate' ? 'border-red-200 bg-crit-soft text-crit' : f.type === 'double_billing' ? 'border-violet-200 bg-violet-50 text-violet-800' : f.type === 'dlp_paid' ? 'border-orange-200 bg-std-soft text-std' : 'border-gray-300 bg-gray-50 text-gray-700'}`}>{FLAG_LABEL[f.type]}</span></td>
                  <td>{f.ward_code}</td><td><Link className="underline" href={`/accountability/contractors/${f.contractor_id}`}>{f.contractor_id}</Link></td>
                  <td className="whitespace-nowrap">{MONEY.includes(f.type) ? inr(f.amount_at_issue) : '—'}</td><td className="text-xs">{f.reason}</td>
                </tr>
              ))}</tbody>
            </table>
            {flags.length > 300 ? <p className="p-3 text-xs text-muted">Showing 300 of {flags.length}. Narrow by ward or flag type.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'contractors' ? (
        <section className="space-y-3" id="contractors">
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>Contractor</th><th>Jobs</th><th>Billed</th><th>SLA met</th><th>SLA met (no heavy rain)</th><th>Reopened</th><th>Expected for methods used</th><th>Typical bill vs rate</th><th>Flags</th><th>Avg low-lying index of wards worked</th></tr></thead>
              <tbody>{data.cards.map((c) => (
                <tr key={c.contractor_id}>
                  <td><Link className="font-semibold text-action underline" href={`/accountability/contractors/${c.contractor_id}`}>{c.contractor_name}</Link></td>
                  <td>{c.jobs}</td><td>{inrShort(c.billed)}</td><td>{Math.round(c.sla_met_pct * 100)}%</td><td>{c.sla_met_pct_outside_heavy_rain != null ? `${Math.round(c.sla_met_pct_outside_heavy_rain * 100)}%` : '—'}</td>
                  <td className={c.reopen_pct > c.expected_reopen_pct * 1.1 ? 'font-semibold text-crit' : ''}>{Math.round(c.reopen_pct * 100)}%</td><td>{Math.round(c.expected_reopen_pct * 100)}%</td>
                  <td>{c.median_cost_ratio.toFixed(2)}×</td><td>{c.over_rate_flags + c.double_billing_flags}</td><td>{c.avg_low_lying_index.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-2">{data.cards.map((c) => <div key={c.contractor_id} className="card p-4 text-sm"><b>{c.contractor_name}</b><p className="mt-1 text-muted">{c.summary}</p></div>)}</div>
        </section>
      ) : null}

      {tab === 'rupee' && data.rupee ? (
        <section className="space-y-3" id="rupee">
          <div className="card p-4 text-sm">
            <h2 className="h2">Next-rupee plan · Ward {data.rupee.ward}</h2>
            <p className="mt-1 text-muted">Budget {inr(data.rupee.budget)} · spent {inr(data.rupee.spend)} · {data.rupee.remaining >= 0 ? <>remaining <b className="text-ink">{inr(data.rupee.remaining)}</b></> : <b className="text-crit">overspent by {inr(-data.rupee.remaining)}</b>}. Roads are ranked by risk (open complaints, failed fixes, flood hotspots, traffic, accidents, ambulance routes, schools, bus routes). Methods are chosen by cost per lasting fix (reference cost ÷ share that did not reopen), not the cheapest patch. Roads under DLP are claimed from the original contractor.</p>
            {!ward ? <p className="mt-1 text-xs text-muted">Showing K/W by default. Pick a ward above.</p> : null}
          </div>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead><tr><th>#</th><th>Road segment</th><th>Risk score</th><th>Why</th><th>Recommended</th><th>Action</th></tr></thead>
              <tbody>{data.rupee.plan.map((r, i) => (
                <tr key={r.road_id}>
                  <td>{i + 1}</td>
                  <td><Link className="font-semibold text-action underline" href={`/accountability/roads/${r.road_id}`}>{r.road_name} · seg {r.segment_no}</Link><div className="text-xs text-muted">{r.road_id} · {r.road_type} · {r.surface}{r.under_dlp ? ' · under DLP' : ''}</div></td>
                  <td className="w-40"><div className="font-semibold">{r.score}</div><div className="mt-1 h-2 w-full overflow-hidden rounded bg-gray-100" aria-hidden><div className={`h-full rounded ${i < 3 ? 'bg-crit' : i < 6 ? 'bg-amber-500' : 'bg-teal-600'}`} style={{ width: `${Math.round((r.score / Math.max(1, data.rupee!.plan[0].score)) * 100)}%` }} /></div><div className="text-[11px] text-muted">{i < 3 ? 'Highest risk' : i < 6 ? 'High' : 'Elevated'}</div></td>
                  <td className="text-xs"><ul className="list-disc pl-4">{r.parts.slice(0, 4).map((p) => <li key={p.label}>{p.label} (+{p.points})</li>)}</ul></td>
                  <td className="text-xs">{r.recommended ? <><b>{r.recommended.method}</b> for {r.work_type}<br />~{inr(r.recommended.est_cost)} · {Math.round(r.recommended.reopen_rate * 100)}% reopen rate<br />{inr(r.recommended.cost_per_lasting_fix)} per lasting fix{r.standby ? <><br /><span className="text-muted">{r.standby}</span></> : null}</> : '—'}</td>
                  <td className="text-xs">{r.action}{r.allocate ? <><div className="font-semibold">{inr(r.allocate)}</div><div className="mt-1 h-1.5 overflow-hidden rounded bg-gray-100" aria-hidden><div className="h-full bg-action" style={{ width: `${Math.min(100, Math.round((r.allocate / Math.max(1, data.rupee!.remaining)) * 100))}%` }} /></div><div className="text-[11px] text-muted">{Math.round((r.allocate / Math.max(1, data.rupee!.remaining)) * 100)}% of remaining budget</div></> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
