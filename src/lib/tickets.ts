// Ticket service: creation, the authoritative lifecycle, history, notifications and the SLA sweep.
// Every function takes an explicit `now` so tests and the demo seed can use a controlled clock.
import { HttpError, elevated, withSystem, withUser, type Actor, type Db, type Queryable } from './db.ts';
import { CATEGORY_BY_CODE, MILESTONES, type Priority } from './config.ts';
import { resolveLocation, routeDepartment, type LocationInput, type LocationResult, type RefData, type RoutingRule } from './routing.ts';
import { suggestPriority } from './priority.ts';
import { computeDeadlines, thresholdsReached, type SlaPolicy, type ThresholdKey } from './sla.ts';
import { haversineM } from './geo.ts';
import { formatIST, ymdIST } from './time.ts';

// ---------------------------------------------------------------- reference data
let refCache: { at: number; v: number; data: RefData } | null = null;

export async function loadRefData(q: Queryable): Promise<RefData> {
  const v = (await q.query<{ v: number }>('select coalesce(max(id), 0)::int as v from import_runs')).rows[0].v;
  if (refCache && refCache.v === v && Date.now() - refCache.at < 5 * 60_000) return refCache.data;
  const wards = (await q.query<{ ward_code: string; ward_name: string; boundary_geojson: { coordinates: number[][][] } | null }>(
    'select ward_code, ward_name, boundary_geojson from wards order by ward_code')).rows;
  const localities = (await q.query<{ name: string; ward_code: string; lat: number; lon: number; aliases: string[] }>(
    'select name, ward_code, lat, lon, aliases from localities')).rows;
  const roads = (await q.query<RefData['roads'][number]>(
    'select road_id, road_name, ward_code, road_type, under_dlp, bus_route, start_lat, start_lon, end_lat, end_lon from roads')).rows;
  const facilities = (await q.query<RefData['facilities'][number]>(
    'select facility_id, type, name, lat, lon, emergency_services from facilities')).rows;
  const hotspots = (await q.query<RefData['hotspots'][number]>(
    'select hotspot_id, name, lat, lon, years_flagged_last_5 from flood_hotspots')).rows;
  const data: RefData = {
    wards: wards.map((w) => ({ ward_code: w.ward_code, ward_name: w.ward_name, polygon: w.boundary_geojson?.coordinates ?? [] })),
    localities: localities.map((l) => ({ ...l, aliases: l.aliases ?? [] })),
    roads, facilities, hotspots,
  };
  refCache = { at: Date.now(), v, data };
  return data;
}

export function clearRefCache() { refCache = null; }

export async function loadRules(q: Queryable): Promise<RoutingRule[]> {
  return (await q.query<RoutingRule>('select ward_code, category_code, primary_department, supporting_departments from routing_rules where active')).rows;
}

export async function activePolicy(q: Queryable, priority: Priority): Promise<SlaPolicy> {
  const r = await q.query<SlaPolicy>(
    `select id, version, priority, label, first_action_hours, reminder_hours, resolution_hours, due_soon_fraction, alert_on_submit
     from sla_policies where active and priority = $1 order by version desc limit 1`, [priority]);
  if (!r.rows[0]) throw new HttpError(500, 'no_policy', `No active SLA policy for ${priority}`);
  return r.rows[0];
}

// ---------------------------------------------------------------- preview (before submission)
export interface ReportInput {
  category: string;
  description: string;
  descriptionLang?: string;
  details: Record<string, unknown>;
  location: LocationInput;
  landmark?: string;
  photoUnsafe?: boolean;
  /** Resident accepted a triage outcome rather than fixing an ambiguous/conflicting location. */
  acceptTriage?: boolean;
  clientRequestId?: string;
}

export interface RoutePreview {
  location: LocationResult;
  department: ReturnType<typeof routeDepartment> & { primaryName: string | null; supportingNames: string[] };
  priority: { priority: Priority; reasons: string[] };
  willTriage: boolean;
  triageReason: string | null;
  duplicates: { id: string; ref: string; status: string; distance_m: number; submitted_at: string; title: string }[];
}

const ACTIVE_STATUSES = ['submitted', 'assigned', 'acknowledged', 'in_progress', 'awaiting_verification', 'needs_info'];

export async function previewRoute(q: Queryable, input: ReportInput, now: Date): Promise<RoutePreview> {
  const cat = CATEGORY_BY_CODE[input.category];
  if (!cat) throw new HttpError(400, 'bad_category', 'Unknown category');
  const ref = await loadRefData(q);
  const rules = await loadRules(q);
  const location = resolveLocation({ ...input.location, landmark: input.landmark ?? input.location.landmark }, ref);
  const dept = routeDepartment(cat.code, location.wardCode ?? location.suggestedWardCode, input.details ?? {}, rules);
  const deptNames = await departmentNames(q);
  const priority = suggestPriority(cat.code, input.details ?? {}, {
    roadType: location.road?.road_type, busRoute: location.road?.bus_route,
    nearbyFacilities: location.nearbyFacilities, nearbyHotspot: location.nearbyHotspot,
  });
  let triageReason: string | null = null;
  if (location.status !== 'confident') triageReason = location.message;
  else if (!dept.primary) triageReason = dept.reasons[dept.reasons.length - 1] ?? 'Responsible team unclear';

  const duplicates: RoutePreview['duplicates'] = [];
  if (location.lat != null && location.lon != null) {
    const near = await q.query<{ id: string; ref: string; status: string; lat: number; lon: number; submitted_at: Date; title: string }>(
      `select * from nearby_active_tickets($1, $2, $3, $4)`,
      [cat.code, location.lat, location.lon, new Date(now.getTime() - 14 * 86400_000)],
    );
    for (const t of near.rows) {
      const d = haversineM(location.lat, location.lon, t.lat, t.lon);
      if (d <= 250) duplicates.push({ id: t.id, ref: t.ref, status: t.status, distance_m: Math.round(d), submitted_at: formatIST(t.submitted_at), title: t.title });
    }
    duplicates.sort((a, b) => a.distance_m - b.distance_m);
  }
  return {
    location,
    department: { ...dept, primaryName: dept.primary ? deptNames[dept.primary] ?? dept.primary : null, supportingNames: dept.supporting.map((s) => deptNames[s] ?? s) },
    priority,
    willTriage: !!triageReason,
    triageReason,
    duplicates: duplicates.slice(0, 5),
  };
}

let deptCache: Record<string, string> | null = null;
export async function departmentNames(q: Queryable): Promise<Record<string, string>> {
  if (deptCache) return deptCache;
  const r = await q.query<{ code: string; name: string }>('select code, name from departments');
  deptCache = Object.fromEntries(r.rows.map((x) => [x.code, x.name]));
  return deptCache;
}

// ---------------------------------------------------------------- history + notifications
export interface EventInput {
  type: string;
  from_status?: string | null;
  to_status?: string | null;
  from_owner?: unknown;
  to_owner?: unknown;
  reason?: string | null;
  note?: string | null;
  data?: Record<string, unknown>;
  visibility?: 'all' | 'staff';
  dedupe_key?: string;
  system?: boolean;
}

export async function addEvent(q: Queryable, ticketId: string, actor: Actor | null, at: Date, e: EventInput): Promise<number | null> {
  const sys = !actor || e.system;
  // A resident may write a staff-only event (e.g. "possible duplicate") but cannot read it back,
  // so RETURNING is only used when the caller can see the row.
  const canRead = (e.visibility ?? 'all') === 'all' || (actor && actor.role !== 'resident');
  const tail = e.dedupe_key ? 'on conflict (dedupe_key) do nothing' : '';
  const r = await q.query<{ id: number }>(
    `insert into ticket_events (ticket_id, at, actor_id, actor_role, actor_name, type, from_status, to_status, from_owner, to_owner, reason, note, data, visibility, dedupe_key)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ${tail} ${canRead ? 'returning id' : ''}`,
    [ticketId, at, sys ? null : actor!.id, sys ? 'system' : actor!.role, sys ? 'CivicOps' : actor!.name, e.type, e.from_status ?? null, e.to_status ?? null,
      e.from_owner ? JSON.stringify(e.from_owner) : null, e.to_owner ? JSON.stringify(e.to_owner) : null, e.reason ?? null, e.note ?? null,
      JSON.stringify(e.data ?? {}), e.visibility ?? 'all', e.dedupe_key ?? null],
  );
  // Without RETURNING, the affected-row count tells a fresh insert (1) from a de-duplicated retry (0).
  return canRead ? r.rows[0]?.id ?? null : r.affectedRows > 0 ? -1 : null;
}

export async function notify(q: Queryable, userIds: string[], n: { ticketId: string | null; kind: string; title: string; body?: string; dedupeBase: string }, at: Date) {
  const unique = [...new Set(userIds)].filter(Boolean);
  for (const u of unique) {
    await q.query('select enqueue_notification($1,$2,$3,$4,$5,$6,$7)', [u, n.ticketId, n.kind, n.title, n.body ?? null, `${n.dedupeBase}:${u}`, at]);
  }
}

export async function teamMembers(q: Queryable, ward: string | null, dept: string | null, opts: { adminsOnly?: boolean } = {}): Promise<string[]> {
  if (!ward) return [];
  const r = await q.query<{ user_id: string }>(
    `select distinct user_id from memberships where ward_code = $1 and (department_code is null or department_code = $2 or $2 is null)
     ${opts.adminsOnly ? `and role = 'ward_admin'` : ''}`, [ward, dept]);
  return r.rows.map((x) => x.user_id);
}

export async function superAdmins(q: Queryable): Promise<string[]> {
  return (await q.query<{ id: string }>(`select id from users where role = 'super_admin'`)).rows.map((r) => r.id);
}

async function residentAudience(q: Queryable, t: TicketRow): Promise<string[]> {
  const f = await q.query<{ user_id: string }>('select user_id from ticket_followers where ticket_id = $1', [t.id]);
  return [t.reporter_id, ...f.rows.map((r) => r.user_id)];
}

// ---------------------------------------------------------------- ticket rows
export interface TicketRow {
  id: string; ref: string; reporter_id: string; category_code: string; title: string; description: string;
  description_lang: string | null; details: Record<string, unknown>; photo_unsafe: boolean;
  lat: number | null; lon: number | null; gps_accuracy_m: number | null; location_source: string | null;
  address_text: string | null; landmark: string | null; locality_name: string | null;
  suggested_ward_code: string | null; ward_code: string | null; road_id: string | null; nearest_road_m: number | null;
  location_confidence: string | null; triage_reason: string | null; in_triage: boolean;
  department_code: string | null; supporting_departments: string[]; assigned_officer_id: string | null;
  status: string; status_before_hold: string | null; progress_pct: number;
  priority: Priority; original_priority: Priority; suggested_priority: Priority; priority_reasons: string[];
  sla_policy_id: number; sla_policy_version: number; submitted_at: Date; clock_started_at: Date;
  first_action_due_at: Date | null; reminder_at: Date | null; resolution_due_at: Date;
  routed_at: Date | null; acknowledged_at: Date | null; first_action_at: Date | null; work_started_at: Date | null;
  completion_submitted_at: Date | null; verified_at: Date | null; closed_at: Date | null;
  access_restored_at: Date | null; supply_restored_at: Date | null; sla_stopped_at: Date | null;
  sla_outcome: string | null; first_action_outcome: string | null; escalation_level: number; reopen_count: number;
  duplicate_of: string | null; version: number; data_origin: string; created_at: Date; updated_at: Date;
}

export async function getTicketRow(q: Queryable, idOrRef: string): Promise<TicketRow> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrRef);
  const r = await q.query<TicketRow>(`select * from tickets where ${isUuid ? 'id = $1' : 'ref = $1'}`, [idOrRef]);
  // RLS hides rows the actor may not see, so "not found" and "not allowed" look the same.
  if (!r.rows[0]) throw new HttpError(404, 'not_found', 'Ticket not found or you do not have access to it');
  return r.rows[0];
}

export function progressFor(status: string, before: string | null, current: number): number {
  const m = MILESTONES.find((x) => x.status === status);
  if (m) return m.pct;
  if (status === 'needs_info' && before) return MILESTONES.find((x) => x.status === before)?.pct ?? current;
  return current;
}

function owner(t: Pick<TicketRow, 'ward_code' | 'department_code' | 'assigned_officer_id'>) {
  return { ward_code: t.ward_code, department_code: t.department_code, officer_id: t.assigned_officer_id };
}

// ---------------------------------------------------------------- create
export async function createTicket(db: Db, actor: Actor, input: ReportInput, now: Date, opts: { dataOrigin?: 'operational' | 'demo_seed' } = {}) {
  if (actor.role !== 'resident' && actor.role !== 'super_admin') throw new HttpError(403, 'forbidden', 'Only residents can file reports');
  const cat = CATEGORY_BY_CODE[input.category];
  if (!cat) throw new HttpError(400, 'bad_category', 'Choose a category');
  const description = (input.description ?? '').trim();
  if (description.length < 5) throw new HttpError(400, 'description_required', 'Describe the problem in a few words');
  if (description.length > 4000) throw new HttpError(400, 'description_too_long', 'Keep the description under 4000 characters');

  return withUser(actor, async (q) => {
    // Double submission guard: same reporter, same client request id.
    if (input.clientRequestId) {
      const dup = await q.query<{ id: string; ref: string }>(
        `select t.id, t.ref from tickets t join ticket_events e on e.ticket_id = t.id
         where t.reporter_id = $1 and e.type = 'submitted' and e.data->>'client_request_id' = $2 limit 1`, [actor.id, input.clientRequestId]);
      if (dup.rows[0]) return { id: dup.rows[0].id, ref: dup.rows[0].ref, duplicateSubmission: true };
    }
    const preview = await previewRoute(q, input, now);
    const loc = preview.location;
    if (loc.status === 'missing') throw new HttpError(400, 'location_required', loc.message);
    if ((loc.status === 'ambiguous' || loc.status === 'conflict') && !input.acceptTriage) {
      throw new HttpError(409, 'location_needs_confirmation', loc.message);
    }
    const inTriage = preview.willTriage;
    const wardCode = inTriage ? (loc.status === 'confident' ? loc.wardCode : null) : loc.wardCode;
    const dept = inTriage ? null : preview.department.primary;
    const policy = await activePolicy(q, preview.priority.priority);
    const deadlines = computeDeadlines(policy, now);
    const seq = (await q.query<{ n: string }>(`select nextval('ticket_seq')::text as n`)).rows[0].n;
    const ref = `CO-${ymdIST(now)}-${seq.padStart(4, '0')}`;
    const title = `${cat.short}${loc.locality ? ` · ${loc.locality}` : ''}${loc.road ? ` · ${loc.road.road_name}` : ''}`;
    const status = inTriage ? 'submitted' : 'assigned';

    const ins = await q.query<{ id: string }>(
      `insert into tickets (ref, reporter_id, category_code, title, description, description_lang, details, photo_unsafe,
         lat, lon, gps_accuracy_m, location_source, address_text, landmark, locality_name, suggested_ward_code, ward_code, road_id, nearest_road_m,
         location_confidence, triage_reason, in_triage, department_code, supporting_departments, status, progress_pct,
         priority, original_priority, suggested_priority, priority_reasons, sla_policy_id, sla_policy_version,
         submitted_at, clock_started_at, first_action_due_at, reminder_at, resolution_due_at, routed_at, data_origin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27,$27,$28,$29,$30,$31,$31,$32,$33,$34,$35,$36)
       returning id`,
      [ref, actor.id, cat.code, title, description, input.descriptionLang ?? null, JSON.stringify(input.details ?? {}), !!input.photoUnsafe,
        loc.lat, loc.lon, input.location.gpsAccuracyM ?? null, input.location.source ?? null, input.location.address ?? null, input.landmark ?? input.location.landmark ?? null,
        loc.locality, loc.suggestedWardCode ?? loc.wardCode, wardCode, loc.road?.road_id ?? null, loc.road?.distance_m ?? null,
        loc.confidence, preview.triageReason, inTriage, dept, inTriage ? [] : preview.department.supporting, status, inTriage ? 10 : 25,
        preview.priority.priority, JSON.stringify(preview.priority.reasons), policy.id, policy.version,
        now, deadlines.first_action_due_at, deadlines.reminder_at, deadlines.resolution_due_at, inTriage ? null : now, opts.dataOrigin ?? 'operational'],
    );
    const id = ins.rows[0].id;
    await addEvent(q, id, actor, now, {
      type: 'submitted', to_status: 'submitted',
      note: `Reported via ${input.location.source ?? 'form'}${input.photoUnsafe ? ' (no photo: unsafe to take one)' : ''}`,
      data: { client_request_id: input.clientRequestId ?? null, location_status: loc.status, location_message: loc.message, priority_reasons: preview.priority.reasons, sla_policy_version: policy.version },
    });
    if (inTriage) {
      await addEvent(q, id, null, now, { type: 'triaged', to_status: 'submitted', reason: preview.triageReason, data: { candidates: loc.candidates, point_ward: loc.pointWard, text_ward: loc.textWard } });
      const admins = [...await superAdmins(q), ...await teamMembers(q, loc.suggestedWardCode, null, { adminsOnly: true })];
      await notify(q, admins, { ticketId: id, kind: 'triage', title: `${ref} needs triage`, body: preview.triageReason ?? '', dedupeBase: `${id}:triage:0` }, now);
    } else {
      await addEvent(q, id, null, now, {
        type: 'routed', from_status: 'submitted', to_status: 'assigned', to_owner: { ward_code: wardCode, department_code: dept, supporting: preview.department.supporting },
        note: preview.department.reasons.join('. '), data: { rule_scope: preview.department.ruleScope },
      });
      if (preview.department.supporting.length) {
        await addEvent(q, id, null, now, { type: 'supporting_added', note: `Supporting: ${preview.department.supportingNames.join(', ')}`, data: { departments: preview.department.supporting } });
      }
      const team = await teamMembers(q, wardCode, dept);
      await notify(q, team, { ticketId: id, kind: 'new_ticket', title: `New ${policy.label} ticket ${ref}`, body: title, dedupeBase: `${id}:new:0` }, now);
      if (policy.alert_on_submit) {
        const evId = await addEvent(q, id, null, now, { type: 'sla_critical_alert', note: `Critical alert sent to Ward ${wardCode} ${dept}. First action due ${formatIST(deadlines.first_action_due_at)}.`, dedupe_key: `${id}:critical_alert:c0`, data: { threshold: 'critical_alert' } });
        if (evId) await notify(q, team, { ticketId: id, kind: 'critical_alert', title: `CRITICAL: ${ref} needs first action by ${formatIST(deadlines.first_action_due_at)}`, body: title, dedupeBase: `${id}:critical_alert:c0` }, now);
      }
    }
    if (preview.duplicates.length) {
      for (const d of preview.duplicates) {
        await q.query(`insert into ticket_links (ticket_id, related_ticket_id, status, distance_m, reason) values ($1,$2,'suggested',$3,$4) on conflict do nothing`,
          [id, d.id, d.distance_m, `Same category within ${d.distance_m} m`]);
      }
      await addEvent(q, id, null, now, { type: 'duplicate_suggested', visibility: 'staff', note: `Possible duplicate of ${preview.duplicates.map((d) => d.ref).join(', ')} (needs staff confirmation)` });
    }
    await notify(q, [actor.id], { ticketId: id, kind: 'submitted', title: `Report ${ref} received`, body: inTriage ? 'A triage officer will confirm the ward.' : `Routed to Ward ${wardCode}.`, dedupeBase: `${id}:submitted:0` }, now);
    return { id, ref, duplicateSubmission: false, preview };
  }, db);
}

/** Follow an existing issue instead of filing a new one. Other residents' identities are never shown. */
export async function followTicket(db: Db, actor: Actor, ticketId: string, now: Date) {
  if (actor.role !== 'resident') throw new HttpError(403, 'forbidden', 'Only residents follow issues');
  return withSystem(async (q) => {
    const t = await q.query<{ id: string; ref: string; status: string }>('select id, ref, status from tickets where id = $1', [ticketId]);
    if (!t.rows[0] || !ACTIVE_STATUSES.includes(t.rows[0].status)) throw new HttpError(404, 'not_found', 'That issue is not open for following');
    await q.query(`insert into ticket_followers (ticket_id, user_id, via, created_at) values ($1,$2,'follow',$3) on conflict do nothing`, [ticketId, actor.id, now]);
    await addEvent(q, ticketId, null, now, { type: 'follower_added', note: 'Another resident reported the same problem and is following this issue' });
    return { ref: t.rows[0].ref };
  }, db);
}

// ---------------------------------------------------------------- lifecycle actions
export type ActionName =
  | 'assign' | 'acknowledge' | 'first_action' | 'start_work' | 'progress' | 'restore' | 'transfer' | 'priority'
  | 'request_info' | 'provide_info' | 'submit_review' | 'approve' | 'request_evidence' | 'rework' | 'reopen' | 'cancel'
  | 'route' | 'confirm_duplicate' | 'reject_duplicate' | 'refer' | 'add_supporting';

export interface ActionInput {
  action: ActionName;
  expectedVersion?: number;
  note?: string;
  reason?: string;
  officerId?: string | null;
  wardCode?: string;
  departmentCode?: string;
  priority?: Priority;
  restored?: 'access' | 'supply';
  duplicateOf?: string;
  checklist?: Record<string, boolean>;
  assessmentId?: string | null;
  noPhotoReason?: string;
  workOrderRef?: string;
}

const STAFF = ['officer', 'ward_admin', 'super_admin'];
const ADMIN = ['ward_admin', 'super_admin'];
const OPEN_WORK = ['assigned', 'acknowledged', 'in_progress'];

const RULES: Record<ActionName, { roles: string[]; from: string[] }> = {
  assign: { roles: STAFF, from: OPEN_WORK },
  acknowledge: { roles: STAFF, from: ['assigned'] },
  first_action: { roles: STAFF, from: OPEN_WORK },
  start_work: { roles: STAFF, from: ['assigned', 'acknowledged'] },
  progress: { roles: STAFF, from: ['acknowledged', 'in_progress'] },
  restore: { roles: STAFF, from: ['acknowledged', 'in_progress', 'awaiting_verification'] },
  transfer: { roles: STAFF, from: ['submitted', ...OPEN_WORK, 'needs_info'] },
  priority: { roles: STAFF, from: ['submitted', ...OPEN_WORK, 'needs_info', 'awaiting_verification'] },
  request_info: { roles: STAFF, from: ['submitted', ...OPEN_WORK] },
  provide_info: { roles: ['resident'], from: ['needs_info'] },
  submit_review: { roles: STAFF, from: ['acknowledged', 'in_progress'] },
  approve: { roles: ['super_admin'], from: ['awaiting_verification'] },
  request_evidence: { roles: ['super_admin'], from: ['awaiting_verification'] },
  rework: { roles: ['super_admin'], from: ['awaiting_verification'] },
  reopen: { roles: ['resident', 'super_admin'], from: ['verified_resolved'] },
  cancel: { roles: ['resident', 'super_admin'], from: ['submitted', 'assigned', 'acknowledged', 'needs_info'] },
  route: { roles: ADMIN, from: ['submitted'] },
  confirm_duplicate: { roles: ADMIN, from: ['submitted', ...OPEN_WORK, 'needs_info'] },
  reject_duplicate: { roles: ADMIN, from: ['submitted', ...OPEN_WORK, 'needs_info', 'awaiting_verification'] },
  refer: { roles: ADMIN, from: ['submitted', ...OPEN_WORK, 'needs_info'] },
  add_supporting: { roles: STAFF, from: ['submitted', ...OPEN_WORK, 'needs_info'] },
};

export function allowedActions(role: string, status: string, isReporter: boolean): ActionName[] {
  return (Object.keys(RULES) as ActionName[]).filter((a) => {
    const r = RULES[a];
    if (!r.roles.includes(role) || !r.from.includes(status)) return false;
    if ((a === 'provide_info' || a === 'reopen' || a === 'cancel') && role === 'resident' && !isReporter) return false;
    return true;
  });
}

export async function performAction(db: Db, actor: Actor, ticketId: string, input: ActionInput, now: Date) {
  const rule = RULES[input.action];
  if (!rule) throw new HttpError(400, 'bad_action', 'Unknown action');
  if (!rule.roles.includes(actor.role)) throw new HttpError(403, 'forbidden', 'Your role cannot do this');
  const need = (v: string | undefined, msg: string) => { if (!v || !v.trim()) throw new HttpError(400, 'reason_required', msg); return v.trim(); };

  return withUser(actor, async (q) => {
    const t = await getTicketRow(q, ticketId);
    if (input.expectedVersion != null && input.expectedVersion !== t.version) {
      throw new HttpError(409, 'stale', 'Someone else updated this ticket. Reload to see the latest version before acting.');
    }
    if (!rule.from.includes(t.status)) throw new HttpError(409, 'bad_state', `This ticket is ${t.status.replace(/_/g, ' ')}, so "${input.action.replace(/_/g, ' ')}" is not available`);
    if (actor.role === 'resident' && t.reporter_id !== actor.id) throw new HttpError(403, 'forbidden', 'Only the person who reported this can do that');

    const set: Record<string, unknown> = {};
    let ev: EventInput = { type: input.action };
    let toStatus = t.status;
    const audience: { residents?: string; staff?: string; admins?: string } = {};
    const cat = CATEGORY_BY_CODE[t.category_code];

    switch (input.action) {
      case 'assign': {
        const officerId = input.officerId ?? actor.id;
        const ok = await q.query(`select 1 from memberships where user_id = $1 and ward_code = $2 and (department_code is null or department_code = $3)`, [officerId, t.ward_code, t.department_code]);
        if (!ok.rows.length) throw new HttpError(400, 'bad_officer', 'That officer is not a member of this ward and department');
        const name = (await q.query<{ name: string }>('select name from users where id = $1', [officerId])).rows[0]?.name;
        set.assigned_officer_id = officerId;
        ev = { type: 'officer_assigned', from_owner: owner(t), to_owner: { ...owner(t), officer_id: officerId, officer_name: name }, note: `Assigned to ${name}` };
        break;
      }
      case 'acknowledge':
        toStatus = 'acknowledged'; set.acknowledged_at = now;
        if (!t.assigned_officer_id && actor.role !== 'super_admin') set.assigned_officer_id = actor.id;
        ev = { type: 'acknowledged', note: input.note ?? 'Team has seen the report' };
        audience.residents = 'Your report was acknowledged by the ward team';
        break;
      case 'first_action': {
        const note = need(input.note, 'Describe the first action taken (e.g. pump deployed, area barricaded)');
        if (t.status === 'assigned') { toStatus = 'acknowledged'; set.acknowledged_at = t.acknowledged_at ?? now; }
        if (!t.assigned_officer_id && actor.role !== 'super_admin') set.assigned_officer_id = actor.id;
        if (!t.first_action_at) {
          set.first_action_at = now;
          if (t.first_action_due_at) set.first_action_outcome = now <= t.first_action_due_at ? 'met' : 'breached';
        }
        ev = { type: 'first_action', note, data: { first_action_due_at: t.first_action_due_at, within_deadline: t.first_action_due_at ? now <= t.first_action_due_at : null } };
        audience.residents = `First action taken: ${note}`;
        break;
      }
      case 'start_work':
        toStatus = 'in_progress'; set.work_started_at = now;
        set.acknowledged_at = t.acknowledged_at ?? now;
        if (!t.assigned_officer_id && actor.role !== 'super_admin') set.assigned_officer_id = actor.id;
        if (!t.first_action_at) {
          set.first_action_at = now;
          if (t.first_action_due_at) set.first_action_outcome = now <= t.first_action_due_at ? 'met' : 'breached';
        }
        ev = { type: 'work_started', note: input.note ?? 'Work started on site' };
        audience.residents = 'Work has started on your report';
        break;
      case 'progress':
        ev = { type: 'progress_update', note: need(input.note, 'Write the progress update'), data: { work_order_ref: input.workOrderRef ?? null } };
        if (!t.first_action_at) { set.first_action_at = now; if (t.first_action_due_at) set.first_action_outcome = now <= t.first_action_due_at ? 'met' : 'breached'; }
        audience.residents = `Update: ${input.note}`;
        break;
      case 'restore': {
        const field = input.restored === 'supply' ? 'supply_restored_at' : 'access_restored_at';
        if (field === 'access_restored_at' && t.category_code !== 'waterlogging' && t.category_code !== 'fallen_tree') throw new HttpError(400, 'bad_restore', 'Access restoration applies to flooding and obstruction tickets');
        if (field === 'supply_restored_at' && t.category_code !== 'water_supply') throw new HttpError(400, 'bad_restore', 'Supply restoration applies to water supply tickets');
        set[field] = now;
        ev = { type: field === 'supply_restored_at' ? 'supply_restored' : 'access_restored', note: input.note ?? (field === 'supply_restored_at' ? 'Water supply restored' : 'Access restored: road passable') };
        audience.residents = field === 'supply_restored_at' ? 'Water supply restored' : 'Access restored';
        break;
      }
      case 'transfer': {
        const reason = need(input.reason, 'Give a reason for the transfer');
        const ward = input.wardCode ?? t.ward_code;
        const dept = input.departmentCode ?? t.department_code;
        if (!ward || !dept) throw new HttpError(400, 'bad_transfer', 'Choose the new ward and department');
        if (ward === t.ward_code && dept === t.department_code) throw new HttpError(400, 'bad_transfer', 'The ticket is already with that team');
        const exists = await q.query('select 1 from wards w, departments d where w.ward_code = $1 and d.code = $2', [ward, dept]);
        if (!exists.rows.length) throw new HttpError(400, 'bad_transfer', 'Unknown ward or department');
        set.ward_code = ward; set.department_code = dept; set.assigned_officer_id = null; set.in_triage = false;
        if (t.status === 'submitted') { toStatus = 'assigned'; set.routed_at = now; }
        // The SLA clock, ticket id and evidence stay as they are: only the owner changes.
        ev = { type: 'transferred', from_owner: owner(t), to_owner: { ward_code: ward, department_code: dept, officer_id: null }, reason,
          data: { resolution_due_at: t.resolution_due_at, first_action_due_at: t.first_action_due_at, clock_preserved: true } };
        audience.staff = `Ticket transferred to your team: ${reason}`;
        break;
      }
      case 'priority': {
        const reason = need(input.reason, 'Give a reason for changing the priority');
        if (!input.priority || input.priority === t.priority) throw new HttpError(400, 'bad_priority', 'Choose a different priority');
        const policy = await activePolicy(q, input.priority);
        const dl = computeDeadlines(policy, t.clock_started_at);
        Object.assign(set, { priority: input.priority, sla_policy_id: policy.id, sla_policy_version: policy.version, ...dl });
        if (t.first_action_at) set.first_action_due_at = dl.first_action_due_at;
        ev = { type: 'priority_changed', reason, data: { from: t.priority, to: input.priority, old_resolution_due_at: t.resolution_due_at, new_resolution_due_at: dl.resolution_due_at } };
        break;
      }
      case 'request_info':
        toStatus = 'needs_info'; set.status_before_hold = t.status;
        ev = { type: 'info_requested', note: need(input.note, 'Write the question for the resident') };
        audience.residents = `The ward team needs more information: ${input.note}`;
        break;
      case 'provide_info':
        toStatus = t.status_before_hold ?? 'assigned'; set.status_before_hold = null;
        ev = { type: 'info_provided', note: need(input.note, 'Write your answer') };
        audience.staff = `Resident replied on ${t.ref}`;
        break;
      case 'submit_review': {
        const after = await q.query<{ n: number }>(`select count(*)::int as n from evidence where ticket_id = $1 and phase = 'after'`, [t.id]);
        if (cat?.photoRequiredForClosure && after.rows[0].n === 0 && !input.noPhotoReason) {
          throw new HttpError(400, 'evidence_required', 'Upload at least one "after" photo, or explain why a photo cannot show the repair');
        }
        if (t.category_code === 'waterlogging' && !t.access_restored_at) throw new HttpError(400, 'restoration_required', 'Record when access was restored before submitting for review');
        if (t.category_code === 'water_supply' && t.details?.supply_stopped === 'yes' && !t.supply_restored_at) throw new HttpError(400, 'restoration_required', 'Record when water supply was restored before submitting for review');
        toStatus = 'awaiting_verification'; set.completion_submitted_at = now;
        ev = { type: 'submitted_for_review', note: input.note ?? 'Work complete; evidence submitted', data: { after_photos: after.rows[0].n, no_photo_reason: input.noPhotoReason ?? null, work_order_ref: input.workOrderRef ?? null } };
        audience.residents = 'Work reported complete. A reviewer is checking the evidence.';
        audience.admins = `${t.ref} is ready for evidence review`;
        break;
      }
      case 'approve': {
        const reason = need(input.reason, 'Record why the evidence is sufficient');
        const after = await q.query<{ n: number }>(`select count(*)::int as n from evidence where ticket_id = $1 and phase = 'after'`, [t.id]);
        const noPhoto = await q.query<{ r: string | null }>(`select data->>'no_photo_reason' as r from ticket_events where ticket_id = $1 and type = 'submitted_for_review' order by at desc limit 1`, [t.id]);
        if (cat?.photoRequiredForClosure && after.rows[0].n === 0 && !noPhoto.rows[0]?.r) throw new HttpError(400, 'evidence_required', 'There is no completion evidence to approve');
        toStatus = 'verified_resolved';
        Object.assign(set, { verified_at: now, closed_at: now, sla_stopped_at: now, sla_outcome: now <= t.resolution_due_at ? 'met' : 'breached' });
        await recordDecision(q, actor, t, 'approve', reason, input, now);
        ev = { type: 'verified', reason, data: { sla_outcome: set.sla_outcome, assessment_id: input.assessmentId ?? null, manual: !input.assessmentId } };
        audience.residents = 'Your issue is verified as resolved';
        break;
      }
      case 'request_evidence':
      case 'rework': {
        const reason = need(input.reason, input.action === 'rework' ? 'Explain what must be redone' : 'Explain what evidence is missing');
        toStatus = 'in_progress';
        await recordDecision(q, actor, t, input.action, reason, input, now);
        ev = { type: input.action === 'rework' ? 'returned_for_rework' : 'more_evidence_requested', reason };
        audience.staff = `${t.ref}: ${input.action === 'rework' ? 'returned for rework' : 'more evidence requested'}: ${reason}`;
        audience.residents = input.action === 'rework' ? 'The repair was not accepted yet and has been sent back for more work' : 'The reviewer asked the team for more evidence';
        break;
      }
      case 'reopen': {
        const reason = need(input.reason, 'Tell us what is wrong now');
        if (actor.role === 'resident' && t.verified_at && now.getTime() - t.verified_at.getTime() > 30 * 86400_000) throw new HttpError(400, 'too_late', 'Reopening is possible within 30 days of closure. Please file a new report.');
        const policy = await activePolicy(q, t.priority);
        const dl = computeDeadlines(policy, now);
        toStatus = 'assigned';
        Object.assign(set, { reopen_count: t.reopen_count + 1, clock_started_at: now, ...dl, sla_stopped_at: null, sla_outcome: null, first_action_at: null, first_action_outcome: null,
          acknowledged_at: null, work_started_at: null, completion_submitted_at: null, verified_at: null, closed_at: null, access_restored_at: null, supply_restored_at: null, escalation_level: 0 });
        ev = { type: 'reopened', reason, data: { previous_sla_outcome: t.sla_outcome, previous_verified_at: t.verified_at, new_resolution_due_at: dl.resolution_due_at, cycle: t.reopen_count + 1 } };
        audience.staff = `${t.ref} was reopened: ${reason}`;
        break;
      }
      case 'cancel': {
        const reason = need(input.reason, 'Give a reason for cancelling');
        toStatus = 'cancelled'; Object.assign(set, { closed_at: now, sla_stopped_at: now });
        ev = { type: 'cancelled', reason };
        audience.staff = `${t.ref} was cancelled: ${reason}`;
        break;
      }
      case 'route': {
        const ward = need(input.wardCode, 'Choose the ward');
        const dept = need(input.departmentCode, 'Choose the department');
        toStatus = 'assigned';
        Object.assign(set, { ward_code: ward, department_code: dept, in_triage: false, routed_at: now });
        ev = { type: 'routed', from_owner: owner(t), to_owner: { ward_code: ward, department_code: dept }, reason: input.reason ?? 'Location confirmed in triage', data: { from_triage: true } };
        audience.staff = `New ticket ${t.ref} routed to your team from triage`;
        audience.residents = `Your report was confirmed for Ward ${ward}`;
        break;
      }
      case 'confirm_duplicate': {
        const reason = need(input.reason, 'Explain why these are the same issue');
        const canon = await getTicketRow(q, need(input.duplicateOf, 'Choose the original ticket'));
        if (canon.id === t.id) throw new HttpError(400, 'bad_duplicate', 'A ticket cannot duplicate itself');
        toStatus = 'duplicate'; Object.assign(set, { duplicate_of: canon.id, closed_at: now, sla_stopped_at: now });
        await q.query(`insert into ticket_links (ticket_id, related_ticket_id, status, reason, decided_by, decided_at) values ($1,$2,'confirmed',$3,$4,$5)
          on conflict (ticket_id, related_ticket_id) do update set status='confirmed', reason=excluded.reason, decided_by=excluded.decided_by, decided_at=excluded.decided_at`, [t.id, canon.id, reason, actor.id, now]);
        await q.query(`insert into ticket_followers (ticket_id, user_id, via, created_at) values ($1,$2,'duplicate',$3) on conflict do nothing`, [canon.id, t.reporter_id, now]);
        await addEvent(q, canon.id, actor, now, { type: 'duplicate_linked', note: `${t.ref} confirmed as a duplicate of this ticket; its reporter now follows this one`, reason });
        ev = { type: 'duplicate_confirmed', reason, data: { canonical_ref: canon.ref, canonical_id: canon.id } };
        audience.residents = `Your report is the same issue as ${canon.ref}. You will get its updates.`;
        break;
      }
      case 'reject_duplicate': {
        const other = need(input.duplicateOf, 'Choose the suggested ticket');
        await q.query(`update ticket_links set status='rejected', decided_by=$3, decided_at=$4, reason=$5 where ticket_id=$1 and related_ticket_id=$2`, [t.id, other, actor.id, now, input.reason ?? 'Different issue']);
        ev = { type: 'duplicate_rejected', visibility: 'staff', reason: input.reason ?? 'Different issue' };
        break;
      }
      case 'refer': {
        const reason = need(input.reason, 'Name the agency and reason (e.g. "MMRDA road, forwarded")');
        toStatus = 'referred'; Object.assign(set, { closed_at: now, sla_stopped_at: now });
        ev = { type: 'referred', reason };
        audience.residents = `Your report was referred to another agency: ${reason}`;
        break;
      }
      case 'add_supporting': {
        const dept = need(input.departmentCode, 'Choose the supporting department');
        const note = need(input.note, 'Describe the handoff');
        const list = [...new Set([...(t.supporting_departments ?? []), dept])].filter((d) => d !== t.department_code);
        set.supporting_departments = list;
        ev = { type: 'supporting_handoff', note, data: { department: dept } };
        audience.staff = `${t.ref}: supporting handoff to ${dept}`;
        break;
      }
    }

    if (toStatus !== t.status) {
      set.status = toStatus;
      set.progress_pct = progressFor(toStatus, (set.status_before_hold as string | null | undefined) ?? t.status_before_hold, t.progress_pct);
      ev.from_status = t.status; ev.to_status = toStatus;
    }
    // The history entry is written first: after a transfer the acting officer may no longer be
    // allowed to see the row, and the event must still be recorded under their name.
    const evId = await addEvent(q, t.id, actor, now, ev);
    const cols = Object.keys(set);
    if (cols.length) {
      const params = cols.map((c) => set[c]);
      const sql = `update tickets set ${cols.map((c, i) => `${c} = $${i + 3}`).join(', ')} where id = $1 and version = $2`;
      const ownerChange = 'ward_code' in set || 'department_code' in set;
      const r = ownerChange ? await elevated(q, actor, () => q.query(sql, [t.id, t.version, ...params])) : await q.query(sql, [t.id, t.version, ...params]);
      if (r.affectedRows !== 1) throw new HttpError(409, 'stale', 'Someone else updated this ticket at the same moment. Reload and try again.');
    }
    const base = `${t.id}:ev${evId}`;
    if (audience.residents) await notify(q, await residentAudience(q, t), { ticketId: t.id, kind: ev.type, title: `${t.ref}: ${audience.residents}`, dedupeBase: base }, now);
    const ward = (set.ward_code as string) ?? t.ward_code;
    const dept = (set.department_code as string) ?? t.department_code;
    if (audience.staff) await notify(q, (await teamMembers(q, ward, dept)).filter((u) => u !== actor.id), { ticketId: t.id, kind: ev.type, title: audience.staff, dedupeBase: base }, now);
    if (audience.admins) await notify(q, await superAdmins(q), { ticketId: t.id, kind: ev.type, title: audience.admins, dedupeBase: base }, now);
    return { ok: true, status: toStatus };
  }, db);
}

async function recordDecision(q: Queryable, actor: Actor, t: TicketRow, decision: 'approve' | 'request_evidence' | 'rework', reason: string, input: ActionInput, now: Date) {
  let model: string | null = null;
  if (input.assessmentId) {
    const a = await q.query<{ model: string | null; ticket_id: string }>('select model, ticket_id from evidence_assessments where id = $1', [input.assessmentId]);
    if (!a.rows[0] || a.rows[0].ticket_id !== t.id) throw new HttpError(400, 'bad_assessment', 'That assessment does not belong to this ticket');
    model = a.rows[0].model;
  }
  await q.query(
    `insert into review_decisions (ticket_id, reviewer_id, decision, reason, assessment_id, model_version, manual, checklist, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [t.id, actor.id, decision, reason, input.assessmentId ?? null, model, !input.assessmentId, JSON.stringify(input.checklist ?? {}), now],
  );
}

// ---------------------------------------------------------------- SLA sweep (background job)
const THRESHOLD_TEXT: Record<ThresholdKey, { title: (ref: string) => string; escalate?: number; audience: 'team' | 'team+admins' }> = {
  critical_alert: { title: (r) => `CRITICAL: ${r} needs a first action within 5 hours`, audience: 'team' },
  first_action_due_soon: { title: (r) => `${r}: first action due within the hour`, audience: 'team' },
  first_action_breach: { title: (r) => `ESCALATED: ${r} missed its first-action deadline`, escalate: 1, audience: 'team+admins' },
  reminder_day2: { title: (r) => `Reminder: ${r} is 2 days old and not yet resolved`, audience: 'team' },
  resolution_due_soon: { title: (r) => `${r}: resolution deadline is approaching`, audience: 'team' },
  resolution_breach: { title: (r) => `ESCALATED: ${r} missed its resolution deadline`, escalate: 2, audience: 'team+admins' },
};

export async function runSlaSweep(db: Db, now: Date): Promise<{ checked: number; fired: { ref: string; key: string }[] }> {
  const fired: { ref: string; key: string }[] = [];
  const tickets = await withSystem((q) => q.query<TicketRow & { due_soon_fraction: number; alert_on_submit: boolean }>(
    `select t.*, p.due_soon_fraction, p.alert_on_submit from tickets t join sla_policies p on p.id = t.sla_policy_id
     where t.sla_stopped_at is null and t.status not in ('verified_resolved','cancelled','duplicate','referred')`), db);
  for (const t of tickets.rows) {
    const hits = thresholdsReached(t, t, now);
    if (!hits.length) continue;
    await withSystem(async (q) => {
      for (const h of hits) {
        const key = `${t.id}:${h.key}:c${h.cycle}`;
        const cfg = THRESHOLD_TEXT[h.key];
        const evId = await addEvent(q, t.id, null, now, {
          type: `sla_${h.key}`, dedupe_key: key,
          note: `${cfg.title(t.ref)} (threshold ${formatIST(h.at)})`,
          data: { threshold: h.key, threshold_at: h.at, cycle: h.cycle, escalation_level: cfg.escalate ?? null },
          visibility: h.key.endsWith('breach') ? 'all' : 'staff',
        });
        if (!evId) continue; // already handled on an earlier run: retries never duplicate
        fired.push({ ref: t.ref, key: h.key });
        if (cfg.escalate) {
          await q.query(`update tickets set escalation_level = greatest(escalation_level, $2),
            first_action_outcome = case when $3 then 'breached' else first_action_outcome end where id = $1`, [t.id, cfg.escalate, h.key === 'first_action_breach']);
        }
        const team = await teamMembers(q, t.ward_code ?? t.suggested_ward_code, t.department_code);
        const recipients = cfg.audience === 'team' ? team : [...team, ...await superAdmins(q)];
        await notify(q, recipients, { ticketId: t.id, kind: h.key, title: cfg.title(t.ref), body: t.title, dedupeBase: key }, now);
      }
    }, db);
  }
  return { checked: tickets.rows.length, fired };
}
