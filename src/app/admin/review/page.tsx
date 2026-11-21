import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { formatIST } from '@/lib/time';
import { CategoryIcon, Empty, PageHeader, PriorityBadge } from '@/components/ui';
import { Icon } from '@/components/icons';
import { visionProvider } from '@/lib/vision';
import { AutoRefresh } from '@/components/AutoRefresh';

function waited(from: Date | null, now: number) {
  if (!from) return '—';
  const m = Math.max(0, Math.round((now - new Date(from).getTime()) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

export default async function ReviewQueue() {
  const user = await requirePageUser(['super_admin']);
  const rows = await withUser(user, (q) => q.query<TicketRow & { photos: number; after_id: string | null; before_id: string | null }>(`select t.*,
      (select count(*)::int from evidence e where e.ticket_id = t.id and e.phase = 'after') as photos,
      (select e.id from evidence e where e.ticket_id = t.id and e.phase = 'after' order by e.created_at desc limit 1) as after_id,
      (select e.id from evidence e where e.ticket_id = t.id and e.phase in ('report','before') order by e.created_at desc limit 1) as before_id
    from tickets t where status = 'awaiting_verification' order by completion_submitted_at`), await getDb());
  const provider = visionProvider();
  const now = Date.now();
  return (
    <div>
      <PageHeader kicker="Super admin" title="Evidence review queue" actions={<AutoRefresh />}>
        Oldest first. Compare the before and after photos, then approve, ask for more evidence or send it back. Claude assessment: <b>{provider === 'claude' ? 'configured' : provider === 'stub' ? 'stub provider (tests)' : 'not configured: manual review only'}</b>. You always make the final call.
      </PageHeader>
      {rows.rows.length ? (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.rows.map((t) => (
              <li key={t.id} className="card flex flex-col overflow-hidden">
                <div className="grid grid-cols-2 gap-0.5 bg-gray-200">
                  {[['Before', t.before_id], ['After', t.after_id]].map(([l, id]) => (
                    <div key={l} className="relative aspect-[4/3] bg-gray-100">
                      {id ? <img src={`/api/evidence/${id}?thumb=1`} alt={`${l} photo for ${t.ref}`} className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full items-center justify-center text-xs text-muted">No photo</span>}
                      <span className={`chip absolute left-1.5 top-1.5 ${l === 'After' ? 'border-transparent bg-action text-white' : 'border-transparent bg-navy-900/85 text-white'}`}>{l}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="tnum font-mono text-xs font-bold">{t.ref}</span><PriorityBadge priority={t.priority} /></div>
                  <div className="flex items-start gap-2 font-semibold"><CategoryIcon code={t.category_code} className="mt-0.5 h-4 w-4 shrink-0 text-action" />{t.title}</div>
                  <div className="tnum text-xs text-muted">Ward {t.ward_code} · {t.department_code} · {t.photos} after photo{t.photos === 1 ? '' : 's'}</div>
                  <div className="tnum flex items-center gap-1.5 text-xs"><Icon name="clock" className="h-3.5 w-3.5 text-med" />Waiting <b>{waited(t.completion_submitted_at, now)}</b> · sent {formatIST(t.completion_submitted_at)}</div>
                  <Link className="btn-primary mt-auto" href={`/admin/review/${t.ref}`}><Icon name="zoom" />Review evidence</Link>
                </div>
              </li>
            ))}
          </ul>
          <details className="card mt-5 p-4 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Show records table</summary>
            <div className="mt-2 overflow-x-auto"><table className="table">
              <thead><tr><th>Ticket</th><th>Priority</th><th>Ward</th><th>After photos</th><th>Submitted for review</th><th></th></tr></thead>
              <tbody>{rows.rows.map((t) => (
                <tr key={t.id}><td><span className="font-mono font-semibold">{t.ref}</span><div className="text-xs">{t.title}</div></td><td><PriorityBadge priority={t.priority} /></td><td>{t.ward_code} · {t.department_code}</td><td>{t.photos}</td><td>{formatIST(t.completion_submitted_at)}</td><td><Link className="btn-secondary btn-sm" href={`/admin/review/${t.ref}`}>Review</Link></td></tr>
              ))}</tbody>
            </table></div>
          </details>
        </>
      ) : <Empty title="No evidence waiting for review">Completed repairs land here when an officer submits after-photos.</Empty>}
    </div>
  );
}
