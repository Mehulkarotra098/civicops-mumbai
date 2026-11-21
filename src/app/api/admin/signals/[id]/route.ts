import { NextResponse } from 'next/server';
import { getDb, HttpError, withUser } from '@/lib/db';
import { addEvent } from '@/lib/tickets';
import { apiError, requireApiUser } from '@/lib/session';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(['super_admin']);
    const { id } = await ctx.params;
    const b = await req.json();
    await withUser(user, async (q) => {
      const post = (await q.query<{ post_id: string; text: string }>('select post_id, text from social_posts where post_id = $1', [id])).rows[0];
      if (!post) throw new HttpError(404, 'not_found', 'Post not found');
      if (b.action === 'dismiss') {
        await q.query(`update social_posts set review_status = 'dismissed', reviewed_by = $2, reviewed_at = now(), review_note = 'Dismissed as noise' where post_id = $1`, [id, user.id]);
      } else {
        const target = String(b.target ?? '').trim();
        if (/^BMC25-/.test(target)) {
          const c = await q.query('select 1 from hist_complaints where complaint_id = $1', [target]);
          if (!c.rows.length) throw new HttpError(404, 'not_found', 'Complaint not found');
          await q.query(`update social_posts set review_status = 'linked', linked_complaint_id = $2, reviewed_by = $3, reviewed_at = now(), review_note = 'Supporting signal for a historical complaint' where post_id = $1`, [id, target, user.id]);
        } else {
          const t = (await q.query<{ id: string }>('select id from tickets where ref = $1', [target])).rows[0];
          if (!t) throw new HttpError(404, 'not_found', 'Ticket not found');
          await q.query(`update social_posts set review_status = 'linked', linked_ticket_id = $2, reviewed_by = $3, reviewed_at = now(), review_note = 'Supporting signal' where post_id = $1`, [id, t.id, user.id]);
          await addEvent(q, t.id, user, new Date(), { type: 'signal_linked', visibility: 'staff', note: `Unverified social post ${id} linked as supporting context: "${post.text.slice(0, 140)}"` });
        }
      }
      await q.query(`insert into audit_log (actor_id, actor_role, action, entity_type, entity_id, after) values ($1,$2,$3,'social_post',$4,$5)`, [user.id, user.role, `signal.${b.action}`, id, JSON.stringify(b)]);
    }, await getDb());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
