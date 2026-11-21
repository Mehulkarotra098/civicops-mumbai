import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { PageHeader } from '@/components/ui';
import { CaseCards } from './CaseCards';
import { Icon } from '@/components/icons';
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
  const now = new Date();
  const counts = [
    { label: 'Questions to answer', n: d.questions.length, icon: 'info', cls: d.questions.length ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-line bg-white text-ink', href: '#q' },
    { label: 'Responses or corrections due', n: d.due.length, icon: 'clock', cls: d.due.length ? 'border-red-300 bg-crit-soft text-crit' : 'border-line bg-white text-ink', href: '#due' },
    { label: 'Waiting for independent review', n: d.waiting.length, icon: 'shield', cls: 'border-line bg-white text-ink', href: '#wait' },
  ];
  return (
    <div className="space-y-6">
      <PageHeader kicker={`Ward office · ${d.wards.map((w) => `Ward ${w}`).join(', ')}`} title="Expense questions to answer" actions={<AutoRefresh />}>Publish a written answer with supporting records. Your reply does not close a case: the independent Audit Cell decides. Overdue cases go to oversight and stay marked overdue in public until you reply.</PageHeader>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {counts.map((c) => <a key={c.label} href={c.href} className={`flex min-h-11 min-w-0 flex-col items-start gap-1 rounded-2xl border p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4 ${c.cls}`}><Icon name={c.icon} className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" /><span className="min-w-0"><span className="tnum block text-2xl font-extrabold tracking-tight sm:text-3xl">{c.n}</span><span className="block text-xs font-semibold leading-tight text-ink sm:text-sm">{c.label}</span></span></a>)}
      </div>
      <section id="q" className="space-y-2"><h2 className="h2">Resident questions <span className="tnum text-muted">({d.questions.length})</span></h2><CaseCards cases={d.questions} empty="No open resident questions." now={now} /></section>
      <section id="due" className="space-y-2"><h2 className="h2">Responses or corrections due <span className="tnum text-muted">({d.due.length})</span></h2><CaseCards cases={d.due} empty="Nothing due." now={now} /></section>
      <section id="wait" className="space-y-2"><h2 className="h2">Waiting for independent review <span className="tnum text-muted">({d.waiting.length})</span></h2><CaseCards cases={d.waiting} empty="None." now={now} /></section>
    </div>
  );
}
