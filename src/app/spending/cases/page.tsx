import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { publicCases } from '@/lib/spending';
import { PageHeader, SyntheticNote } from '@/components/ui';
import { CaseTable } from '@/components/CaseTable';

export const dynamic = 'force-dynamic';

export default async function PublicCases({ searchParams }: { searchParams: Promise<{ status?: string; ward?: string; kind?: string }> }) {
  const sp = await searchParams;
  const conds: string[] = ['true']; const params: unknown[] = [];
  if (sp.ward) { params.push(sp.ward); conds.push(`c.ward_code = $${params.length}`); }
  if (sp.kind) { params.push(sp.kind); conds.push(`c.kind = $${params.length}`); }
  if (sp.status === 'overdue') conds.push(`c.status in ('awaiting_response','needs_evidence') and c.response_due_at < now()`);
  else if (sp.status === 'decided') conds.push(`c.decision is not null`);
  else if (sp.status === 'review') conds.push(`c.status = 'awaiting_review'`);
  const cases = await withSystem((q) => publicCases(q, conds.join(' and ') + ` order by (c.kind = 'question') desc, c.is_demo_example desc, c.escalated_at desc nulls last, c.amount_under_review desc nulls last limit 200 --`, params), await getDb());
  const qs = (p: Record<string, string | undefined>) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-5">
      <PageHeader kicker="WardProof · public accountability cases" title="Questions about spending">Every flagged expense and every resident question has a responsible office, a response deadline and an independent decision. Showing up to 200.</PageHeader>
      <SyntheticNote />
      <div className="flex flex-wrap gap-2 text-sm">
        {[['', 'All'], ['overdue', 'Response overdue'], ['review', 'Awaiting independent review'], ['decided', 'Decided']].map(([k, l]) => <Link key={k} href={qs({ status: k || undefined })} className={`rounded-full border px-3 py-1.5 font-semibold ${(sp.status ?? '') === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</Link>)}
        <Link href={qs({ kind: sp.kind === 'question' ? undefined : 'question' })} className={`rounded-full border px-3 py-1.5 font-semibold ${sp.kind === 'question' ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>Resident questions only</Link>
      </div>
      <CaseTable cases={cases} empty="No cases match." />
    </div>
  );
}
