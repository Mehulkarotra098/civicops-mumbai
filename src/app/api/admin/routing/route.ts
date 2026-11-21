import { NextResponse } from 'next/server';
import { getDb, HttpError, withUser } from '@/lib/db';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(['super_admin']);
    const b = await req.json();
    if (!b.reason?.trim()) throw new HttpError(400, 'reason_required', 'Give a reason for the change');
    const r = await withUser(user, async (q) => {
      const prev = (await q.query<{ id: number; version: number; primary_department: string; supporting_departments: string[] }>(
        `select id, version, primary_department, supporting_departments from routing_rules where active and coalesce(ward_code,'*') = coalesce($1,'*') and category_code = $2`, [b.wardCode ?? null, b.category])).rows[0];
      if (prev) await q.query('update routing_rules set active = false where id = $1', [prev.id]);
      const ins = await q.query<{ id: number }>(`insert into routing_rules (ward_code, category_code, primary_department, supporting_departments, version, note, updated_by) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [b.wardCode ?? null, b.category, b.primary, b.supporting ?? [], (prev?.version ?? 0) + 1, b.reason, user.id]);
      await q.query(`insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, before, after, reason) values ($1,$2,'routing_rule.set','routing_rule',$3,$4,$5,$6)`,
        [user.id, user.role, String(ins.rows[0].id), prev ? JSON.stringify(prev) : null, JSON.stringify(b), b.reason]);
      return ins.rows[0];
    }, await getDb());
    const { clearRefCache } = await import('@/lib/tickets');
    clearRefCache();
    return NextResponse.json(r);
  } catch (e) {
    return apiError(e);
  }
}
