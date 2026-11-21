import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { BUDGET_PERIOD, DOUBLE_BILL_WINDOW_DAYS, OVER_RATE_THRESHOLD, loadHistory, moneyTrail, nextRupee, scorecards, type FlagType } from '@/lib/history';
import { publicFigures, questionedByWorkOrder } from '@/lib/figures';
import { inr, inrShort } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AnimatedBar, SegmentBar, type Tone } from '@/components/Visuals';
import { ChartCaption, Legend, RecordsToggle } from '@/components/charts/ChartCard';
import { FairBars, durabilityWord } from '@/components/charts/FairBars';
import { Ring } from '@/components/charts/Ring';

type SP = Record<string, string | undefined>;
const FLAG_LABEL: Record<FlagType, string> = { over_rate: 'Billed above the rate card', double_billing: 'Possible double billing', dlp_paid: 'Paid while under defect liability', over_budget: 'Billed after the budget ran out', incomplete_evidence: 'No completion evidence', sla_missed: 'Missed time target (context)', reopened: 'Fix failed in 30 days (context)', data_quality: 'Record inconsistent' };
const FLAG_META: Record<FlagType, { tone: Tone; chip: string; icon: string; note: string }> = {
  over_rate: { tone: 'crit', chip: 'border-red-200 bg-crit-soft text-crit', icon: 'rupee', note: `Bill more than ${OVER_RATE_THRESHOLD}× the rate card` },
  double_billing: { tone: 'violet', chip: 'border-violet-200 bg-violet-50 text-violet-800', icon: 'transfer', note: `Same road and work within ${DOUBLE_BILL_WINDOW_DAYS} days, no complaint` },
  dlp_paid: { tone: 'std', chip: 'border-orange-200 bg-std-soft text-std', icon: 'shield', note: 'Road still under the contractor’s guarantee' },
  over_budget: { tone: 'med', chip: 'border-yellow-200 bg-med-soft text-med', icon: 'alert', note: 'Billed after the ward budget was used up' },
  incomplete_evidence: { tone: 'action', chip: 'border-gray-300 bg-gray-50 text-gray-700', icon: 'camera', note: 'No remark, measurement or photo on record' },
  sla_missed: { tone: 'action', chip: 'border-gray-300 bg-gray-50 text-gray-700', icon: 'clock', note: 'Shown with the rain during the job' },
  reopened: { tone: 'action', chip: 'border-gray-300 bg-gray-50 text-gray-700', icon: 'history', note: 'Shown with the redo work order' },
  data_quality: { tone: 'action', chip: 'border-gray-300 bg-gray-50 text-gray-700', icon: 'info', note: 'SLA result contradicts its own timestamps' },
};
const MONEY: FlagType[] = ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'];
const CONTEXT: FlagType[] = ['incomplete_evidence', 'reopened', 'sla_missed', 'data_quality'];

export default async function Accountability({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'trail';
  const ward = sp.ward ?? '';
  const db = await getDb();
  const data = await withSystem(async (q) => {
    const h = await loadHistory(q);
    return { h, fig: await publicFigures(q, h), trail: moneyTrail(h), cards: scorecards(h), rupee: tab === 'rupee' ? await nextRupee(q, h, ward || 'K/W') : null };
  }, db);
  const { h, trail, fig } = data;
  const scoped = h.flags.filter((f) => !ward || f.ward_code === ward);
  const qd = questionedByWorkOrder(scoped);
  // Counted once per work order: each questioned bill sits under its largest money flag.
  const once = MONEY.map((type) => {
    const rows = [...qd.perWorkOrder.values()].filter((f) => f.type === type);
    const all = scoped.filter((f) => f.type === type);
    return { type, amount: rows.reduce((s, f) => s + f.amount_at_issue, 0), wos: rows.length, allFlags: all.length, allAmount: all.reduce((s, f) => s + f.amount_at_issue, 0) };
  });
  const flags = scoped.filter((f) => (sp.type ? f.type === sp.type : MONEY.includes(f.type)) && (!sp.contractor || f.contractor_id === sp.contractor));
  const qs = (p: SP) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const wardRows = trail.filter((w) => !ward || w.ward_code === ward);
  const tabs: [string, string, string][] = [['trail', 'Ward money trail', 'map'], ['flags', `Audit flags (${scoped.filter((f) => MONEY.includes(f.type)).length})`, 'alert'], ['contractors', 'Contractor scorecards', 'wrench'], ['rupee', 'Next-rupee plan', 'rupee']];

  return (
    <div className="space-y-6">
      <section className="hero-drift relative -mx-4 -mt-6 overflow-hidden px-5 pb-7 pt-9 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow amber -right-20 -top-24 h-72 w-72" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="fade-up d1 kicker text-teal-300">Historical accountability · synthetic 2025 monsoon records</div>
            <h1 className="fade-up d2 mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Follow the rupee</h1>
            <p className="fade-up d3 mt-2 text-slate-300">Where each ward&apos;s road-repair money went, whether the work held up, and where the next rupee should go. Flags are review signals: a question, not a finding.</p>
          </div>
          <Link href="/accountability/work-orders/WO25-01590" className="btn-primary fade-up d4"><span className="inline-flex items-center gap-2 text-white"><Icon name="link" />Trace Link Road (WO25-01590)</span></Link>
        </div>
        <ul className="relative mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4" aria-label="Key figures">
          {[
            { l: `Approved budget (${fig.wards} wards)`, v: inrShort(fig.budget), c: 'text-white' },
            { l: 'Billed in the budget period', v: inrShort(fig.billed), c: 'text-white' },
            { l: 'Questioned, once per work order', v: inrShort(fig.questioned), c: 'text-red-300' },
            { l: 'Work orders questioned', v: fig.questionedWorkOrders.toLocaleString('en-IN'), c: 'text-amber-300' },
          ].map((s) => <li key={s.l} className="bg-navy-950/70 px-4 py-3"><span className={`block text-2xl font-extrabold tnum ${s.c}`}>{s.v}</span><span className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.l}</span></li>)}
        </ul>
      </section>
      <SyntheticNote>All figures here come from the organiser&apos;s synthetic dataset (2,499 work orders, 6,501 complaints). Contractors are fictional. Flags are <b>review signals, not findings of wrongdoing</b>.</SyntheticNote>

      {/* Focal: flagged money by type, each work order counted once */}
      <section className="card p-4 sm:p-6" aria-labelledby="ft-h" data-testid="flag-types">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="kicker text-crit">What the audit flagged{ward ? ` · Ward ${ward}` : ' · all wards'}</div>
            <h2 id="ft-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Flagged money by type</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">Each work order is counted once, under its largest money flag, so the parts add up to the total; a bill can carry more than one flag, and the “all flags” figure on each tile includes those overlaps.</p>
          </div>
          <div className="sm:text-right"><div className="text-3xl font-extrabold text-crit tnum">{inrShort(qd.total)}</div><div className="text-xs text-muted tnum">{qd.workOrders} work orders · {qd.flags} money flags</div></div>
        </div>
        <div className="mt-4"><SegmentBar segments={once.map((m) => ({ key: m.type, value: m.amount, tone: FLAG_META[m.type].tone, href: qs({ tab: 'flags', type: m.type }), label: `${FLAG_LABEL[m.type]}: ${inrShort(m.amount)} on ${m.wos} work orders` }))} /></div>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {once.map((m) => (
            <li key={m.type}>
              <Link href={qs({ tab: 'flags', type: m.type })} className={`lift block h-full rounded-xl border p-4 ${FLAG_META[m.type].chip}`}>
                <div className="flex items-center gap-2 text-sm font-bold"><Icon name={FLAG_META[m.type].icon} className="h-4 w-4 shrink-0" />{FLAG_LABEL[m.type]}</div>
                <div className="mt-2 text-2xl font-extrabold tnum">{inrShort(m.amount)}</div>
                <div className="text-xs text-ink/80 tnum">{m.wos} work orders counted here · {fig.questioned ? Math.round((m.amount / Math.max(1, qd.total)) * 100) : 0}% of the total</div>
                <div className="mt-1 text-xs text-ink/70 tnum">All flags of this type: {m.allFlags} ({inrShort(m.allAmount)})</div>
                <div className="mt-1 text-xs text-ink/70">{FLAG_META[m.type].note}</div>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 kicker">Context signals (never counted as money)</div>
        <ul className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CONTEXT.map((t) => {
            const n = scoped.filter((f) => f.type === t).length;
            return <li key={t}><Link href={qs({ tab: 'flags', type: t })} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs hover:border-action"><Icon name={FLAG_META[t].icon} className="h-4 w-4 shrink-0 text-muted" /><span className="min-w-0"><b className="block text-base tnum">{n.toLocaleString('en-IN')}</b><span className="block text-muted">{FLAG_LABEL[t]}</span></span></Link></li>;
          })}
        </ul>
        <div className="mt-4"><ChartCaption c={{ period: 'all work orders, Jun–Oct 2025', unit: '₹ at issue', n: `${qd.workOrders} questioned work orders`, source: 'work_orders.csv, rate_card.csv, roads.csv, wards.csv' }} /></div>
        <div className="mt-3">
          <RecordsToggle rows={once.length}>
            <table className="table"><thead><tr><th>Flag type</th><th>Counted once (₹)</th><th>Work orders counted here</th><th>All flags of this type</th><th>All-flag amount (overlaps)</th></tr></thead>
              <tbody>{once.map((m) => <tr key={m.type}><td>{FLAG_LABEL[m.type]}</td><td>{inr(m.amount)}</td><td>{m.wos}</td><td>{m.allFlags}</td><td>{inr(m.allAmount)}</td></tr>)}</tbody></table>
          </RecordsToggle>
        </div>
      </section>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Sections">
        {tabs.map(([k, l, icon]) => (
          <Link key={k} href={qs({ tab: k })} aria-current={tab === k ? 'page' : undefined} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${tab === k ? 'border-action bg-action text-white!' : 'border-gray-300 bg-white'}`}><Icon name={icon} className="h-4 w-4" />{l}</Link>
        ))}
        <Link href="/accountability/complaints" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold"><Icon name="list" className="h-4 w-4" />Complaints → work orders</Link>
        <form className="flex gap-2 sm:ml-auto"><input type="hidden" name="tab" value={tab} /><select name="ward" defaultValue={ward} className="input w-40" aria-label="Ward"><option value="">All wards</option>{trail.map((w) => <option key={w.ward_code} value={w.ward_code}>Ward {w.ward_code}</option>)}</select><button className="btn-secondary">Go</button></form>
      </nav>

      {tab === 'trail' ? (
        <section className="space-y-3" id="trail" aria-label="Ward money trail">
          <Legend items={[{ label: 'Billed, within budget', swatch: 'bg-action' }, { label: 'Billed, over budget', swatch: 'bg-crit' }, { label: 'Approved budget (track)', swatch: 'bg-action-soft' }]} />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wardRows.map((w, i) => {
              const over = (w.utilisation ?? 0) > 1;
              return (
                <li key={w.ward_code} className={`card min-w-0 p-4 ${over ? 'border-red-200' : ''}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Link className="text-base font-bold text-action! underline" href={`/wards/${encodeURIComponent(w.ward_code)}`}>Ward {w.ward_code}</Link>
                    <span className={`text-lg font-extrabold tnum ${over ? 'text-crit' : ''}`}>{w.utilisation != null ? `${Math.round(w.utilisation * 100)}%` : '—'}</span>
                  </div>
                  <div className="truncate text-xs text-muted">{w.ward_name} · low-lying index {w.low_lying_index}</div>
                  <div className="mt-2"><AnimatedBar pct={Math.min(100, (w.utilisation ?? 0) * 100)} tone={over ? 'crit' : 'action'} delayMs={Math.min(i * 30, 500)} label={`Ward ${w.ward_code}: ${inr(w.spend)} of ${inr(w.budget_inr_2025)}`} /></div>
                  <div className="mt-1 text-xs tnum">{inrShort(w.spend)} of {inrShort(w.budget_inr_2025)} · {w.jobs} jobs</div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {w.flag_counts.over_rate ? <Link href={qs({ tab: 'flags', type: 'over_rate', ward: w.ward_code })} className={`chip ${FLAG_META.over_rate.chip}`}>{w.flag_counts.over_rate} above rate</Link> : null}
                    {w.flag_counts.double_billing ? <Link href={qs({ tab: 'flags', type: 'double_billing', ward: w.ward_code })} className={`chip ${FLAG_META.double_billing.chip}`}>{w.flag_counts.double_billing} double bills?</Link> : null}
                    {w.flag_counts.dlp_paid ? <Link href={qs({ tab: 'flags', type: 'dlp_paid', ward: w.ward_code })} className={`chip ${FLAG_META.dlp_paid.chip}`}>{w.flag_counts.dlp_paid} under DLP</Link> : null}
                    {w.failed_fix_spend ? <span className="chip border-yellow-200 bg-med-soft text-med tnum">{inrShort(w.failed_fix_spend)} on failed fixes</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <RecordsToggle rows={wardRows.length}>
            <table className="table">
              <thead><tr><th>Ward</th><th>Low-lying index</th><th>Budget ({BUDGET_PERIOD.label})</th><th>Spent in period</th><th>Used</th><th>Jobs</th><th>Failed-fix spend</th><th>Excess over 1.3× rate</th><th>Possible double bills</th><th>Paid under DLP</th><th>Bills after period</th></tr></thead>
              <tbody>
                {wardRows.map((w) => (
                  <tr key={w.ward_code}>
                    <td><Link className="font-semibold text-action! underline" href={`/wards/${encodeURIComponent(w.ward_code)}`}>{w.ward_code}</Link><div className="text-xs text-muted">{w.ward_name}</div></td>
                    <td>{w.low_lying_index}</td><td>{inr(w.budget_inr_2025)}</td><td>{inr(w.spend)}</td>
                    <td className={w.utilisation && w.utilisation > 1 ? 'font-semibold text-crit' : ''}>{w.utilisation != null ? `${Math.round(w.utilisation * 100)}%` : '—'}{w.utilisation && w.utilisation > 1 ? ' (over)' : ''}</td>
                    <td>{w.jobs}</td><td>{inr(w.failed_fix_spend)}</td>
                    <td>{inr(w.flagged_over_rate_excess)} <span className="text-xs text-muted">({w.flag_counts.over_rate})</span></td>
                    <td>{inr(w.flagged_double_billing)} <span className="text-xs text-muted">({w.flag_counts.double_billing})</span></td>
                    <td>{inr(w.flagged_dlp_paid)} <span className="text-xs text-muted">({w.flag_counts.dlp_paid})</span></td>
                    <td className="text-xs">{inr(w.spend_outside_period)} ({w.jobs_outside_period})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </RecordsToggle>
          <p className="text-xs text-muted">Period: jobs assigned {BUDGET_PERIOD.label}; later jobs are shown separately. Low-lying wards flood more, so higher spend there is context, not blame. “Excess” is the amount above 1.3× the rate card, so normal variation is never counted.</p>
        </section>
      ) : null}

      {tab === 'flags' ? (
        <section className="space-y-3" id="flags" aria-label="Audit flags">
          <div className="flex flex-wrap gap-2">
            {(['', ...MONEY, ...CONTEXT] as const).map((t) => <Link key={t} href={qs({ type: t || undefined })} className={`chip min-h-9 ${sp.type === t || (!sp.type && !t) ? 'border-action bg-action text-white!' : t ? FLAG_META[t].chip : 'border-gray-300 bg-white text-gray-700'}`}>{t ? FLAG_LABEL[t] : 'Money flags'} <span className="tnum">({scoped.filter((f) => (t ? f.type === t : MONEY.includes(f.type))).length})</span></Link>)}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {flags.slice(0, 40).map((f) => (
              <li key={`${f.type}-${f.work_order_id}`} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link className="font-mono font-bold text-action! underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link>
                    <div className="text-xs text-muted">Ward {f.ward_code} · <Link className="underline" href={`/accountability/contractors/${f.contractor_id}`}>{f.contractor_id}</Link></div>
                  </div>
                  {MONEY.includes(f.type) ? <span className="text-lg font-extrabold text-crit tnum">{inr(f.amount_at_issue)}</span> : null}
                </div>
                <span className={`chip mt-2 ${FLAG_META[f.type].chip}`}><Icon name={FLAG_META[f.type].icon} className="h-3.5 w-3.5" />{FLAG_LABEL[f.type]}</span>
                <p className="mt-2 text-xs text-ink/80">{f.reason}</p>
              </li>
            ))}
          </ul>
          {flags.length > 40 ? <p className="text-xs text-muted tnum">Showing 40 of {flags.length.toLocaleString('en-IN')} as cards; the table below has up to 300.</p> : null}
          <RecordsToggle rows={Math.min(300, flags.length)}>
            <table className="table">
              <thead><tr><th>Work order</th><th>Flag</th><th>Ward</th><th>Contractor</th><th>Amount at issue</th><th>Why (one line)</th></tr></thead>
              <tbody>{flags.slice(0, 300).map((f) => (
                <tr key={`${f.type}-${f.work_order_id}`}>
                  <td><Link className="font-mono font-semibold text-action! underline" href={`/accountability/work-orders/${f.work_order_id}`}>{f.work_order_id}</Link></td>
                  <td><span className={`chip ${FLAG_META[f.type].chip}`}>{FLAG_LABEL[f.type]}</span></td>
                  <td>{f.ward_code}</td><td><Link className="underline" href={`/accountability/contractors/${f.contractor_id}`}>{f.contractor_id}</Link></td>
                  <td className="whitespace-nowrap">{MONEY.includes(f.type) ? inr(f.amount_at_issue) : '—'}</td><td className="text-xs">{f.reason}</td>
                </tr>
              ))}</tbody>
            </table>
          </RecordsToggle>
          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-semibold text-action">How the auditor decides (and what it ignores)</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              <li><b className="text-ink">Above the rate card:</b> bill ÷ reference &gt; {OVER_RATE_THRESHOLD}. Normal jobs vary 20–30%; in the data every normal job is ≤ 1.32× and the next value is 1.35×, so jobs inside the normal band are never flagged.</li>
              <li><b className="text-ink">Possible double billing:</b> no complaint linked, and the same road + same work type was billed within {DOUBLE_BILL_WINDOW_DAYS} days.</li>
              <li><b className="text-ink">Paid under defect liability:</b> the road is still in its DLP after resurfacing, so the original contractor should repair it at no cost.</li>
              <li>Missed time targets and fixes that failed within 30 days are <b className="text-ink">context signals</b>, with the rain recorded during the job and the redo work order. They are not counted as money.</li>
              <li>Records whose SLA result contradicts their own timestamps are listed as <b className="text-ink">data-quality</b> issues.</li>
            </ul>
          </details>
        </section>
      ) : null}

      {tab === 'contractors' ? (
        <section className="space-y-3" id="contractors" aria-label="Contractor scorecards">
          <p className="text-sm text-muted">A fair comparison: speed is shown again with heavy-rain jobs left out, and durability is compared with what is normal for the repair methods each contractor used.</p>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.cards.map((c) => {
              const flagsN = c.over_rate_flags + c.double_billing_flags;
              return (
                <li key={c.contractor_id} className="card lift p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><Link className="font-bold text-action! underline" href={`/accountability/contractors/${c.contractor_id}`}>{c.contractor_name}</Link><div className="text-xs text-muted tnum">{c.jobs} jobs · {inrShort(c.billed)} billed</div></div>
                    <span className={`chip ${flagsN ? 'border-red-200 bg-crit-soft text-crit' : 'border-green-200 bg-ok-soft text-ok'}`}>{flagsN ? `${flagsN} bills to review` : 'No bill flags'}</span>
                  </div>
                  <div className="mt-3"><FairBars c={c} /></div>
                </li>
              );
            })}
          </ul>
          <RecordsToggle rows={data.cards.length}>
            <table className="table">
              <thead><tr><th>Contractor</th><th>Jobs</th><th>Billed</th><th>SLA met</th><th>SLA met (no heavy rain)</th><th>Reopened</th><th>Expected for methods used</th><th>Durability</th><th>Typical bill vs rate</th><th>Flags</th><th>Avg low-lying index</th></tr></thead>
              <tbody>{data.cards.map((c) => (
                <tr key={c.contractor_id}>
                  <td><Link className="font-semibold text-action! underline" href={`/accountability/contractors/${c.contractor_id}`}>{c.contractor_name}</Link></td>
                  <td>{c.jobs}</td><td>{inrShort(c.billed)}</td><td>{Math.round(c.sla_met_pct * 100)}%</td><td>{c.sla_met_pct_outside_heavy_rain != null ? `${Math.round(c.sla_met_pct_outside_heavy_rain * 100)}%` : '—'}</td>
                  <td>{Math.round(c.reopen_pct * 100)}%</td><td>{Math.round(c.expected_reopen_pct * 100)}%</td><td>{durabilityWord(c).word}</td>
                  <td>{c.median_cost_ratio.toFixed(2)}×</td><td>{c.over_rate_flags + c.double_billing_flags}</td><td>{c.avg_low_lying_index.toFixed(2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </RecordsToggle>
        </section>
      ) : null}

      {tab === 'rupee' && data.rupee ? (() => {
        const r = data.rupee;
        const top = Math.max(1, r.plan[0]?.score ?? 1);
        const allocated = r.plan.reduce((s, p) => s + p.allocate, 0);
        const usedPct = r.budget ? (r.spend / r.budget) * 100 : 0;
        return (
          <section className="space-y-4" id="rupee" aria-label="Next-rupee plan">
            <div className="card grid gap-5 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-6">
              <div className="flex justify-center">
                <Ring pct={usedPct} size={136} label={`Ward ${r.ward}: ${Math.round(usedPct)}% of budget spent`}>
                  <span className="text-2xl font-extrabold tnum">{Math.round(usedPct)}%</span><span className="text-[10px] font-semibold uppercase text-muted">spent</span>
                </Ring>
              </div>
              <div className="min-w-0">
                <div className="kicker text-action">Next-rupee plan · Ward {r.ward}{!ward ? ' (pick a ward above)' : ''}</div>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{r.remaining >= 0 ? <>{inrShort(r.remaining)} left to spend, <span className="text-action">{inrShort(allocated)}</span> planned below</> : <span className="text-crit">Overspent by {inrShort(-r.remaining)}: no headroom</span>}</h2>
                <p className="mt-1 text-sm text-muted">Roads are ranked by risk (open complaints, failed fixes, flood hotspots, traffic, accidents, ambulance routes, schools, bus routes). Methods are chosen by cost per lasting fix, not the cheapest patch. Roads under DLP are claimed from the original contractor at no cost.</p>
                <div className="mt-2 text-xs text-muted tnum">Budget {inr(r.budget)} · spent {inr(r.spend)}</div>
              </div>
            </div>
            <Legend items={[{ label: 'Highest risk (top 3)', swatch: 'bg-crit' }, { label: 'High (4–6)', swatch: 'bg-std' }, { label: 'Elevated', swatch: 'bg-action' }, { label: '₹ allocated, share of what is left', swatch: 'bg-ok' }]} />
            <ol className="grid gap-3 lg:grid-cols-2">
              {r.plan.map((p, i) => {
                const tone: Tone = i < 3 ? 'crit' : i < 6 ? 'std' : 'action';
                const share = r.remaining > 0 ? (p.allocate / r.remaining) * 100 : 0;
                return (
                  <li key={p.road_id} className={`card min-w-0 p-4 ${i < 3 ? 'border-red-200' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white tnum ${i < 3 ? 'bg-crit' : i < 6 ? 'bg-std' : 'bg-action'}`}>{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Link className="font-bold text-action! underline" href={`/accountability/roads/${p.road_id}`}>{p.road_name} · seg {p.segment_no}</Link>
                        <div className="text-xs text-muted">{p.road_id} · {p.road_type} · {p.surface}{p.under_dlp ? ' · under DLP' : ''}</div>
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2"><AnimatedBar pct={(p.score / top) * 100} tone={tone} delayMs={i * 50} label={`Risk score ${p.score}`} /><span className="text-right text-sm font-bold tnum">{p.score}</span></div>
                        <div className="mt-2 flex flex-wrap gap-1.5">{p.parts.slice(0, 4).map((x) => <span key={x.label} className="chip max-w-full whitespace-normal border-gray-200 bg-surface font-medium text-ink/80">{x.label} <b className="tnum">+{x.points}</b></span>)}</div>
                        <div className="mt-3 rounded-lg bg-surface p-3 text-xs">
                          {p.recommended ? <div><b>{p.recommended.method}</b> for {p.work_type} · ~<span className="tnum">{inr(p.recommended.est_cost)}</span> · <span className="tnum">{Math.round(p.recommended.reopen_rate * 100)}%</span> reopen rate · <span className="tnum">{inr(p.recommended.cost_per_lasting_fix)}</span> per lasting fix</div> : null}
                          {p.standby ? <div className="mt-1 text-muted">{p.standby}</div> : null}
                          <div className="mt-2 flex items-baseline justify-between gap-2"><span className="font-semibold">{p.action}</span>{p.allocate ? <b className="text-base text-ok tnum">{inr(p.allocate)}</b> : null}</div>
                          {p.allocate ? <div className="mt-1"><AnimatedBar pct={share} tone="ok" height="h-2" label={`${Math.round(share)}% of the remaining budget`} /><div className="mt-0.5 text-[11px] text-muted tnum">{Math.round(share)}% of what is left</div></div> : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            <ChartCaption c={{ period: BUDGET_PERIOD.label, unit: 'risk points; ₹ allocation', n: `${r.plan.length} road segments ranked in Ward ${r.ward}`, source: 'roads.csv, complaints.csv, flood_hotspots.csv, road_traffic.csv, accidents.csv, facilities.csv, rate_card.csv' }} />
            <RecordsToggle rows={r.plan.length}>
              <table className="table">
                <thead><tr><th>#</th><th>Road segment</th><th>Risk score</th><th>Why</th><th>Recommended</th><th>Action</th><th>Allocated</th></tr></thead>
                <tbody>{r.plan.map((p, i) => (
                  <tr key={p.road_id}><td>{i + 1}</td><td>{p.road_name} · seg {p.segment_no}<div className="text-xs text-muted">{p.road_id}</div></td><td>{p.score}</td>
                    <td className="text-xs">{p.parts.map((x) => `${x.label} (+${x.points})`).join('; ')}</td>
                    <td className="text-xs">{p.recommended ? `${p.recommended.method}, ~${inr(p.recommended.est_cost)}` : '—'}</td><td className="text-xs">{p.action}</td><td>{p.allocate ? inr(p.allocate) : '—'}</td></tr>
                ))}</tbody>
              </table>
            </RecordsToggle>
          </section>
        );
      })() : null}
    </div>
  );
}
