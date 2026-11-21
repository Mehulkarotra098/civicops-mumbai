import Link from 'next/link';
import { requirePageUser } from '@/lib/session';
import { getDb, withUser } from '@/lib/db';
import type { TicketRow } from '@/lib/tickets';
import { activeClock } from '@/lib/sla';
import { formatIST } from '@/lib/time';
import { CategoryIcon, MiniTrail, PageHeader, ProgressRing, STAGE_LABEL, TRAIL_STEPS, trailIndex } from '@/components/ui';
import { DeadlineClock } from '@/components/client';
import { Icon } from '@/components/icons';
import { AutoRefresh } from '@/components/AutoRefresh';

type Row = TicketRow & { officer_name: string | null; contractor_name: string | null };

function MyCard({ t, now }: { t: Row; now: Date }) {
  const green = t.status === 'verified_resolved';
  const closedOther = ['cancelled', 'duplicate', 'referred'].includes(t.status);
  const reply = t.status === 'needs_info';
  const c = activeClock(t, now);
  const idx = trailIndex(t);
  const step = green ? 'All six steps done' : closedOther ? 'Closed' : `Step ${Math.min(idx + 1, 6)} of 6 · ${TRAIL_STEPS[Math.min(idx, 5)]}`;
  return (
    <Link href={`/tickets/${t.ref}`} data-testid={`ticket-card-${t.ref}`}
      className={`card group block p-4 transition-shadow duration-200 hover:shadow-[var(--shadow-2)] motion-reduce:transition-none ${green ? 'border-green-300 bg-ok-soft/60' : reply ? 'border-blue-300' : 'hover:border-action'}`}>
      <div className="flex items-start gap-4">
        <ProgressRing pct={t.progress_pct} size={76} stroke={8} tone={green ? 'ok' : closedOther ? 'muted' : 'action'} label={`${t.progress_pct}% done`}>
          {green ? <Icon name="checkCircle" className="h-7 w-7 text-ok" /> : <span className="text-base">{t.progress_pct}%</span>}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className={`text-lg font-extrabold leading-tight tracking-tight ${green ? 'text-ok' : reply ? 'text-blue-800' : ''}`}>{reply ? 'The ward team needs your reply' : STAGE_LABEL[t.status] ?? t.status}</div>
          <div className="mt-0.5 text-xs font-semibold text-muted">{step}</div>
          <div className="mt-2 flex items-start gap-1.5 text-sm font-semibold"><CategoryIcon code={t.category_code} className="mt-0.5 h-4 w-4 shrink-0 text-action" /><span className="min-w-0">{t.title}</span></div>
          <div className="tnum text-xs text-muted">{t.ref} · {t.ward_code ? `Ward ${t.ward_code}` : 'Being routed'}{t.officer_name ? ` · ${t.officer_name}` : ''}</div>
        </div>
      </div>
      <div className="mt-3"><MiniTrail t={t} /></div>
      <div className="mt-3">
        {green ? (
          <div className="tnum flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-semibold text-ok"><Icon name="checkCircle" />Fixed and checked {t.verified_at ? formatIST(t.verified_at) : ''}</div>
        ) : closedOther ? null : (
          <DeadlineClock compact dueAt={c.dueAt.toISOString()} startedAt={t.clock_started_at.toISOString()} kind={c.kind} stoppedAt={t.sla_stopped_at?.toISOString() ?? null} outcome={t.sla_outcome} dueLabel={formatIST(c.dueAt)} />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-action">
        <span className="tnum text-muted">Reported {formatIST(t.submitted_at)}</span>
        <span className="inline-flex items-center gap-1">{reply ? 'Reply now' : 'See details'}<Icon name="arrowRight" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" /></span>
      </div>
    </Link>
  );
}

export default async function MyTickets() {
  const user = await requirePageUser(['resident']);
  const { own, following } = await withUser(user, async (q) => ({
    own: (await q.query<Row>('select t.*, u.name as officer_name, c.contractor_name from tickets t left join users u on u.id = t.assigned_officer_id left join contractors c on c.contractor_id = t.contractor_id where t.reporter_id = $1 order by t.submitted_at desc', [user.id])).rows,
    following: (await q.query<Row>('select t.*, null as officer_name, null as contractor_name from tickets t join ticket_followers f on f.ticket_id = t.id where f.user_id = $1 and t.reporter_id <> $1 order by t.submitted_at desc', [user.id])).rows,
  }), await getDb());
  const now = new Date();
  const needsReply = own.filter((t) => t.status === 'needs_info');
  const active = own.filter((t) => !['verified_resolved', 'cancelled', 'duplicate', 'referred'].includes(t.status));
  const closed = own.filter((t) => !active.includes(t));
  const fixed = own.filter((t) => t.status === 'verified_resolved').length;
  return (
    <div>
      <PageHeader kicker={`Hello, ${user.name.split(' ')[0]}`} title="My reports" actions={<Link href="/report" className="btn-primary"><Icon name="camera" />Report an issue</Link>}>
        See who is fixing each problem, when it is due, and the photo proof when it is done.
      </PageHeader>
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="tnum chip border-teal-200 bg-teal-50 text-action"><Icon name="clock" className="h-3.5 w-3.5" />{active.length} in progress</span>
        <span className="tnum chip border-green-200 bg-ok-soft text-ok"><Icon name="checkCircle" className="h-3.5 w-3.5" />{fixed} fixed and verified</span>
        <AutoRefresh />
      </div>
      {needsReply.length ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status">
          <Icon name="info" className="mt-0.5 h-5 w-5 shrink-0" />
          <div><b>The ward team needs your reply</b> on {needsReply.map((t) => <Link key={t.id} className="ml-1 inline-flex min-h-11 items-center font-mono underline" href={`/tickets/${t.ref}`}>{t.ref}</Link>)}</div>
        </div>
      ) : null}
      <section aria-labelledby="active-h" className="space-y-3">
        <h2 id="active-h" className="h2">In progress <span className="tnum text-muted">({active.length})</span></h2>
        {active.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{active.map((t) => <MyCard key={t.id} t={t} now={now} />)}</div> : (
          <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-action-soft text-action"><Icon name="camera" className="h-7 w-7" /></span>
            <p className="text-lg font-bold">Nothing open right now</p>
            <p className="max-w-sm text-sm text-muted">Spotted a flooded road, a fallen tree or a missed garbage pickup? It takes about a minute, and you can follow every step here.</p>
            <Link href="/report" className="btn-primary"><Icon name="camera" />Report an issue</Link>
          </div>
        )}
      </section>
      {following.length ? <section className="mt-8 space-y-3"><h2 className="h2">Issues I follow <span className="tnum text-muted">({following.length})</span></h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{following.map((t) => <MyCard key={t.id} t={t} now={now} />)}</div></section> : null}
      {closed.length ? <section className="mt-8 space-y-3"><h2 className="h2">Closed <span className="tnum text-muted">({closed.length})</span></h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{closed.map((t) => <MyCard key={t.id} t={t} now={now} />)}</div></section> : null}
    </div>
  );
}
