import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { PageHeader } from '@/components/ui';
import { CaseTable } from '@/components/CaseTable';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function OfficeCases() {
  const user = await requirePageUser(['officer', 'ward_admin']);
  const d = await withUser(user, async (q) => {
    const wards = (await q.query<{ ward_code: string }>('select distinct ward_code from memberships where user_id = $1', [user.id])).rows.map((r) => r.ward_code);
    const base = `c.ward_code = any($1)`;
    return {
      wards,
      questions: await publicCases(q, `${base} and c.kind = 'question' and c.status not in ('justified','corrected','closed')`, [wards]),
      due: await publicCases(q, `${base} and c.status in ('awaiting_response','needs_evidence','correction_required') and (c.is_demo_example or c.response_due_at < now() + interval '30 days') order by c.response_due_at limit 100 --`, [wards]),
      waiting: await publicCases(q, `${base} and c.status = 'awaiting_review'`, [wards]),
    };
  }, await getDb());
  return (
    <div className="space-y-6">
      <PageHeader kicker={`Ward office · ${d.wards.map((w) => `Ward ${w}`).join(', ')}`} title="Expense questions to answer">Publish a written response with supporting records. Replies do not close a case: the independent Audit Cell decides. Overdue cases go to the oversight queue and stay marked overdue in public until you reply.</PageHeader>
      <div className="-mt-4 mb-4"><AutoRefresh /></div>
      <section className="space-y-2"><h2 className="h2">Resident questions ({d.questions.length})</h2><CaseTable cases={d.questions} empty="No open resident questions." /></section>
      <section className="space-y-2"><h2 className="h2">Responses or corrections due</h2><CaseTable cases={d.due} empty="Nothing due." /></section>
      <section className="space-y-2"><h2 className="h2">Waiting for independent review ({d.waiting.length})</h2><CaseTable cases={d.waiting} empty="None." /></section>
    </div>
  );
}
