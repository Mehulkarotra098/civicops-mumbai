import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/session';
import { ticketView } from '@/lib/views';
import { HttpError } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { CategoryIcon, Meter, OriginBadge, PriorityBadge, StatusBadge, Timeline } from '@/components/ui';
import { DeadlineClock } from '@/components/client';
import { Icon } from '@/components/icons';
import { ActionPanel } from './ActionPanel';
import { EvidenceGallery } from './EvidenceGallery';
import { Milestones } from './Milestones';
import { AutoRefresh } from '@/components/AutoRefresh';
import TicketMiniMap from '@/components/TicketMiniMap';

export default async function TicketPage({ params }: { params: Promise<{ ref: string }> }) {
  const user = await requirePageUser();
  const { ref } = await params;
  let v;
  try { v = await ticketView(user, decodeURIComponent(ref)); }
  catch (e) { if (e instanceof HttpError && e.status === 404) notFound(); throw e; }
  const { t } = v;
  const resolved = t.status === 'verified_resolved';
  const staff = user.role !== 'resident';
  // Share of the allowed time already used (server time; the page refreshes itself).
  const now = Date.now();
  const start = new Date(v.clock.startedAt).getTime();
  const dueMs = new Date(v.clock.dueAt).getTime();
  const end = v.clock.stoppedAt ? new Date(v.clock.stoppedAt).getTime() : now;
  const usedPct = dueMs > start ? Math.max(0, Math.round(((end - start) / (dueMs - start)) * 100)) : 100;
  const clockTone = v.clock.stoppedAt ? (v.clock.outcome === 'met' ? 'ok' : 'crit') : usedPct >= 100 ? 'crit' : usedPct >= 80 ? 'med' : 'action';

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-xs text-muted"><Link href={user.role === 'resident' ? '/my' : user.role === 'super_admin' ? '/admin' : '/ward'} className="inline-flex min-h-11 items-center gap-1 underline"><Icon name="arrowRight" className="h-3 w-3 rotate-180" />Back to {user.role === 'resident' ? 'my tickets' : 'queue'}</Link></nav>

      {/* Above the fold: status, owner, next action, deadline */}
      <section className={`card overflow-hidden ${resolved ? 'border-green-300' : ''}`} aria-labelledby="ticket-title">
        <div className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5 ${resolved ? 'bg-ok-soft' : 'bg-gray-50'}`}>
          <span className="tnum font-mono text-sm font-bold" data-testid="ticket-ref">{t.ref}</span>
          <StatusBadge status={t.status} />
          <PriorityBadge priority={t.priority} original={t.original_priority} resolved={resolved} />
          {t.escalation_level > 0 && !resolved ? <span className="chip border-red-300 bg-crit-soft text-crit"><Icon name="alert" className="h-3.5 w-3.5" />Escalated (level {t.escalation_level})</span> : null}
          {t.in_triage ? <span className="chip border-med-edge bg-med-soft text-med"><Icon name="transfer" className="h-3.5 w-3.5" />In triage</span> : null}
          {t.reopen_count ? <span className="chip border-gray-300 text-gray-700"><Icon name="history" className="h-3.5 w-3.5" />Reopened ×{t.reopen_count}</span> : null}
          <OriginBadge origin={t.data_origin} />
          <span className="sm:ml-auto"><AutoRefresh seconds={20} /></span>
        </div>
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="min-w-0 space-y-4">
            <div>
              <h1 id="ticket-title" className="flex items-start gap-2 text-xl font-extrabold tracking-tight sm:text-2xl"><CategoryIcon code={t.category_code} className="mt-1 h-5 w-5 shrink-0 text-action" />{t.title}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-sm font-semibold" data-testid="owner"><Icon name="map" className="h-4 w-4 text-action" />{t.ward_code ? `Ward ${t.ward_code}` : 'Triage team'}{v.deptName ? ` · ${v.deptName}` : ''}</p>
              {v.supportingNames.length ? <p className="text-xs text-muted">Supporting: {v.supportingNames.join(', ')}</p> : null}
            </div>
            <div className={`rounded-xl border p-4 ${resolved ? 'border-green-200 bg-ok-soft' : 'border-teal-200 bg-teal-50'}`}>
              <div className={`kicker flex items-center gap-1.5 ${resolved ? 'text-ok' : 'text-action'}`}><Icon name={resolved ? 'checkCircle' : 'arrowRight'} className="h-3.5 w-3.5" />What happens next</div>
              <p className="tnum mt-1 text-base font-semibold leading-snug">{v.nextAction}</p>
            </div>
            <div className="rounded-xl border border-line bg-gray-50 p-3" data-testid="assignee">
              <div className="kicker">Who is doing the work</div>
              <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
                <span className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-action ring-1 ring-line"><Icon name="user" className="h-4 w-4" /></span><span><span className="text-xs text-muted">Officer in charge</span><br /><b>{v.officer ?? 'Not assigned yet'}</b></span></span>
                <span className="flex items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-action ring-1 ring-line"><Icon name="wrench" className="h-4 w-4" /></span><span><span className="text-xs text-muted">Contractor</span><br /><b>{v.contractor ?? 'Not assigned yet'}</b></span></span>
              </div>
            </div>
          </div>

          {/* SLA countdown card, separate from milestone progress */}
          <aside className="min-w-0 space-y-3 rounded-xl border border-line bg-white p-4" aria-label="Deadline">
            <div className="kicker flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5" />Deadline</div>
            <DeadlineClock {...v.clock} />
            <div>
              <Meter pct={usedPct} tone={clockTone} label={`${Math.min(usedPct, 999)}% of the allowed time used`} className="h-2" />
              <div className="tnum mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] text-muted"><span>Started {formatIST(v.clock.startedAt)}</span><span>{Math.min(usedPct, 999)}% of time used</span></div>
            </div>
            {t.first_action_due_at && v.clock.kind === 'resolution' && !resolved ? (
              <p className="tnum text-xs text-muted">First action {t.first_action_outcome === 'met' ? 'met' : t.first_action_outcome === 'breached' ? 'missed' : 'recorded'} {t.first_action_at ? `at ${formatIST(t.first_action_at)}` : ''} (due {formatIST(t.first_action_due_at)})</p>
            ) : null}
            <p className="text-xs text-muted">Policy v{t.sla_policy_version}: {t.priority === 'critical' ? 'first action within 5 h, resolve within 48 h' : t.priority === 'medium' ? 'reminder day 2, resolve by day 7' : 'resolve by day 10'}. Clock runs from {t.reopen_count ? 'reopening' : 'submission'}.</p>
            {t.access_restored_at ? <p className="tnum flex items-center gap-1 text-sm font-semibold text-ok"><Icon name="checkCircle" />Access restored {formatIST(t.access_restored_at)}</p> : null}
            {t.supply_restored_at ? <p className="tnum flex items-center gap-1 text-sm font-semibold text-ok"><Icon name="checkCircle" />Water supply restored {formatIST(t.supply_restored_at)}</p> : null}
          </aside>
        </div>
      </section>

      <Milestones t={t} events={v.events} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 space-y-5">
          <section className="card p-5" aria-labelledby="rep-h">
            <h2 id="rep-h" className="h2">What was reported</h2>
            <p className="mt-2 whitespace-pre-line text-sm" data-no-translate>{t.description}</p>
            <p className="tnum mt-1 text-xs text-muted">Original words as reported{t.description_lang ? ` (${t.description_lang})` : ''} · submitted {formatIST(t.submitted_at)}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div><dt className="kicker">Latest update</dt><dd className="mt-0.5 text-sm">{v.latest ? <>{v.latest.note ?? v.latest.type.replace(/_/g, ' ')} <span className="tnum text-xs text-muted">· {formatIST(v.latest.at)}</span></> : '—'}</dd></div>
              <div><dt className="kicker">Location</dt><dd className="mt-0.5 text-sm">{t.locality_name ?? '—'}{t.landmark ? ` · ${t.landmark}` : ''}{t.lat != null ? <span className="text-xs text-muted"> · {Number(t.lat).toFixed(5)}, {Number(t.lon).toFixed(5)} ({t.location_source})</span> : null}</dd>
                {t.lat != null && t.lon != null ? <dd className="mt-2 overflow-hidden rounded-xl border border-line"><TicketMiniMap lat={Number(t.lat)} lon={Number(t.lon)} wardCode={t.ward_code} /></dd> : null}
                {t.triage_reason ? <dd className="text-xs text-med">{t.triage_reason}</dd> : null}</div>
            </dl>
          </section>
          <section className="card p-5" aria-labelledby="ev-h">
            <h2 id="ev-h" className="h2 flex items-center gap-2"><Icon name="camera" className="h-5 w-5 text-action" />Photo evidence</h2>
            <EvidenceGallery items={v.evidence.map((e) => ({ ...e, created_at: formatIST(e.created_at) }))} />
            {v.decisions.length ? (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold">Review decisions</h3>
                {v.decisions.map((d) => (
                  <div key={d.id} className={`rounded-lg border p-3 text-sm ${d.decision === 'approve' ? 'border-green-200 bg-ok-soft' : 'border-red-200 bg-crit-soft'}`}>
                    <span className="flex items-center gap-1.5"><Icon name={d.decision === 'approve' ? 'checkCircle' : 'history'} className="h-4 w-4" /><b>{d.decision === 'approve' ? 'Approved' : d.decision === 'rework' ? 'Returned for rework' : 'More evidence requested'}</b></span>
                    <span className="tnum text-xs">by {d.reviewer} · {formatIST(d.created_at)} · {d.manual ? 'manual review' : `with Claude assessment (${d.model_version})`}</span>
                    <div className="mt-1">{d.reason}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {staff && v.assessments.length ? <p className="mt-3 text-xs text-muted">{v.assessments.length} Claude assessment(s) recorded. <Link className="underline" href={`/admin/review/${t.ref}`}>Open evidence review</Link></p> : null}
          </section>
          <section className="card p-5" aria-labelledby="tl-h">
            <h2 id="tl-h" className="h2 mb-4 flex items-center gap-2"><Icon name="history" className="h-5 w-5 text-action" />Activity timeline</h2>
            <Timeline events={v.events} viewerId={user.id} viewerRole={user.role} />
          </section>
        </div>
        {/* On phones the actions come first, right under the steps. */}
        <aside className="order-first min-w-0 space-y-5 lg:order-none">
          <ActionPanel
            ticket={{ id: t.id, ref: t.ref, status: t.status, version: t.version, priority: t.priority, ward_code: t.ward_code, department_code: t.department_code, category_code: t.category_code, suggested_ward_code: t.suggested_ward_code, verified_at: t.verified_at?.toISOString() ?? null, details: t.details }}
            role={user.role} actions={v.actions} officers={v.officers} contractors={v.contractors} links={v.links} needsAccess={t.category_code === 'waterlogging' && !t.access_restored_at} needsSupply={t.category_code === 'water_supply' && !t.supply_restored_at}
            photoRequired={!!v.category?.photoRequiredForClosure} closureCheck={v.category?.closureCheck ?? ''}
            firstActionDone={!t.first_action_due_at || !!t.first_action_at} hasOfficer={!!t.assigned_officer_id}
          />
          {staff ? (
            <section className="card p-5 text-sm">
              <h2 className="h2">Why this priority</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{(t.priority_reasons ?? []).map((r) => <li key={r}>{r}</li>)}</ul>
              <h3 className="mt-4 font-semibold">Category details</h3>
              <ul className="mt-1 space-y-0.5 text-muted">{Object.entries(t.details ?? {}).map(([k, val]) => <li key={k}><span className="text-ink">{k.replace(/_/g, ' ')}:</span> {Array.isArray(val) ? val.join(', ') : String(val)}</li>)}</ul>
              {t.road_id ? <p className="mt-3 text-xs text-muted">Matched road {t.road_id} ({Math.round(Number(t.nearest_road_m))} m). <Link className="underline" href={`/accountability/roads/${t.road_id}`}>Repair history of this road</Link></p> : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
