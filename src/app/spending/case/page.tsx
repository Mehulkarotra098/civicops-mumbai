import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';

export default async function Track({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  if (ref?.trim()) redirect(`/spending/case/${encodeURIComponent(ref.trim().toUpperCase())}`);
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Track a question" kicker="WardProof">Enter the tracking ID you received (for example AQ-261121-0714).</PageHeader>
      <form className="card flex gap-2 p-4"><input name="ref" className="input" placeholder="AQ-…" aria-label="Tracking ID" required /><button className="btn-primary">Track</button></form>
    </div>
  );
}
