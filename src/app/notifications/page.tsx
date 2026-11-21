import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { Empty, PageHeader } from '@/components/ui';
import { MarkRead } from './MarkRead';

export default async function Notifications() {
  const user = await requirePageUser();
  const rows = await withUser(user, (q) => q.query<{ id: string; kind: string; title: string; body: string | null; created_at: Date; read_at: Date | null; ref: string | null }>(
    `select n.id, n.kind, n.title, n.body, n.created_at, n.read_at, (select ref from tickets t where t.id = n.ticket_id) as ref
     from notifications n where n.user_id = $1 order by n.created_at desc limit 200`, [user.id]), await getDb());
  const unread = rows.rows.filter((r) => !r.read_at).length;
  return (
    <div>
      <PageHeader title="Notifications" actions={unread ? <MarkRead /> : null}>{unread} unread. Deadline alerts are sent once per threshold, even if the scheduler retries.</PageHeader>
      {rows.rows.length ? (
        <ul className="card divide-y divide-line">
          {rows.rows.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? '' : 'bg-teal-50/50'}`}>
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read_at ? 'bg-gray-300' : n.kind.includes('breach') || n.kind.includes('critical') ? 'bg-crit' : 'bg-action'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${n.read_at ? '' : 'font-semibold'}`}>{n.title}</div>
                {n.body ? <div className="text-xs text-muted">{n.body}</div> : null}
                <div className="text-xs text-muted">{formatIST(n.created_at)}{n.read_at ? '' : ' · unread'}</div>
              </div>
              {n.ref ? <Link href={`/tickets/${n.ref}`} className="btn-secondary btn-sm">Open</Link> : null}
            </li>
          ))}
        </ul>
      ) : <Empty title="No notifications yet" />}
    </div>
  );
}
