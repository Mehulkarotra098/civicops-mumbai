import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { TicketCard } from '@/components/TicketCard';
import { Empty, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icons';
import { AutoRefresh } from '@/components/AutoRefresh';

export default async function MyTickets() {
  const user = await requirePageUser(['resident']);
  const { own, following } = await withUser(user, async (q) => ({
    own: (await q.query<TicketRow & { officer_name: string | null; contractor_name: string | null }>('select t.*, u.name as officer_name, c.contractor_name from tickets t left join users u on u.id = t.assigned_officer_id left join contractors c on c.contractor_id = t.contractor_id where t.reporter_id = $1 order by t.submitted_at desc', [user.id])).rows,
    following: (await q.query<TicketRow>('select t.* from tickets t join ticket_followers f on f.ticket_id = t.id where f.user_id = $1 and t.reporter_id <> $1 order by t.submitted_at desc', [user.id])).rows,
  }), await getDb());
  const needsReply = own.filter((t) => t.status === 'needs_info');
  const active = own.filter((t) => !['verified_resolved', 'cancelled', 'duplicate', 'referred'].includes(t.status));
  const closed = own.filter((t) => !active.includes(t));
  return (
    <div>
      <PageHeader kicker={`Hello, ${user.name.split(' ')[0]}`} title="My tickets" actions={<Link href="/report" className="btn-primary"><Icon name="camera" />Report an issue</Link>}>
        Track who owns each report, when action is due and what evidence closed it.
      </PageHeader>
      <div className="-mt-4 mb-4"><AutoRefresh /></div>
      {needsReply.length ? <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><b>The ward team needs your reply</b> on {needsReply.map((t) => <Link key={t.id} className="ml-1 font-mono underline" href={`/tickets/${t.ref}`}>{t.ref}</Link>)}</div> : null}
      <section aria-labelledby="active-h" className="space-y-3">
        <h2 id="active-h" className="h2">Active ({active.length})</h2>
        {active.length ? <div className="grid gap-3 md:grid-cols-2">{active.map((t) => <TicketCard key={t.id} t={t} />)}</div> : <Empty title="No open reports">Spotted a flooded road, fallen tree or missed pickup? <Link href="/report" className="font-semibold text-action underline">Report it</Link>.</Empty>}
      </section>
      {following.length ? <section className="mt-8 space-y-3"><h2 className="h2">Issues I follow ({following.length})</h2><div className="grid gap-3 md:grid-cols-2">{following.map((t) => <TicketCard key={t.id} t={t} />)}</div></section> : null}
      {closed.length ? <section className="mt-8 space-y-3"><h2 className="h2">Closed ({closed.length})</h2><div className="grid gap-3 md:grid-cols-2">{closed.map((t) => <TicketCard key={t.id} t={t} />)}</div></section> : null}
    </div>
  );
}
