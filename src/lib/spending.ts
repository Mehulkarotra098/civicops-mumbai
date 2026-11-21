// Public spending views (no sign-in). Reads only columns cleared for disclosure; never case_private.
import type { Queryable } from './db.ts';
import { loadHistory, BUDGET_PERIOD, type Enriched } from './history.ts';
import { responsibleFor } from './cases.ts';

export const SOURCE_NOTE = 'Synthetic hackathon dataset (Claude-Impact-Labs-data-2, commit 81d2280): work_orders.csv, rate_card.csv, wards.csv, complaints.csv, roads.csv';
export const PERIOD_NOTE = `Budget period ${BUDGET_PERIOD.label}; work orders Jun–Oct 2025`;
export const MONEY_TYPES = ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'];

export interface PublicCase {
  id: string; ref: string; kind: string; flag_type: string | null; question_type: string | null; work_order_id: string; ward_code: string;
  responsible_office: string; responsible_role: string; official_name: string | null; reviewer_office: string; amount_under_review: number | null;
  calculation: Record<string, unknown>; public_question: string | null; status: string; response_due_at: Date; escalated_at: Date | null;
  decision: string | null; decision_reason: string | null; decided_at: Date | null; previous_values: Record<string, number> | null;
  corrected_values: Record<string, number> | null; corrective_action: string | null; corrective_owner: string | null; corrective_due_at: Date | null;
  corrective_completed_at: Date | null; is_demo_example: boolean; created_at: Date; responses: number;
}

export const CASE_COLUMNS = `c.id, c.ref, c.kind, c.flag_type, c.question_type, c.work_order_id, c.ward_code, c.responsible_office, c.responsible_role, c.official_name,
  c.reviewer_office, c.amount_under_review, c.calculation, c.public_question, c.status, c.response_due_at, c.escalated_at, c.decision, c.decision_reason,
  c.decided_at, c.previous_values, c.corrected_values, c.corrective_action, c.corrective_owner, c.corrective_due_at, c.corrective_completed_at,
  c.is_demo_example, c.created_at, (select count(*)::int from case_responses r where r.case_id = c.id) as responses`;

export function isOverdue(c: Pick<PublicCase, 'status' | 'response_due_at'> & { escalated_at?: Date | null }, now = new Date()) {
  return ['awaiting_response', 'needs_evidence'].includes(c.status) && (c.response_due_at.getTime() < now.getTime() || !!c.escalated_at);
}

export async function woLocality(q: Queryable): Promise<Map<string, string>> {
  const r = await q.query<{ work_order_id: string; loc: string }>(
    `select l.work_order_id, min(c.locality_text) as loc from hist_work_order_complaints l join hist_complaints c on c.complaint_id = l.complaint_id group by l.work_order_id`);
  return new Map(r.rows.map((x) => [x.work_order_id, x.loc]));
}

export function searchWorkOrders(wos: Enriched[], loc: Map<string, string>, needle: string): Enriched[] {
  const n = needle.trim().toLowerCase();
  if (!n) return [];
  return wos.filter((w) => [w.work_order_id, w.ward_code, `ward ${w.ward_code}`, w.contractor_name, w.contractor_id, w.road?.road_name ?? '', w.road_id, w.work_type, loc.get(w.work_order_id) ?? '']
    .some((f) => f.toLowerCase().includes(n)));
}

export async function publicCases(q: Queryable, where: string, params: unknown[]): Promise<PublicCase[]> {
  return (await q.query<PublicCase>(`select ${CASE_COLUMNS} from accountability_cases c where ${where} order by c.created_at desc`, params)).rows;
}

export async function loadPublic(q: Queryable) {
  const h = await loadHistory(q);
  const loc = await woLocality(q);
  return { h, loc };
}

export { responsibleFor };

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
