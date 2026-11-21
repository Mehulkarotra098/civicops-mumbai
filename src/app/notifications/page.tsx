import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatDateIST, formatIST } from '@/lib/time';
import { Empty, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import { MarkRead } from './MarkRead';

type N = { id: string; kind: string; title: string; body: string | null; created_at: Date; read_at: Date | null; ref: string | null };

/** Icon, tone and a plain label for each kind of notification. */
function look(kind: string): { icon: string; cls: string; label: string } {
  if (kind === 'assigned_to_you') return { icon: 'user', cls: 'bg-action-soft text-action', label: 'Assigned to you' };
  if (kind.includes('breach') || kind === 'critical_alert' || kind === 'case_overdue') return { icon: 'alert', cls: 'bg-crit-soft text-crit', label: kind === 'critical_alert' ? 'Critical alert' : 'Escalation' };
  if (kind.includes('due_soon') || kind.includes('reminder')) return { icon: 'clock', cls: 'bg-med-soft text-med', label: 'Deadline reminder' };
  if (kind === 'verified' || kind.endsWith('restored')) return { icon: 'checkCircle', cls: 'bg-ok-soft text-ok', label: kind === 'verified' ? 'Verified' : 'Restored' };
  if (kind === 'returned_for_rework' || kind === 'more_evidence_requested' || kind === 'reopened') return { icon: 'history', cls: 'bg-crit-soft text-crit', label: 'Sent back' };
  if (kind === 'duplicate_photo') return { icon: 'camera', cls: 'bg-crit-soft text-crit', label: 'Re-used photo' };
  if (kind === 'triage') return { icon: 'transfer', cls: 'bg-med-soft text-med', label: 'Needs triage' };
  if (kind === 'new_ticket' || kind === 'submitted') return { icon: 'sparkle', cls: 'bg-action-soft text-action', label: kind === 'submitted' ? 'Report received' : 'New ticket' };
  if (kind.startsWith('case_')) return { icon: 'rupee', cls: 'bg-amber-50 text-amber-800', label: 'Spending question' };
  if (kind === 'submitted_for_review') return { icon: 'upload', cls: 'bg-violet-50 text-violet-800', label: 'Ready to verify' };
  return { icon: 'bell', cls: 'bg-gray-100 text-gray-700', label: 'Update' };
}

export default async function Notifications() {
  const user = await requirePageUser();
  const rows = await withUser(user, (q) => q.query<N>(
    `select n.id, n.kind, n.title, n.body, n.created_at, n.read_at, (select ref from tickets t where t.id = n.ticket_id) as ref
     from notifications n where n.user_id = $1 order by n.created_at desc limit 200`, [user.id]), await getDb());
  const unread = rows.rows.filter((r) => !r.read_at).length;
  const today = formatDateIST(new Date());
  const yesterday = formatDateIST(new Date(Date.now() - 86_400_000));
  const groups = new Map<string, N[]>();
  for (const n of rows.rows) {
    const d = formatDateIST(n.created_at);
    const key = d === today ? 'Today' : d === yesterday ? 'Yesterday' : d;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" actions={unread ? <MarkRead /> : null}>
        <span className="tnum font-semibold text-ink">{unread} unread.</span> Deadline alerts are sent once per threshold, even if the scheduler retries.
      </PageHeader>
      {rows.rows.length ? (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day} aria-labelledby={`d-${day}`}>
              <h2 id={`d-${day}`} className="kicker mb-2 flex items-center gap-2">{day}<span className="tnum chip border-gray-300 bg-white text-gray-600">{list.length}</span></h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {list.map((n) => {
                  const l = look(n.kind);
                  const inner = (
                    <>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${l.cls}`}><Icon name={l.icon} className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 text-xs"><span className="font-semibold text-muted">{l.label}</span>{n.read_at ? null : <span className="chip border-teal-200 bg-action-soft text-action"><span className="h-1.5 w-1.5 rounded-full bg-action" aria-hidden />New</span>}</span>
                        <span className={`block text-sm ${n.read_at ? 'text-gray-700' : 'font-semibold text-ink'}`}>{n.title}</span>
                        {n.body ? <span className="block text-xs text-muted">{n.body}</span> : null}
                        <span className="tnum block text-xs text-muted">{formatIST(n.created_at)}</span>
                      </span>
                      {n.ref ? <span className="hidden shrink-0 items-center gap-1 self-center text-xs font-semibold text-action sm:inline-flex">Open {n.ref}<Icon name="arrowRight" className="h-3.5 w-3.5" /></span> : null}
                    </>
                  );
                  return (
                    <li key={n.id} className={n.read_at ? '' : 'border-l-4 border-l-action bg-teal-50/60'}>
                      {n.ref
                        ? <Link href={`/tickets/${n.ref}`} className="flex min-h-11 items-start gap-3 p-4 hover:bg-gray-50" aria-label={`${l.label}: ${n.title}. Open ticket ${n.ref}`}>{inner}</Link>
                        : <div className="flex items-start gap-3 p-4">{inner}</div>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : <Empty title="No notifications yet">You will hear here when a ticket is assigned to you, a deadline is near, or a repair is verified.</Empty>}
    </div>
  );
}
