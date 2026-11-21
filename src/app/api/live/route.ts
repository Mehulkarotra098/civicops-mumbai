// Public live dashboard feed. No sign-in, no personal data: no reporter, asker or officer identities.
import { NextResponse } from 'next/server';
import { getDb, withSystem } from '@/lib/db';
import { loadHistory, moneyTrail, MONEY_FLAGS } from '@/lib/history';
import { CATEGORY_BY_CODE } from '@/lib/config';

export const dynamic = 'force-dynamic';

const CLOSED = ['verified_resolved', 'duplicate', 'cancelled', 'referred'];

const TICKET_LABEL: Record<string, string> = {
  submitted: 'Report submitted', triaged: 'Sent to triage', officer_assigned: 'Officer assigned', acknowledged: 'Acknowledged',
  first_action: 'First action', work_started: 'Work started', progress_update: 'Progress update', access_restored: 'Access restored',
  supply_restored: 'Supply restored', transferred: 'Transferred', priority_changed: 'Priority changed', info_requested: 'Information requested',
  info_provided: 'Resident replied', submitted_for_review: 'Completion evidence submitted', verified: 'Closure verified',
  returned_for_rework: 'Returned for rework', more_evidence_requested: 'More evidence requested', reopened: 'Reopened', cancelled: 'Cancelled',
  duplicate_suggested: 'Possible duplicate found', duplicate_confirmed: 'Confirmed as duplicate', duplicate_linked: 'Duplicate linked',
  referred: 'Referred to another agency', supporting_added: 'Supporting team added', evidence_added: 'Photo added',
  follower_added: 'Another resident is following', sla_critical_alert: 'Critical alert sent', sla_first_action_due_soon: 'First action due soon',
  sla_first_action_breach: 'Escalated: first-action deadline missed', sla_reminder_day2: 'Day-2 reminder',
  sla_resolution_due_soon: 'Resolution deadline approaching', sla_resolution_breach: 'Escalated: resolution deadline missed',
};
const CASE_LABEL: Record<string, string> = {
  flag_raised: 'Spending flag raised', question_asked: 'Resident question received', assigned: 'Assigned to the responsible office',
  escalated_overdue: 'Escalated: response overdue', response_submitted: 'Written response published',
  decision_justified: 'Independent review: explanation accepted', decision_correction_required: 'Independent review: correction required',
  decision_referred: 'Independent review: referred', decision_needs_evidence: 'Independent review: more evidence needed',
  correction_reported: 'Office reports the correction done', closed_corrected: 'Correction verified, case closed',
};

type Geo = { type?: string; coordinates?: unknown } | string | null;
function ring(g: Geo): [number, number][] {
  try {
    const o = (typeof g === 'string' ? JSON.parse(g) : g) as { type?: string; coordinates?: unknown[] } | null;
    if (!o || !Array.isArray(o.coordinates)) return [];
    const c = o.type === 'MultiPolygon' ? (o.coordinates[0] as unknown[])?.[0] : o.coordinates[0];
    return Array.isArray(c) ? (c as [number, number][]).map((p) => [Number(p[0]), Number(p[1])] as [number, number]) : [];
  } catch { return []; }
}

const humanise = (s: string) => s.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase());
// "Overdue" = still open, clock running, and a first-action or resolution deadline has passed.
const OVERDUE_SQL = `(status <> all($1::text[]) and sla_stopped_at is null and ((first_action_due_at < $2::timestamptz and first_action_at is null) or resolution_due_at < $2::timestamptz))`;
const DUE_SOON_SQL = `(resolution_due_at < $2::timestamptz + interval '24 hours' or (first_action_at is null and first_action_due_at < $2::timestamptz + interval '2 hours'))`;

export async function GET() {
  const now = new Date();
  const istMidnight = new Date(Math.floor((now.getTime() + 5.5 * 3600_000) / 86_400_000) * 86_400_000 - 5.5 * 3600_000);
  try {
    const out = await withSystem(async (q) => {
      const k = (await q.query<{ open: number; crit: number; overdue: number; escalated: number; verified_today: number; avg_fa: number | null }>(
        `select
           count(*) filter (where status <> all($1::text[]))::int as open,
           count(*) filter (where status <> all($1::text[]) and priority = 'critical')::int as crit,
           count(*) filter (where ${OVERDUE_SQL})::int as overdue,
           count(*) filter (where status <> all($1::text[]) and escalation_level > 0)::int as escalated,
           count(*) filter (where status = 'verified_resolved' and coalesce(verified_at, closed_at) >= $3::timestamptz)::int as verified_today,
           (avg(extract(epoch from (first_action_at - submitted_at)) / 60) filter (where first_action_at is not null))::float8 as avg_fa
         from tickets`, [CLOSED, now, istMidnight])).rows[0];

      const donut = (await q.query<{ on_track: number; due_soon: number; overdue: number; met: number; breached: number }>(
        `select
           count(*) filter (where status <> all($1::text[]) and not ${OVERDUE_SQL} and not ${DUE_SOON_SQL})::int as on_track,
           count(*) filter (where status <> all($1::text[]) and not ${OVERDUE_SQL} and ${DUE_SOON_SQL})::int as due_soon,
           count(*) filter (where ${OVERDUE_SQL})::int as overdue,
           count(*) filter (where sla_outcome = 'met')::int as met,
           count(*) filter (where sla_outcome = 'breached')::int as breached
         from tickets`, [CLOSED, now])).rows[0];

      const c = (await q.query<{ open: number; overdue: number; decided: number }>(
        `select
           count(*) filter (where status not in ('justified', 'corrected', 'closed'))::int as open,
           count(*) filter (where status in ('awaiting_response', 'needs_evidence') and (response_due_at < $1::timestamptz or escalated_at is not null))::int as overdue,
           count(*) filter (where decision is not null)::int as decided
         from accountability_cases`, [now])).rows[0];

      const h = await loadHistory(q);
      const trail = moneyTrail(h);
      const moneyFlags = h.flags.filter((f) => MONEY_FLAGS.includes(f.type));
      const flagsByWard = new Map<string, number>();
      for (const f of moneyFlags) flagsByWard.set(f.ward_code, (flagsByWard.get(f.ward_code) ?? 0) + 1);

      const geo = (await q.query<{ ward_code: string; centroid_lat: number; centroid_lon: number; boundary_geojson: Geo }>(
        'select ward_code, centroid_lat::float8 as centroid_lat, centroid_lon::float8 as centroid_lon, boundary_geojson from wards')).rows;
      const geoBy = new Map(geo.map((g) => [g.ward_code, g]));
      const openBy = new Map((await q.query<{ ward_code: string; n: number }>(
        'select ward_code, count(*)::int as n from tickets where status <> all($1::text[]) and ward_code is not null group by ward_code', [CLOSED])).rows.map((r) => [r.ward_code, r.n]));

      const wards = trail.map((w) => {
        const g = geoBy.get(w.ward_code);
        return {
          code: w.ward_code, name: w.ward_name,
          centroid: [Number(g?.centroid_lat ?? 0), Number(g?.centroid_lon ?? 0)] as [number, number],
          polygon: ring(g?.boundary_geojson ?? null),
          budget: w.budget_inr_2025, spend: w.spend, utilisation: w.utilisation ?? 0,
          flags: flagsByWard.get(w.ward_code) ?? 0, openTickets: openBy.get(w.ward_code) ?? 0,
        };
      });

      const tickets = (await q.query<{ ref: string; lat: number; lon: number; priority: string; status: string; title: string; category_code: string; overdue: boolean }>(
        `select ref, lat, lon, priority, status, title, category_code, ${OVERDUE_SQL} as overdue
         from tickets
         where lat is not null and lon is not null
           and (status <> all($1::text[]) or (status = 'verified_resolved' and coalesce(verified_at, closed_at, updated_at) > $2::timestamptz - interval '7 days'))
         order by submitted_at desc limit 400`, [CLOSED, now])).rows.map((t) => ({
        ref: t.ref, lat: Number(t.lat), lon: Number(t.lon), priority: t.priority, status: t.status, title: t.title,
        category: CATEGORY_BY_CODE[t.category_code]?.short ?? humanise(t.category_code), overdue: !!t.overdue,
      }));

      const te = (await q.query<{ at: Date; ref: string; ward: string | null; type: string; to_owner: { ward_code?: string } | null; title: string }>(
        `select e.at, t.ref, t.ward_code as ward, e.type, e.to_owner, t.title
         from ticket_events e join tickets t on t.id = e.ticket_id
         where e.visibility = 'all' order by e.at desc, e.id desc limit 25`)).rows;
      const ce = (await q.query<{ at: Date; ref: string; ward: string; type: string; flag_type: string | null }>(
        `select e.at, c.ref, c.ward_code as ward, e.type, c.flag_type
         from case_events e join accountability_cases c on c.id = e.case_id
         where e.type <> 'assigned' -- every flag is assigned the moment it is raised; skip the duplicate line
         order by e.at desc, e.id desc limit 25`)).rows;
      const feed = [
        ...te.map((e) => ({
          at: new Date(e.at).toISOString(), kind: 'ticket' as const, ref: e.ref, ward: e.ward ?? '', type: e.type, title: e.title,
          text: e.type === 'routed' ? `Routed to ${e.to_owner?.ward_code ?? e.ward ?? 'ward'}` : TICKET_LABEL[e.type] ?? humanise(e.type),
        })),
        ...ce.map((e) => ({
          at: new Date(e.at).toISOString(), kind: 'case' as const, ref: e.ref, ward: e.ward, type: e.type,
          title: e.flag_type ? `Spending check: ${humanise(e.flag_type).toLowerCase()}` : 'Spending question',
          text: CASE_LABEL[e.type] ?? humanise(e.type),
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);

      const byCategory = (await q.query<{ category_code: string; n: number }>(
        'select category_code, count(*)::int as n from tickets group by category_code order by n desc limit 12')).rows
        .map((r) => ({ category: CATEGORY_BY_CODE[r.category_code]?.short ?? humanise(r.category_code), n: r.n }));

      const billed = trail.reduce((s, w) => s + w.spend, 0);
      const budget = trail.reduce((s, w) => s + (w.budget_inr_2025 ?? 0), 0);
      return {
        now: now.toISOString(),
        kpis: {
          openTickets: k.open, criticalOpen: k.crit, overdue: k.overdue, escalated: k.escalated, verifiedToday: k.verified_today,
          avgFirstActionMinutes: k.avg_fa == null ? null : Math.round(k.avg_fa),
          casesOpen: c.open, casesOverdue: c.overdue, casesDecided: c.decided,
          amountQuestioned: moneyFlags.reduce((s, f) => s + (f.amount_at_issue ?? 0), 0), billed, budget,
        },
        wards, tickets, feed, byCategory,
        slaDonut: { onTrack: donut.on_track, dueSoon: donut.due_soon, overdue: donut.overdue, met: donut.met, breached: donut.breached },
      };
    }, await getDb());
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('live feed failed', e);
    return NextResponse.json({ error: 'Live data unavailable' }, { status: 500 });
  }
}
