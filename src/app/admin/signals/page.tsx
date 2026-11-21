import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { PageHeader, SyntheticNote } from '@/components/ui';
import { SignalActions } from './SignalActions';

export default async function Signals({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requirePageUser(['super_admin']);
  const { status = 'unreviewed', q = '' } = await searchParams;
  const rows = await withUser(user, (tx) => tx.query<{ post_id: string; posted_at: Date; source: string; text: string; engagement: number; has_media: boolean; review_status: string; linked_ticket_id: string | null; linked_complaint_id: string | null; review_note: string | null; ref: string | null }>(
    `select s.*, (select ref from tickets t where t.id = s.linked_ticket_id) as ref from social_posts s where review_status = $1 and ($2 = '' or text ilike '%' || $2 || '%') order by engagement desc limit 60`, [status, q]), await getDb());
  return (
    <div className="space-y-5">
      <PageHeader kicker="Unverified signals" title="Social posts">Posts are never treated as reports on their own. Staff can link a post to an existing ticket or historical complaint as supporting context, or dismiss it as noise. Author handles are anonymised in the dataset.</PageHeader>
      <SyntheticNote />
      <form className="flex flex-wrap gap-2"><select name="status" defaultValue={status} className="input w-44" aria-label="Review status"><option value="unreviewed">Unreviewed</option><option value="linked">Linked</option><option value="dismissed">Dismissed</option></select><input name="q" defaultValue={q} className="input max-w-sm" placeholder="Search text (e.g. Juhu, paani, खड्डा)" aria-label="Search posts" /><button className="btn-primary">Filter</button></form>
      <ul className="space-y-3">
        {rows.rows.map((p) => (
          <li key={p.post_id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-mono">{p.post_id}</span><span>{p.source}</span><span>{formatIST(p.posted_at)}</span><span>{p.engagement} likes/forwards</span>{p.has_media ? <span>has media</span> : null}<span className="chip border-gray-300">Unverified</span></div>
            <p className="mt-2 text-sm">{p.text}</p>
            {p.review_status !== 'unreviewed' ? <p className="mt-2 text-xs">{p.review_status === 'linked' ? `Linked to ${p.ref ?? p.linked_complaint_id}` : 'Dismissed'}{p.review_note ? ` · ${p.review_note}` : ''}</p> : <SignalActions postId={p.post_id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
