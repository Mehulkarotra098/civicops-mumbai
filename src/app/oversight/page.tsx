import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { caseSettings } from '@/lib/cases';
import { PageHeader, ProgressRing } from '@/components/ui';
import { CaseCards } from '@/app/cases/CaseCards';
import { Icon } from '@/components/icons';
import { OversightTools } from './OversightTools';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function Oversight() {
  const user = await requirePageUser(['auditor', 'super_admin']);
  const d = await withUser(user, async (q) => ({
    settings: await caseSettings(q),
    escalated: await publicCases(q, `c.escalated_at is not null and c.status in ('awaiting_response','needs_evidence') order by c.escalated_at desc limit 100 --`, []),
    review: await publicCases(q, `c.status = 'awaiting_review' order by c.updated_at limit 100 --`, []),
    corrections: await publicCases(q, `c.status = 'correction_required'`, []),
    counts: (await q.query<{ open: number; decided: number; questions: number }>(`select count(*) filter (where decision is null)::int as open, count(*) filter (where decision is not null)::int as decided, count(*) filter (where kind = 'question')::int as questions from accountability_cases`)).rows[0],
  }), await getDb());
  const now = new Date();
  const total = d.counts.open + d.counts.decided;
  const tiles = [
    { label: 'Escalated (overdue)', n: d.escalated.length, icon: 'alert', tone: 'crit' as const, href: '#esc' },
    { label: 'Awaiting your decision', n: d.review.length, icon: 'shield', tone: 'action' as const, href: '#rev' },
    { label: 'Corrections open', n: d.corrections.length, icon: 'wrench', tone: 'med' as const, href: '#cor' },
    { label: 'Resident questions', n: d.counts.questions, icon: 'info', tone: 'action' as const, href: '/spending/cases?kind=question' },
  ];
  return (
    <div className="space-y-6">
      <PageHeader kicker="Independent Audit Cell · outside the wards" title="Oversight queue" actions={<AutoRefresh />}>Overdue escalations, answers waiting for your decision, and open corrections. You cannot decide cases for a ward you belong to.</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <a key={t.label} href={t.href} className={`card flex min-h-11 items-center gap-3 p-4 hover:border-action ${t.n && t.tone === 'crit' ? 'border-red-300 bg-crit-soft' : ''}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${t.tone === 'crit' ? 'bg-white text-crit' : t.tone === 'med' ? 'bg-med-soft text-med' : 'bg-action-soft text-action'}`}><Icon name={t.icon} className="h-5 w-5" /></span>
            <span><span className={`tnum block text-3xl font-extrabold tracking-tight ${t.n && t.tone === 'crit' ? 'text-crit' : ''}`}>{t.n}</span><span className="text-sm font-semibold">{t.label}</span></span>
          </a>
        ))}
        <a href="/spending/cases?status=decided" className="card flex min-h-11 items-center gap-3 p-4 hover:border-action sm:col-span-2 lg:col-span-1">
          <ProgressRing pct={total ? (d.counts.decided / total) * 100 : 0} size={56} stroke={6} tone="ok" label={`${d.counts.decided} of ${total} cases decided`} />
          <span><span className="tnum block text-3xl font-extrabold tracking-tight">{d.counts.decided}</span><span className="text-sm font-semibold">Decided</span><span className="tnum block text-xs text-muted">{d.counts.open} still open</span></span>
        </a>
      </div>
      <OversightTools minutes={d.settings.response_minutes} />
      <section id="esc" className="space-y-2"><h2 className="h2 flex items-center gap-2"><Icon name="alert" className="h-5 w-5 text-crit" />Escalated: response overdue</h2><CaseCards cases={d.escalated} empty="No overdue escalations." now={now} /></section>
      <section id="rev" className="space-y-2"><h2 className="h2 flex items-center gap-2"><Icon name="shield" className="h-5 w-5 text-action" />Answers waiting for independent review</h2><CaseCards cases={d.review} empty="Nothing waiting." now={now} /></section>
      <section id="cor" className="space-y-2"><h2 className="h2 flex items-center gap-2"><Icon name="wrench" className="h-5 w-5 text-med" />Corrections in progress</h2><CaseCards cases={d.corrections} empty="None." now={now} /></section>
    </div>
  );
}
