import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { CATEGORIES, DEPARTMENTS } from '@/lib/config';
import { formatIST } from '@/lib/time';
import { TicketCard } from '@/components/TicketCard';
import { Empty, Kpi, PageHeader, PriorityBadge, StatusBadge, STATUS_LABEL } from '@/components/ui';
import { Icon } from '@/components/icons';

type SP = Record<string, string | undefined>;
const ACTIVE = ['submitted', 'assigned', 'acknowledged', 'in_progress', 'needs_info', 'awaiting_verification'];

export default async function WardQueue({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser(['officer', 'ward_admin', 'super_admin']);
  const sp = await searchParams;
  const db = await getDb();
  const { rows, memberships, officers } = await withUser(user, async (q) => ({
    rows: (await q.query<TicketRow & { officer_name: string | null }>(`select t.*, u.name as officer_name from tickets t left join users u on u.id = t.assigned_officer_id order by t.resolution_due_at`)).rows,
    memberships: (await q.query<{ ward_code: string; department_code: string | null; role: string }>('select ward_code, department_code, role from memberships where user_id = $1', [user.id])).rows,
    officers: (await q.query<{ id: string; name: string }>(`select distinct u.id, u.name from users u join memberships m on m.user_id = u.id order by u.name`)).rows,
  }), db);
  const now = new Date();
  // Most urgent first: the deadline that applies now (first action for untouched red tickets, else resolution).
  const withClock = rows.map((t) => ({ t, c: activeClock(t, now) })).sort((a, b) => a.c.dueAt.getTime() - b.c.dueAt.getTime());
  const view = sp.view === 'table' ? 'table' : 'board';
  const tab = sp.tab ?? 'all';
  let list = withClock.filter(({ t }) => ACTIVE.includes(t.status) || sp.status === t.status || sp.status === 'all');
  if (sp.ward) list = list.filter(({ t }) => (t.ward_code ?? t.suggested_ward_code) === sp.ward);
  if (sp.dept) list = list.filter(({ t }) => t.department_code === sp.dept);
  if (sp.category) list = list.filter(({ t }) => t.category_code === sp.category);
  if (sp.priority) list = list.filter(({ t }) => t.priority === sp.priority);
  if (sp.status && sp.status !== 'all') list = list.filter(({ t }) => t.status === sp.status);
  if (sp.officer) list = list.filter(({ t }) => t.assigned_officer_id === sp.officer);
  if (sp.locality) list = list.filter(({ t }) => (t.locality_name ?? '').toLowerCase().includes(sp.locality!.toLowerCase()) || t.title.toLowerCase().includes(sp.locality!.toLowerCase()));
  if (sp.from) list = list.filter(({ t }) => t.submitted_at >= new Date(sp.from!));
  if (sp.to) list = list.filter(({ t }) => t.submitted_at <= new Date(sp.to! + 'T23:59:59+05:30'));
  const overdue = list.filter(({ c, t }) => c.state === 'overdue' && t.status !== 'awaiting_verification');
  const dueSoon = list.filter(({ c, t }) => c.state === 'due_soon' && t.status !== 'awaiting_verification');
  const unassigned = list.filter(({ t }) => !t.assigned_officer_id && ['assigned', 'acknowledged', 'in_progress'].includes(t.status));
  const shown = tab === 'overdue' ? overdue : tab === 'due' ? dueSoon : tab === 'unassigned' ? unassigned : list;
  const scope = user.role === 'super_admin' ? 'All wards' : memberships.map((m) => `Ward ${m.ward_code}${m.department_code ? ` · ${m.department_code}` : ' · all departments'}`).join(', ');
  const qs = (p: SP) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader kicker={scope} title={user.role === 'super_admin' ? 'City queue' : 'My ward'} actions={<><Link href="/ward/map" className="btn-secondary"><Icon name="map" />Map</Link><Link href={qs({ view: view === 'board' ? 'table' : 'board' })} className="btn-secondary"><Icon name={view === 'board' ? 'list' : 'board'} />{view === 'board' ? 'Table view' : 'Board view'}</Link></>}>
        Your queue shows only the wards and departments you belong to. Deadlines count from submission.
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? 'crit' : undefined} href={qs({ tab: 'overdue' })} sub="Past first-action or resolution deadline" />
        <Kpi label="Due soon" value={dueSoon.length} tone={dueSoon.length ? 'med' : undefined} href={qs({ tab: 'due' })} sub="80% of allowed time used" />
        <Kpi label="No officer assigned" value={unassigned.length} href={qs({ tab: 'unassigned' })} />
        <Kpi label="Active tickets" value={list.length} href={qs({ tab: 'all' })} />
      </div>
      <form className="card mb-5 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-9" aria-label="Filters">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="tab" value={tab} />
        {user.role === 'super_admin' || memberships.length > 1 ? <select name="ward" defaultValue={sp.ward ?? ''} className="input" aria-label="Ward"><option value="">All wards</option>{[...new Set(rows.map((r) => r.ward_code ?? r.suggested_ward_code).filter(Boolean))].sort().map((w) => <option key={w!} value={w!}>Ward {w}</option>)}</select> : null}
        <input name="locality" defaultValue={sp.locality ?? ''} placeholder="Locality" className="input" aria-label="Locality" />
        <select name="dept" defaultValue={sp.dept ?? ''} className="input" aria-label="Department"><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.short}</option>)}</select>
        <select name="category" defaultValue={sp.category ?? ''} className="input" aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.short}</option>)}</select>
        <select name="priority" defaultValue={sp.priority ?? ''} className="input" aria-label="Priority"><option value="">All priorities</option><option value="critical">Red · Critical</option><option value="medium">Yellow · Medium</option><option value="standard">Orange · Standard</option></select>
        <select name="status" defaultValue={sp.status ?? ''} className="input" aria-label="Status"><option value="">Active statuses</option><option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="officer" defaultValue={sp.officer ?? ''} className="input" aria-label="Officer"><option value="">Any officer</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} className="input" aria-label="Submitted from" />
        <div className="flex gap-2"><input type="date" name="to" defaultValue={sp.to ?? ''} className="input" aria-label="Submitted to" /><button className="btn-primary btn-sm">Apply</button></div>
      </form>
      <div className="mb-3 flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Queue">
        {[['all', `All (${list.length})`], ['overdue', `Overdue (${overdue.length})`], ['due', `Due soon (${dueSoon.length})`], ['unassigned', `Unassigned (${unassigned.length})`]].map(([k, l]) => (
          <Link key={k} role="tab" aria-selected={tab === k} href={qs({ tab: k })} className={`rounded-full border px-3 py-1.5 font-semibold ${tab === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</Link>
        ))}
      </div>
      {!shown.length ? <Empty title="Nothing here">No tickets match these filters.</Empty> : view === 'board' ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {[['New & assigned', ['submitted', 'assigned']], ['Acknowledged', ['acknowledged', 'needs_info']], ['In progress', ['in_progress']], ['Awaiting verification', ['awaiting_verification']]].map(([label, sts]) => {
            const col = shown.filter(({ t }) => (sts as string[]).includes(t.status));
            return (
              <section key={label as string} aria-label={label as string} className="space-y-3 rounded-xl bg-gray-100 p-3">
                <h2 className="flex items-center justify-between text-sm font-semibold">{label as string}<span className="chip border-gray-300 bg-white text-gray-700">{col.length}</span></h2>
                {col.map(({ t }) => <TicketCard key={t.id} t={t} />)}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Owner</th><th>Officer</th><th>Deadline</th><th>Submitted</th></tr></thead>
            <tbody>
              {shown.map(({ t, c }) => (
                <tr key={t.id}>
                  <td><Link className="font-mono font-semibold text-action underline" href={`/tickets/${t.ref}`}>{t.ref}</Link><div className="text-xs">{t.title}</div></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td><PriorityBadge priority={t.priority} /></td>
                  <td className="whitespace-nowrap">{t.ward_code ?? 'Triage'} · {t.department_code ?? '—'}</td>
                  <td>{t.officer_name ?? '—'}</td>
                  <td className={`whitespace-nowrap ${c.state === 'overdue' ? 'font-semibold text-crit' : c.state === 'due_soon' ? 'text-med' : ''}`}>{c.kind === 'first_action' ? 'First action ' : ''}{formatIST(c.dueAt)}<div className="text-xs">{c.state.replace('_', ' ')}</div></td>
                  <td className="whitespace-nowrap text-xs">{formatIST(t.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
