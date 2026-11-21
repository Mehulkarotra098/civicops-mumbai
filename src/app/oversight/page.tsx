import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { caseSettings } from '@/lib/cases';
import { Kpi, PageHeader } from '@/components/ui';
import { CaseTable } from '@/components/CaseTable';
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
  return (
    <div className="space-y-6">
      <PageHeader kicker="Independent Audit Cell · outside the wards" title="Oversight queue">Overdue escalations, responses awaiting your decision, and open corrections. You cannot decide cases for a ward you belong to.</PageHeader>
      <div className="-mt-4 mb-4"><AutoRefresh /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Escalated (overdue)" value={d.escalated.length} tone={d.escalated.length ? 'crit' : undefined} href="#esc" />
        <Kpi label="Awaiting your decision" value={d.review.length} href="#rev" />
        <Kpi label="Corrections open" value={d.corrections.length} href="#cor" />
        <Kpi label="Resident questions" value={d.counts.questions} href="/spending/cases?kind=question" />
        <Kpi label="Decided" value={d.counts.decided} sub={`${d.counts.open} still open`} href="/spending/cases?status=decided" />
      </div>
      <OversightTools minutes={d.settings.response_minutes} />
      <section id="esc" className="space-y-2"><h2 className="h2">Escalated: response overdue</h2><CaseTable cases={d.escalated} empty="No overdue escalations." /></section>
      <section id="rev" className="space-y-2"><h2 className="h2">Responses awaiting independent review</h2><CaseTable cases={d.review} empty="Nothing waiting." /></section>
      <section id="cor" className="space-y-2"><h2 className="h2">Corrections in progress</h2><CaseTable cases={d.corrections} empty="None." /></section>
    </div>
  );
}
