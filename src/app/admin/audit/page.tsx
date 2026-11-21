import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { PageHeader } from '@/components/ui';

export default async function Audit({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requirePageUser(['super_admin']);
  const { type } = await searchParams;
  const d = await withUser(user, async (q) => ({
    config: (await q.query<{ id: number; at: Date; action: string; entity_type: string; entity_id: string; reason: string | null; name: string | null }>('select a.*, u.name from audit_log a left join users u on u.id = a.actor_id order by at desc limit 100')).rows,
    events: (await q.query<{ id: number; at: Date; type: string; actor_role: string; actor_name: string | null; reason: string | null; note: string | null; ref: string; from_status: string | null; to_status: string | null }>(
      `select e.id, e.at, e.type, e.actor_role, e.actor_name, e.reason, e.note, e.from_status, e.to_status, t.ref from ticket_events e join tickets t on t.id = e.ticket_id
       where ($1::text is null or e.type = $1) order by e.at desc limit 300`, [type ?? null])).rows,
    types: (await q.query<{ type: string; n: number }>('select type, count(*)::int as n from ticket_events group by type order by n desc')).rows,
  }), await getDb());
  return (
    <div className="space-y-6">
      <PageHeader kicker="Super admin" title="Audit history">Every staff decision is recorded with the actor, time (stored in UTC, shown in IST) and reason. Ticket history is append-only in the database.</PageHeader>
      <section className="card overflow-x-auto">
        <h2 className="h2 p-4 pb-0">Configuration changes</h2>
        <table className="table mt-2"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
          <tbody>{d.config.length ? d.config.map((a) => <tr key={a.id}><td className="whitespace-nowrap text-xs">{formatIST(a.at)}</td><td>{a.name}</td><td>{a.action}</td><td>{a.entity_type} #{a.entity_id}</td><td>{a.reason}</td></tr>) : <tr><td colSpan={5} className="text-muted">No configuration changes yet.</td></tr>}</tbody></table>
      </section>
      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 p-4 pb-0"><h2 className="h2 mr-2">Ticket events</h2>
          <Link href="/admin/audit" className={`chip ${!type ? 'border-action bg-action text-white' : 'border-gray-300'}`}>All</Link>
          {d.types.map((t) => <Link key={t.type} href={`/admin/audit?type=${t.type}`} className={`chip ${type === t.type ? 'border-action bg-action text-white' : 'border-gray-300 text-gray-700'}`}>{t.type.replace(/_/g, ' ')} ({t.n})</Link>)}
        </div>
        <table className="table mt-2"><thead><tr><th>When</th><th>Ticket</th><th>Event</th><th>Actor</th><th>Status</th><th>Reason / note</th></tr></thead>
          <tbody>{d.events.map((e) => <tr key={e.id}><td className="whitespace-nowrap text-xs">{formatIST(e.at)}</td><td><Link className="font-mono text-action underline" href={`/tickets/${e.ref}`}>{e.ref}</Link></td><td>{e.type.replace(/_/g, ' ')}</td><td>{e.actor_role === 'system' ? 'System' : `${e.actor_name} (${e.actor_role})`}</td><td className="text-xs">{e.from_status && e.to_status ? `${e.from_status} → ${e.to_status}` : ''}</td><td className="text-xs">{e.reason ?? e.note}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
