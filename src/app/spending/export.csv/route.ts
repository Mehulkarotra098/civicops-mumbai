import { getDb, withSystem } from '@/lib/db';
import { loadPublic, csvEscape, MONEY_TYPES } from '@/lib/spending';

export const dynamic = 'force-dynamic';

/** Public figures as CSV: one row per work order (counted once), with source references. */
export async function GET() {
  const rows = await withSystem(async (q) => {
    const { h, loc } = await loadPublic(q);
    const cases = new Map((await q.query<{ work_order_id: string; refs: string }>(`select work_order_id, string_agg(ref || ':' || status, ' ') as refs from accountability_cases group by work_order_id`)).rows.map((r) => [r.work_order_id, r.refs]));
    return h.wos.map((w) => {
      const f = h.flags.filter((x) => x.work_order_id === w.work_order_id && (MONEY_TYPES.includes(x.type) || x.type === 'reopened' || x.type === 'incomplete_evidence'));
      return [w.work_order_id, w.ward_code, loc.get(w.work_order_id) ?? '', w.road?.road_name ?? '', w.road?.segment_no ?? '', w.road_id, w.work_type, w.repair_method, w.contractor_id, w.contractor_name,
        w.assigned_at.toISOString(), w.completed_at.toISOString(), w.area_sqm, 'Unavailable', Math.round(w.cost_inr), 'Unavailable', Math.round(w.expected_cost), w.cost_ratio.toFixed(3),
        w.sla_hours, w.sla_met ? 'Y' : 'N', w.reopened_within_30d ? 'Y' : 'N', f.map((x) => x.type).join(' '), Math.round(f.reduce((s, x) => s + x.amount_at_issue, 0)), cases.get(w.work_order_id) ?? '',
        `work_orders.csv#${w.work_order_id}; rate_card.csv#${w.repair_method}; roads.csv#${w.road_id}`, 'Jun–Oct 2025 (budget period 1 Jun – 30 Sep 2025)', 'synthetic'];
    });
  }, await getDb());
  const header = ['work_order_id', 'ward', 'locality', 'road', 'segment', 'road_id', 'purpose', 'scope_method', 'contractor_id', 'contractor', 'issued_at_utc', 'completed_at_utc', 'area_sqm',
    'committed_inr', 'billed_inr', 'paid_inr', 'rate_card_estimate_inr', 'billed_to_estimate_ratio', 'historical_sla_hours', 'historical_sla_met', 'reopened_within_30d', 'review_flags', 'amount_under_review_inr', 'cases', 'source_refs', 'reporting_period', 'data_origin'];
  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n');
  return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="wardproof-public-spending.csv"' } });
}
