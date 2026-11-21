// ONE source for every public headline figure. The home page, /live, /spending, the CSV and the README
// all read these, so the same number never differs between pages.
import { BUDGET_PERIOD, MONEY_FLAGS, moneyTrail, type Flag } from './history.ts';
import type { Queryable } from './db.ts';

type Hist = Parameters<typeof moneyTrail>[0];

/** Questioned money, counted once per work order: the largest single money flag on that bill.
 *  Flags overlap (an over-rate bill can also be over budget), so adding them would count rupees twice. */
export function questionedByWorkOrder(flags: Flag[]) {
  const per = new Map<string, Flag>();
  for (const f of flags) {
    if (!MONEY_FLAGS.includes(f.type)) continue;
    const cur = per.get(f.work_order_id);
    if (!cur || f.amount_at_issue > cur.amount_at_issue) per.set(f.work_order_id, f);
  }
  const rows = [...per.values()];
  const rawSum = flags.filter((f) => MONEY_FLAGS.includes(f.type)).reduce((s, f) => s + f.amount_at_issue, 0);
  return { total: rows.reduce((s, f) => s + f.amount_at_issue, 0), workOrders: rows.length, rawSum, flags: flags.filter((f) => MONEY_FLAGS.includes(f.type)).length, perWorkOrder: per };
}

export interface PublicFigures {
  period: string;
  budget: number;
  billed: number;               // in the budget period
  workOrders: number;           // in the budget period
  billedOutsidePeriod: number;
  workOrdersOutsidePeriod: number;
  wardsOverBudget: number;
  questioned: number;           // deduplicated per work order (all periods: a question is a question)
  questionedWorkOrders: number;
  questionedRawSum: number;     // naive sum of overlapping flags, shown only with an explanation
  moneyFlags: number;
  complaints: number;
  cases: number; casesOpen: number; casesOverdue: number; casesDecided: number;
  wards: number;
}

export async function publicFigures(q: Queryable, h: Hist): Promise<PublicFigures> {
  const trail = moneyTrail(h);
  const qd = questionedByWorkOrder(h.flags);
  const c = (await q.query<{ total: number; open: number; overdue: number; decided: number; complaints: number }>(`
    select count(*)::int as total,
      count(*) filter (where status not in ('justified','corrected','closed'))::int as open,
      count(*) filter (where status in ('awaiting_response','needs_evidence') and (response_due_at < now() or escalated_at is not null))::int as overdue,
      count(*) filter (where decision is not null)::int as decided,
      (select count(*)::int from hist_complaints) as complaints
    from accountability_cases`)).rows[0];
  return {
    period: BUDGET_PERIOD.label,
    budget: trail.reduce((s, w) => s + w.budget_inr_2025, 0),
    billed: trail.reduce((s, w) => s + w.spend, 0),
    workOrders: trail.reduce((s, w) => s + w.jobs, 0),
    billedOutsidePeriod: trail.reduce((s, w) => s + w.spend_outside_period, 0),
    workOrdersOutsidePeriod: trail.reduce((s, w) => s + w.jobs_outside_period, 0),
    wardsOverBudget: trail.filter((w) => (w.utilisation ?? 0) > 1).length,
    questioned: qd.total, questionedWorkOrders: qd.workOrders, questionedRawSum: qd.rawSum, moneyFlags: qd.flags,
    complaints: c.complaints, cases: c.total, casesOpen: c.open, casesOverdue: c.overdue, casesDecided: c.decided,
    wards: trail.length,
  };
}
