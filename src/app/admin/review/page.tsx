import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { formatIST } from '@/lib/time';
import { Empty, PageHeader, PriorityBadge } from '@/components/ui';
import { visionProvider } from '@/lib/vision';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function ReviewQueue() {
  const user = await requirePageUser(['super_admin']);
  const rows = await withUser(user, (q) => q.query<TicketRow & { photos: number }>(`select t.*, (select count(*)::int from evidence e where e.ticket_id = t.id and e.phase = 'after') as photos from tickets t where status = 'awaiting_verification' order by completion_submitted_at`), await getDb());
  const provider = visionProvider();
  return (
    <div>
      <PageHeader kicker="Super admin" title="Evidence review queue">
        Claude assessment: <b>{provider === 'claude' ? 'configured' : provider === 'stub' ? 'stub provider (tests)' : 'not configured: manual review only'}</b>. The super admin always records the final decision.
      </PageHeader>
      <div className="-mt-4 mb-4"><AutoRefresh /></div>
      {rows.rows.length ? (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Ticket</th><th>Priority</th><th>Ward</th><th>After photos</th><th>Submitted for review</th><th></th></tr></thead>
          <tbody>{rows.rows.map((t) => (
            <tr key={t.id}><td><span className="font-mono font-semibold">{t.ref}</span><div className="text-xs">{t.title}</div></td><td><PriorityBadge priority={t.priority} /></td><td>{t.ward_code} · {t.department_code}</td><td>{t.photos}</td><td>{formatIST(t.completion_submitted_at)}</td><td><Link className="btn-primary btn-sm" href={`/admin/review/${t.ref}`}>Review</Link></td></tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title="No evidence waiting for review" />}
    </div>
  );
}
