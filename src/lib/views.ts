// Server-side view models for pages. All reads run as the signed-in user (RLS applies).
import { getDb, withUser, type Actor, type Queryable } from './db';
import { allowedActions, departmentNames, getTicketRow, type TicketRow } from './tickets';
import { activeClock } from './sla';
import { CATEGORY_BY_CODE } from './config';
import { formatIST } from './time';
import type { TimelineEvent } from '@/components/ui';

export interface EvidenceItem { id: string; phase: string; uploader_role: string; note: string | null; created_at: Date; origin: string; duplicate_of_evidence: string | null; work_order_ref: string | null; width: number; height: number }

export function nextActionText(t: TicketRow, viewer: Actor, deptName: string | null): string {
  const team = t.ward_code ? `Ward ${t.ward_code}${deptName ? ` ${deptName}` : ''}` : 'The triage team';
  switch (t.status) {
    case 'submitted': return t.in_triage ? 'The triage team confirms the ward and department.' : `${team} to confirm the report.`;
    case 'assigned': return t.first_action_due_at && !t.first_action_at ? `${team} must take a first action by ${formatIST(t.first_action_due_at)}.` : `${team} to acknowledge and plan the work.`;
    case 'acknowledged': return t.first_action_due_at && !t.first_action_at ? `${team} must take a first action by ${formatIST(t.first_action_due_at)}.` : `${team} to start work.`;
    case 'in_progress': return `${team} to finish the work and upload completion evidence by ${formatIST(t.resolution_due_at)}.`;
    case 'needs_info': return viewer.role === 'resident' ? 'The ward team asked you a question. Reply below so work can continue.' : 'Waiting for the resident to reply.';
    case 'awaiting_verification': return 'A super admin reviews the completion evidence and approves closure or returns it.';
    case 'verified_resolved': return viewer.role === 'resident' ? 'Closed and verified. If the problem comes back within 30 days, request reopening.' : 'Closed and verified.';
    case 'duplicate': return 'Merged into another ticket. Updates continue there.';
    case 'referred': return 'Referred to another agency.';
    case 'cancelled': return 'Cancelled.';
    default: return '';
  }
}

export async function ticketView(user: Actor, idOrRef: string) {
  const db = await getDb();
  return withUser(user, async (q) => {
    const t = await getTicketRow(q, idOrRef);
    const names = await departmentNames(q);
    const events = (await q.query<TimelineEvent & { actor_id: string | null }>('select * from ticket_events where ticket_id = $1 order by at, id', [t.id])).rows;
    const evidence = (await q.query<EvidenceItem>('select id, phase, uploader_role, note, created_at, origin, duplicate_of_evidence, work_order_ref, width, height from evidence where ticket_id = $1 order by created_at', [t.id])).rows;
    const decisions = (await q.query<{ id: string; decision: string; reason: string; manual: boolean; model_version: string | null; created_at: Date; reviewer: string }>(
      `select d.id, d.decision, d.reason, d.manual, d.model_version, d.created_at, u.name as reviewer from review_decisions d join users u on u.id = d.reviewer_id where d.ticket_id = $1 order by d.created_at`, [t.id])).rows;
    const assessments = user.role === 'resident' ? [] : (await q.query<{ id: string; provider: string; model: string | null; status: string; result: Record<string, unknown> | null; error: string | null; created_at: Date; latency_ms: number }>(
      'select id, provider, model, status, result, error, created_at, latency_ms from evidence_assessments where ticket_id = $1 order by created_at desc', [t.id])).rows;
    const links = user.role === 'resident' ? [] : (await q.query<{ related_ticket_id: string; status: string; distance_m: number | null; reason: string | null; ref: string | null }>(
      `select l.related_ticket_id, l.status, l.distance_m, l.reason, (select ref from tickets x where x.id = l.related_ticket_id) as ref
       from ticket_links l where l.ticket_id = $1`, [t.id])).rows;
    const officer = t.assigned_officer_id ? (await q.query<{ name: string }>('select name from users where id = $1', [t.assigned_officer_id])).rows[0]?.name ?? null : null;
    const officers = user.role === 'resident' || !t.ward_code ? [] : (await q.query<{ id: string; name: string }>(
      `select distinct u.id, u.name from memberships m join users u on u.id = m.user_id where m.ward_code = $1 and (m.department_code is null or m.department_code = $2) order by u.name`, [t.ward_code, t.department_code])).rows;
    const clock = activeClock({ ...t }, new Date());
    const latest = [...events].reverse().find((e) => e.visibility === 'all' && !e.type.startsWith('sla_')) ?? events[events.length - 1];
    return {
      t, events, evidence, decisions, assessments, links, officer, officers,
      category: CATEGORY_BY_CODE[t.category_code],
      deptName: t.department_code ? names[t.department_code] : null,
      supportingNames: (t.supporting_departments ?? []).map((d) => names[d] ?? d),
      nextAction: nextActionText(t, user, t.department_code ? names[t.department_code] : null),
      actions: allowedActions(user.role, t.status, t.reporter_id === user.id),
      clock: { kind: clock.kind, dueAt: clock.dueAt.toISOString(), startedAt: t.clock_started_at.toISOString(), stoppedAt: t.sla_stopped_at?.toISOString() ?? null, outcome: t.sla_outcome, dueLabel: formatIST(clock.dueAt), state: clock.state },
      latest,
      isReporter: t.reporter_id === user.id,
    };
  }, db);
}

export async function listTickets(user: Actor, where: string, params: unknown[] = [], order = 'resolution_due_at asc', limit = 200): Promise<TicketRow[]> {
  return withUser(user, (q: Queryable) => q.query<TicketRow>(`select * from tickets ${where ? `where ${where}` : ''} order by ${order} limit ${limit}`, params), undefined).then((r) => r.rows);
}
