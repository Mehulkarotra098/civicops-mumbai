import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { formatIST } from '@/lib/time';
import { Empty, PageHeader, PriorityBadge } from '@/components/ui';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function Triage() {
  const user = await requirePageUser(['super_admin', 'ward_admin']);
  const rows = await withUser(user, (q) => q.query<TicketRow & { candidates: unknown }>(
    `select t.*, (select data->'candidates' from ticket_events e where e.ticket_id = t.id and e.type = 'triaged' order by at desc limit 1) as candidates
     from tickets t where in_triage and status = 'submitted' order by submitted_at`), await getDb());
  return (
    <div>
      <PageHeader kicker="Routing" title="Triage queue">Reports whose ward or responsible team is unclear stay visible here until someone routes them. The SLA clock is already running.</PageHeader>
      <div className="-mt-4 mb-4"><AutoRefresh /></div>
      {rows.rows.length ? (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Ticket</th><th>Why it is here</th><th>Suggested</th><th>Priority</th><th>Submitted</th><th></th></tr></thead>
          <tbody>{rows.rows.map((t) => {
            const cands = (Array.isArray(t.candidates) ? t.candidates : []) as { locality: string; ward_code: string }[];
            return (
              <tr key={t.id}>
                <td><span className="font-mono font-semibold">{t.ref}</span><div className="text-xs">{t.title}</div><div className="text-xs text-muted">{t.description.slice(0, 90)}</div></td>
                <td className="text-sm">{t.triage_reason}</td>
                <td className="text-sm">{t.suggested_ward_code ? `Ward ${t.suggested_ward_code}` : cands.length ? cands.map((c) => `${c.locality} (${c.ward_code})`).join(' or ') : '—'}</td>
                <td><PriorityBadge priority={t.priority} /></td>
                <td className="text-xs">{formatIST(t.submitted_at)}</td>
                <td><Link className="btn-primary btn-sm" href={`/tickets/${t.ref}`}>Route</Link></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <Empty title="Triage queue is empty" />}
    </div>
  );
}
