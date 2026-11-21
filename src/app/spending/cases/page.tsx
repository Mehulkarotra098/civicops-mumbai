import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { SyntheticNote } from '@/components/ui';
import { CaseTable } from '@/components/CaseTable';
import { Icon } from '@/components/icons';
import { RankBars } from '@/components/charts/RankBars';
import { ChartCaption, Legend, RecordsToggle } from '@/components/charts/ChartCard';
import { CountUp } from '@/components/Visuals';

export const dynamic = 'force-dynamic';

type Group = { key: string; open: number; overdue: number; review: number };

export default async function PublicCases({ searchParams }: { searchParams: Promise<{ status?: string; ward?: string; kind?: string; by?: string }> }) {
  const sp = await searchParams;
  const conds: string[] = ['true']; const params: unknown[] = [];
  if (sp.ward) { params.push(sp.ward); conds.push(`c.ward_code = $${params.length}`); }
  if (sp.kind) { params.push(sp.kind); conds.push(`c.kind = $${params.length}`); }
  if (sp.status === 'overdue') conds.push(`c.status in ('awaiting_response','needs_evidence') and c.response_due_at < now()`);
  else if (sp.status === 'decided') conds.push(`c.decision is not null`);
  else if (sp.status === 'review') conds.push(`c.status = 'awaiting_review'`);
  const by = sp.by === 'ward' ? 'ward' : 'office';
  const d = await withSystem(async (q) => {
    const cases = await publicCases(q, conds.join(' and ') + ` order by (c.kind = 'question') desc, c.is_demo_example desc, c.escalated_at desc nulls last, c.amount_under_review desc nulls last limit 200 --`, params);
    // Unresolved cases (not justified / corrected / closed), counted per office and per ward.
    const group = async (col: string) => (await q.query<Group>(
      `select ${col} as key, count(*)::int as open,
         count(*) filter (where status in ('awaiting_response','needs_evidence') and (response_due_at < now() or escalated_at is not null))::int as overdue,
         count(*) filter (where status = 'awaiting_review')::int as review
       from accountability_cases where status not in ('justified','corrected','closed') group by 1 order by open desc, key`)).rows;
    const tot = (await q.query<{ total: number; open: number; overdue: number; decided: number; questions: number }>(
      `select count(*)::int as total, count(*) filter (where status not in ('justified','corrected','closed'))::int as open,
         count(*) filter (where status in ('awaiting_response','needs_evidence') and (response_due_at < now() or escalated_at is not null))::int as overdue,
         count(*) filter (where decision is not null)::int as decided, count(*) filter (where kind = 'question')::int as questions from accountability_cases`)).rows[0];
    return { cases, office: await group('responsible_office'), ward: await group('ward_code'), tot };
  }, await getDb());
  const qs = (p: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const groups = by === 'ward' ? d.ward : d.office;
  const top = groups.slice(0, 12);
  const decidedPct = d.tot.total ? Math.round((d.tot.decided / d.tot.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <section className="hero-drift relative -mx-4 -mt-6 overflow-hidden px-5 pb-7 pt-9 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8">
        <div className="hero-grid" aria-hidden="true" />
        <div className="relative">
          <div className="fade-up d1 kicker text-teal-300">WardProof · public accountability cases</div>
          <h1 className="fade-up d2 mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Questions about spending</h1>
          <p className="fade-up d3 mt-2 max-w-2xl text-slate-300">Every flagged expense and every resident question has a responsible office, a response deadline and an independent decision. A question, not a finding.</p>
          <ul className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4" aria-label="Case totals">
            {[
              { label: 'Waiting for an answer', v: d.tot.open, cls: 'text-white', href: qs({ status: undefined }) },
              { label: 'Response overdue', v: d.tot.overdue, cls: 'text-red-300', href: qs({ status: 'overdue' }) },
              { label: 'Resident questions', v: d.tot.questions, cls: 'text-amber-300', href: qs({ kind: 'question' }) },
              { label: `Decided (${decidedPct}%)`, v: d.tot.decided, cls: 'text-teal-300', href: qs({ status: 'decided' }) },
            ].map((s) => (
              <li key={s.label} className="bg-navy-950/70"><Link href={s.href} className="block px-4 py-3 hover:bg-navy-900/80"><span className={`block text-2xl font-extrabold sm:text-3xl ${s.cls}`}><CountUp value={s.v} /></span><span className="text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</span></Link></li>
            ))}
          </ul>
        </div>
      </section>
      <SyntheticNote />

      <section className="card p-4 sm:p-6" aria-labelledby="rank-h" data-testid="cases-ranked">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker text-crit">Unresolved cases</div>
            <h2 id="rank-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Who has the most questions to answer</h2>
            <p className="mt-1 text-sm text-muted">Open cases per {by === 'ward' ? 'ward' : 'responsible office'}, most first. A red bar means at least one response is past its deadline.</p>
          </div>
          <div className="flex gap-1 rounded-full border border-line bg-surface p-1 text-sm font-semibold" role="group" aria-label="Group by">
            <Link href={qs({ by: undefined })} aria-current={by === 'office' ? 'true' : undefined} className={`rounded-full px-3 py-1.5 ${by === 'office' ? 'bg-action text-white!' : 'text-ink'}`}>By office</Link>
            <Link href={qs({ by: 'ward' })} aria-current={by === 'ward' ? 'true' : undefined} className={`rounded-full px-3 py-1.5 ${by === 'ward' ? 'bg-action text-white!' : 'text-ink'}`}>By ward</Link>
          </div>
        </div>
        <div className="mt-3"><Legend items={[{ label: 'Open cases', swatch: 'bg-action' }, { label: 'Open cases, at least one response overdue', swatch: 'bg-crit' }]} /></div>
        <div className="mt-3 grid gap-x-10 lg:grid-cols-2">
          {[top.slice(0, 6), top.slice(6, 12)].filter((p) => p.length).map((part, pi) => (
            <RankBars key={pi} rows={part.map((g, i) => ({
              key: g.key, label: by === 'ward' ? `Ward ${g.key}` : g.key, sub: g.review ? `${g.review} awaiting independent review` : undefined, value: g.open, tone: g.overdue ? 'crit' as const : 'action' as const,
              display: <><span className="tnum">{g.open}</span> <span className="text-xs font-normal text-muted">open</span>{g.overdue ? <span className="ml-1 text-xs text-crit tnum">· {g.overdue} overdue</span> : null}</>,
              aria: `${by === 'ward' ? `Ward ${g.key}` : g.key}: ${g.open} open cases, ${g.overdue} overdue (rank ${pi * 6 + i + 1})`,
              href: by === 'ward' ? qs({ ward: g.key, by: 'ward' }) : undefined,
            }))} max={top[0]?.open} numbered={false} />
          ))}
        </div>
        <div className="mt-3"><ChartCaption c={{ period: 'all cases to date', unit: 'number of cases', n: `${d.tot.open} unresolved cases across ${groups.length} ${by === 'ward' ? 'wards' : 'offices'} (top 12 shown)`, source: 'accountability_cases (this app)' }} /></div>
        <div className="mt-3">
          <RecordsToggle rows={groups.length}>
            <table className="table"><thead><tr><th>{by === 'ward' ? 'Ward' : 'Responsible office'}</th><th>Open</th><th>Response overdue</th><th>Awaiting review</th></tr></thead>
              <tbody>{groups.map((g) => <tr key={g.key}><td>{by === 'ward' ? <Link className="underline" href={qs({ ward: g.key })}>Ward {g.key}</Link> : g.key}</td><td>{g.open}</td><td className={g.overdue ? 'font-semibold text-crit' : ''}>{g.overdue}</td><td>{g.review}</td></tr>)}</tbody></table>
          </RecordsToggle>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="list-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="list-h" className="mr-2 text-xl font-extrabold tracking-tight">Cases{sp.ward ? ` in Ward ${sp.ward}` : ''} <span className="text-sm font-normal text-muted tnum">({d.cases.length}{d.cases.length === 200 ? ', showing up to 200' : ''})</span></h2>
          {sp.ward ? <Link href={qs({ ward: undefined })} className="chip border-gray-300 bg-white text-gray-700"><Icon name="x" className="h-3 w-3" />Ward {sp.ward}</Link> : null}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[['', 'All'], ['overdue', 'Response overdue'], ['review', 'Awaiting independent review'], ['decided', 'Decided']].map(([k, l]) => <Link key={k} href={qs({ status: k || undefined })} className={`inline-flex min-h-11 items-center rounded-full border px-4 font-semibold ${(sp.status ?? '') === k ? 'border-action bg-action text-white!' : 'border-gray-300 bg-white'}`}>{l}</Link>)}
          <Link href={qs({ kind: sp.kind === 'question' ? undefined : 'question' })} className={`inline-flex min-h-11 items-center rounded-full border px-4 font-semibold ${sp.kind === 'question' ? 'border-action bg-action text-white!' : 'border-gray-300 bg-white'}`}>Resident questions only</Link>
        </div>
        <CaseTable cases={d.cases} empty="No cases match." />
      </section>
    </div>
  );
}
