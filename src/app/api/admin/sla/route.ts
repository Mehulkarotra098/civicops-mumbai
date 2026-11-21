import { NextResponse } from 'next/server';
import { getDb, HttpError, withUser } from '@/lib/db';
import { apiError, requireApiUser } from '@/lib/session';

const LABEL: Record<string, string> = { critical: 'Red · Critical', medium: 'Yellow · Medium', standard: 'Orange · Standard' };

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(['super_admin']);
    const b = await req.json();
    if (!LABEL[b.priority]) throw new HttpError(400, 'bad_priority', 'Unknown priority');
    if (!(Number(b.resolutionHours) > 0)) throw new HttpError(400, 'bad_hours', 'Resolution hours must be positive');
    if (!b.reason?.trim()) throw new HttpError(400, 'reason_required', 'Give a reason for the change');
    const r = await withUser(user, async (q) => {
      const prev = (await q.query<Record<string, unknown> & { id: number; version: number; alert_on_submit: boolean }>('select * from sla_policies where active and priority = $1', [b.priority])).rows[0];
      const version = ((await q.query<{ v: number }>('select coalesce(max(version),0)::int as v from sla_policies')).rows[0].v) + 1;
      if (prev) await q.query('update sla_policies set active = false where id = $1', [prev.id]);
      const ins = await q.query<{ id: number }>(`insert into sla_policies (version, priority, label, first_action_hours, reminder_hours, resolution_hours, alert_on_submit, note, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [version, b.priority, LABEL[b.priority], b.firstActionHours ?? null, b.reminderHours ?? null, Number(b.resolutionHours), prev?.alert_on_submit ?? b.priority === 'critical', b.reason, user.id]);
      await q.query(`insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after, reason) values ($1,$2,'sla_policy.publish','sla_policy',$3,$4,$5,$6)`,
        [user.id, user.role, String(ins.rows[0].id), prev ? JSON.stringify(prev) : null, JSON.stringify(b), b.reason]);
      return { id: ins.rows[0].id, version };
    }, await getDb());
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
