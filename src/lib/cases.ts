// WardProof accountability cases: every flagged expense or resident question becomes a public case.
// Flag raised → assigned to responsible office → written response due → independent review → follow-up or closure.
import { HttpError, withSystem, withUser, type Actor, type Db, type Queryable } from './db.ts';
import { loadHistory, type Flag, type Enriched } from './history.ts';
import { formatIST, ymdIST } from './time.ts';

export const REVIEWER_OFFICE = 'Independent Audit Cell (Chief Auditor, outside the ward)';
const WORK_DEPT: Record<string, string> = {
  Pothole: 'RDS', 'Road cave-in': 'RDS', 'Broken paver blocks': 'RDS', Waterlogging: 'SWD', 'Choked drain / nullah overflow': 'SWD', 'Open or broken manhole': 'SEW',
};
const DEPT_LABEL: Record<string, string> = { RDS: 'Roads', SWD: 'Storm Water Drains', SEW: 'Sewerage Operations' };

export function responsibleFor(wo: Pick<Enriched, 'ward_code' | 'work_type'>) {
  const dept = WORK_DEPT[wo.work_type] ?? 'RDS';
  return {
    department_code: dept,
    responsible_office: `Ward ${wo.ward_code} Office · ${DEPT_LABEL[dept]}`,
    responsible_role: `Assistant Engineer (Maintenance), ${DEPT_LABEL[dept]}, Ward ${wo.ward_code}`,
  };
}

export const FLAG_QUESTION: Record<string, string> = {
  over_rate: 'Why was this job billed well above the rate-card estimate, with no approved cost revision on record?',
  double_billing: 'Was the same work on the same road billed twice?',
  dlp_paid: 'Why did the ward pay for a repair on a road still under its defect liability period?',
  over_budget: 'Which approval allowed spending after the ward budget was used up?',
};

export const QUESTION_TYPES: Record<string, string> = {
  cost_increase: 'Why did the cost increase?',
  missing_proof: 'Please publish the missing proof of work',
  reopened: 'Why did the repair reopen?',
  other: 'Other question about this expense',
};

/** Remove phone numbers and email addresses before a question is published. */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]')
    .replace(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone removed]')
    .replace(/\b\d{10,}\b/g, '[number removed]');
}

export async function caseSettings(q: Queryable) {
  return (await q.query<{ response_minutes: number; corrective_days: number }>('select response_minutes, corrective_days from case_settings where id = 1')).rows[0];
}

async function nextRef(q: Queryable, now: Date) {
  const n = (await q.query<{ n: string }>(`select nextval('case_seq')::text as n`)).rows[0].n;
  return `AQ-${ymdIST(now)}-${n.padStart(4, '0')}`;
}

export async function addCaseEvent(q: Queryable, caseId: string, actor: Actor | null, office: string | null, at: Date, type: string, note: string | null, data: Record<string, unknown> = {}, dedupe?: string) {
  const r = await q.query(
    `insert into case_events (case_id, at, actor_id, actor_role, actor_office, type, note, data, dedupe_key) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dedupe_key) do nothing`,
    [caseId, at, actor?.id ?? null, actor ? actor.role : 'system', office, type, note, JSON.stringify(data), dedupe ?? null]);
  return r.affectedRows > 0;
}

function calculationFor(f: Flag, wo: Enriched) {
  const e = f.evidence as Record<string, number | string | null>;
  switch (f.type) {
    case 'over_rate':
      return { formula: wo.unit === 'per sqm' ? `${wo.area_sqm} m² × ₹${wo.rate} = ₹${Math.round(wo.expected_cost)}` : `₹${wo.rate} per job`, baseline: 'rate_card.csv standard rate', billed: wo.cost_inr, reference: Math.round(wo.expected_cost), difference: Math.round(wo.cost_inr - wo.expected_cost), pct_above: Math.round((wo.cost_ratio - 1) * 1000) / 10, threshold: '1.35× (normal jobs stay within 1.3×)', approval_record: 'Unavailable' };
    case 'over_budget':
      return { formula: `cumulative ward spend ₹${Math.round(Number(e.spend_after))} − budget ₹${Math.round(Number(e.budget))}`, baseline: 'wards.csv monsoon_repair_budget_inr_2025 (original; no revisions on record)', billed: wo.cost_inr, over: e.over };
    case 'double_billing':
      return { formula: `same road + same work type within 10 days, no complaint linked`, baseline: `twin ${e.twin} (₹${Math.round(Number(e.twin_cost))})`, billed: wo.cost_inr, gap_days: Math.round(Number(e.gap_days) * 10) / 10 };
    case 'dlp_paid':
      return { formula: 'road under DLP after last resurfacing → contractor repairs free', baseline: 'roads.csv under_dlp = Y', billed: wo.cost_inr };
    default:
      return { billed: wo.cost_inr };
  }
}

/** One case per money flag (idempotent). Runs after each import. */
export async function openFlagCases(db: Db, now: Date) {
  return withSystem(async (q) => {
    const h = await loadHistory(q);
    const settings = await caseSettings(q);
    const existing = new Set((await q.query<{ k: string }>(`select work_order_id || '|' || flag_type as k from accountability_cases where kind = 'flag'`)).rows.map((r) => r.k));
    let created = 0;
    for (const f of h.flags.filter((x) => ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'].includes(x.type))) {
      if (existing.has(`${f.work_order_id}|${f.type}`)) continue;
      const wo = h.wos.find((w) => w.work_order_id === f.work_order_id)!;
      const resp = responsibleFor(wo);
      const ref = await nextRef(q, now);
      const r = await q.query<{ id: string }>(
        `insert into accountability_cases (ref, kind, flag_type, work_order_id, ward_code, department_code, responsible_office, responsible_role, reviewer_office,
           amount_under_review, calculation, public_question, response_due_at, created_at)
         values ($1,'flag',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
        [ref, f.type, f.work_order_id, f.ward_code, resp.department_code, resp.responsible_office, resp.responsible_role, REVIEWER_OFFICE,
          f.amount_at_issue, JSON.stringify({ ...calculationFor(f, wo), reason: f.reason }), FLAG_QUESTION[f.type], new Date(now.getTime() + settings.response_minutes * 60_000), now]);
      await addCaseEvent(q, r.rows[0].id, null, 'CivicOps audit', now, 'flag_raised', f.reason, { flag_type: f.type });
      await addCaseEvent(q, r.rows[0].id, null, 'CivicOps audit', now, 'assigned', `Assigned to ${resp.responsible_office}; written response due ${formatIST(new Date(now.getTime() + settings.response_minutes * 60_000))}`);
      created++;
    }
    return created;
  }, db);
}

/** Public question from a resident (sign-in optional). Personal details stay private. */
export async function askQuestion(db: Db, input: { workOrderId: string; type: string; text: string; name?: string; contact?: string; userId?: string | null }, now: Date) {
  const text = (input.text ?? '').trim();
  if (text.length < 10) throw new HttpError(400, 'too_short', 'Write your question in at least a sentence');
  if (text.length > 2000) throw new HttpError(400, 'too_long', 'Keep the question under 2000 characters');
  if (!QUESTION_TYPES[input.type]) throw new HttpError(400, 'bad_type', 'Choose what you are asking about');
  return withSystem(async (q) => {
    const h = await loadHistory(q);
    const wo = h.wos.find((w) => w.work_order_id === input.workOrderId);
    if (!wo) throw new HttpError(404, 'not_found', 'Work order not found');
    const settings = await caseSettings(q);
    const resp = responsibleFor(wo);
    const ref = await nextRef(q, now);
    const due = new Date(now.getTime() + settings.response_minutes * 60_000);
    const flags = h.flags.filter((f) => f.work_order_id === wo.work_order_id && ['over_rate', 'double_billing', 'dlp_paid', 'over_budget'].includes(f.type));
    const amount = flags.reduce((s, f) => s + f.amount_at_issue, 0) || null;
    const r = await q.query<{ id: string }>(
      `insert into accountability_cases (ref, kind, question_type, work_order_id, ward_code, department_code, responsible_office, responsible_role, reviewer_office,
         amount_under_review, calculation, public_question, response_due_at, created_at)
       values ($1,'question',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
      [ref, input.type, wo.work_order_id, wo.ward_code, resp.department_code, resp.responsible_office, resp.responsible_role, REVIEWER_OFFICE,
        amount, JSON.stringify(flags[0] ? calculationFor(flags[0], wo) : { billed: wo.cost_inr }), `${QUESTION_TYPES[input.type]}: ${redact(text)}`, due, now]);
    await q.query('insert into case_private (case_id, asker_user_id, asker_name, asker_contact, original_question) values ($1,$2,$3,$4,$5)',
      [r.rows[0].id, input.userId ?? null, input.name?.trim() || null, input.contact?.trim() || null, text]);
    await addCaseEvent(q, r.rows[0].id, null, 'Resident (identity private)', now, 'question_asked', redact(text), { question_type: input.type });
    await addCaseEvent(q, r.rows[0].id, null, 'CivicOps', now, 'assigned', `Assigned to ${resp.responsible_office}; written response due ${formatIST(due)}`);
    await notifyUsers(q, await wardStaff(q, wo.ward_code), r.rows[0].id, 'case_assigned', `${ref}: resident question on ${wo.work_order_id}, response due ${formatIST(due)}`, `${r.rows[0].id}:assigned`, now);
    return { id: r.rows[0].id, ref, due, office: resp.responsible_office };
  }, db);
}

async function wardStaff(q: Queryable, ward: string) {
  return (await q.query<{ user_id: string }>(`select distinct user_id from memberships where ward_code = $1`, [ward])).rows.map((r) => r.user_id);
}
async function oversight(q: Queryable) {
  return (await q.query<{ id: string }>(`select id from users where role in ('auditor','super_admin')`)).rows.map((r) => r.id);
}
async function notifyUsers(q: Queryable, users: string[], caseId: string, kind: string, title: string, key: string, at: Date) {
  for (const u of [...new Set(users)]) await q.query('select enqueue_notification($1,null,$2,$3,null,$4,$5)', [u, kind, title, `case:${key}:${u}`, at]);
  void caseId;
}

interface CaseRow { id: string; ref: string; ward_code: string; status: string; response_due_at: Date; escalated_at: Date | null; work_order_id: string; responsible_office: string; amount_under_review: number | null; calculation: Record<string, unknown>; decision: string | null; corrective_owner: string | null }

async function getCase(q: Queryable, idOrRef: string) {
  const r = await q.query<CaseRow>(`select * from accountability_cases where ${/^[0-9a-f-]{36}$/i.test(idOrRef) ? 'id' : 'ref'} = $1`, [idOrRef]);
  if (!r.rows[0]) throw new HttpError(404, 'not_found', 'Case not found');
  return r.rows[0];
}

/** Written response from the responsible ward office. A reply never closes the case: it waits for independent review. */
export async function respond(db: Db, actor: Actor, caseId: string, input: { body: string; evidence?: { kind: string; reference: string; note?: string }[] }, now: Date) {
  if (!['officer', 'ward_admin'].includes(actor.role)) throw new HttpError(403, 'forbidden', 'Only the responsible ward office can respond');
  const body = (input.body ?? '').trim();
  if (body.length < 20) throw new HttpError(400, 'too_short', 'Explain the variance in a few sentences');
  return withUser(actor, async (q) => {
    const c = await getCase(q, caseId);
    const member = await q.query('select 1 from memberships where user_id = $1 and ward_code = $2', [actor.id, c.ward_code]);
    if (!member.rows.length) throw new HttpError(403, 'forbidden', `Only Ward ${c.ward_code} staff can respond to this case`);
    if (!['awaiting_response', 'needs_evidence', 'correction_required', 'awaiting_review'].includes(c.status)) throw new HttpError(409, 'closed', 'This case is already decided');
    const v = (await q.query<{ v: number }>('select coalesce(max(version),0)::int + 1 as v from case_responses where case_id = $1', [c.id])).rows[0].v;
    const evidence = (input.evidence ?? []).filter((e) => e.reference?.trim()).map((e) => ({ kind: e.kind, reference: e.reference.trim(), note: e.note?.trim() || null }));
    await q.query('insert into case_responses (case_id, version, body, evidence, responder_id, responder_office, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [c.id, v, body, JSON.stringify(evidence), actor.id, c.responsible_office, now]);
    const late = now > c.response_due_at;
    await q.query(`update accountability_cases set status = 'awaiting_review' where id = $1`, [c.id]);
    await addCaseEvent(q, c.id, actor, c.responsible_office, now, 'response_submitted', `Written response v${v}${late ? ' (after the deadline)' : ''} with ${evidence.length} supporting record(s). Awaiting independent review.`, { version: v, late });
    await notifyUsers(q, await oversight(q), c.id, 'case_response', `${c.ref}: response v${v} ready for independent review`, `${c.id}:resp${v}`, now);
    return { version: v };
  }, db);
}

export type Decision = 'justified' | 'correction_required' | 'referred' | 'needs_evidence';

/** Independent decision: the reviewer must not belong to the ward office responsible for the expense. */
export async function decide(db: Db, actor: Actor, caseId: string, input: { decision: Decision; reason: string; correctedAmount?: number | null; correctiveAction?: string; correctiveOwner?: string; correctiveDueDays?: number }, now: Date) {
  if (!['auditor', 'super_admin'].includes(actor.role)) throw new HttpError(403, 'forbidden', 'Only an independent reviewer can decide');
  const reason = (input.reason ?? '').trim();
  if (reason.length < 10) throw new HttpError(400, 'reason_required', 'Record the reason for the decision');
  return withUser(actor, async (q) => {
    const c = await getCase(q, caseId);
    const own = await q.query('select 1 from memberships where user_id = $1 and ward_code = $2', [actor.id, c.ward_code]);
    if (own.rows.length) throw new HttpError(403, 'not_independent', 'You belong to the responsible ward, so you cannot review this case');
    if (c.status === 'awaiting_response' && input.decision !== 'referred') throw new HttpError(409, 'no_response', 'Wait for the written response, or refer the case for further review');
    if (['justified', 'corrected', 'closed'].includes(c.status)) throw new HttpError(409, 'closed', 'This case is already closed');
    const settings = await caseSettings(q);
    const status = input.decision === 'justified' ? 'justified' : input.decision === 'referred' ? 'referred' : input.decision;
    const billed = Number((c.calculation as { billed?: number }).billed ?? 0);
    let prev = null, corrected = null, owner = null, due = null, action = null;
    if (input.decision === 'correction_required') {
      if (input.correctedAmount == null || !(input.correctedAmount >= 0)) throw new HttpError(400, 'amount_required', 'Enter the corrected amount');
      prev = { billed };
      corrected = { billed: Math.round(input.correctedAmount), recovery: Math.round(billed - input.correctedAmount) };
      owner = input.correctiveOwner?.trim() || c.responsible_office;
      action = input.correctiveAction?.trim() || `Issue a corrected bill of ₹${Math.round(input.correctedAmount).toLocaleString('en-IN')} and recover ₹${Math.round(billed - input.correctedAmount).toLocaleString('en-IN')}`;
      due = new Date(now.getTime() + (input.correctiveDueDays ?? settings.corrective_days) * 86400_000);
    }
    await q.query(`update accountability_cases set status = $2, decision = $3, decision_reason = $4, decided_by = $5, decided_at = $6,
        previous_values = coalesce($7, previous_values), corrected_values = coalesce($8, corrected_values), corrective_action = coalesce($9, corrective_action),
        corrective_owner = coalesce($10, corrective_owner), corrective_due_at = coalesce($11, corrective_due_at) where id = $1`,
      [c.id, status, input.decision, reason, actor.id, now, prev ? JSON.stringify(prev) : null, corrected ? JSON.stringify(corrected) : null, action, owner, due]);
    await addCaseEvent(q, c.id, actor, REVIEWER_OFFICE, now, `decision_${input.decision}`, reason, { previous: prev, corrected, corrective_owner: owner, corrective_due_at: due });
    if (input.decision === 'needs_evidence') {
      await q.query('update accountability_cases set response_due_at = $2 where id = $1', [c.id, new Date(now.getTime() + settings.response_minutes * 60_000)]);
    }
    await notifyUsers(q, await wardStaff(q, c.ward_code), c.id, 'case_decision', `${c.ref}: independent review: ${input.decision.replace('_', ' ')}`, `${c.id}:dec:${now.getTime()}`, now);
    return { status };
  }, db);
}

/** The corrective owner reports completion; the reviewer's acceptance closes the case as corrected. */
export async function completeCorrection(db: Db, actor: Actor, caseId: string, note: string, now: Date) {
  return withUser(actor, async (q) => {
    const c = await getCase(q, caseId);
    if (c.status !== 'correction_required') throw new HttpError(409, 'bad_state', 'No open correction on this case');
    if (['officer', 'ward_admin'].includes(actor.role)) {
      const member = await q.query('select 1 from memberships where user_id = $1 and ward_code = $2', [actor.id, c.ward_code]);
      if (!member.rows.length) throw new HttpError(403, 'forbidden', 'Not your ward');
      await addCaseEvent(q, c.id, actor, c.responsible_office, now, 'correction_reported', note || 'Corrected bill issued');
      await q.query(`update accountability_cases set corrective_completed_at = $2 where id = $1`, [c.id, now]);
      return { status: 'correction_required' };
    }
    if (!['auditor', 'super_admin'].includes(actor.role)) throw new HttpError(403, 'forbidden', 'Not allowed');
    await q.query(`update accountability_cases set status = 'corrected', corrective_completed_at = coalesce(corrective_completed_at, $2) where id = $1`, [c.id, now]);
    await addCaseEvent(q, c.id, actor, REVIEWER_OFFICE, now, 'closed_corrected', note || 'Correction verified; case closed');
    return { status: 'corrected' };
  }, db);
}

/** Overdue sweep: one escalation to the oversight queue per case and deadline. Safe to retry. */
export async function runCaseSweep(db: Db, now: Date) {
  return withSystem(async (q) => {
    const due = (await q.query<CaseRow>(`select * from accountability_cases where status in ('awaiting_response','needs_evidence') and response_due_at <= $1`, [now])).rows;
    const fired: string[] = [];
    for (const c of due) {
      const key = `${c.id}:overdue:${c.response_due_at.toISOString()}`;
      const ok = await addCaseEvent(q, c.id, null, 'CivicOps', now, 'escalated_overdue', `No written response by ${formatIST(c.response_due_at)}. Sent to the oversight queue.`, {}, key);
      if (!ok) continue;
      await q.query('update accountability_cases set escalated_at = coalesce(escalated_at, $2) where id = $1', [c.id, now]);
      await notifyUsers(q, await oversight(q), c.id, 'case_overdue', `${c.ref}: response overdue from ${c.responsible_office}`, key, now);
      fired.push(c.ref);
    }
    return fired;
  }, db);
}

export async function setResponseWindow(db: Db, actor: Actor, minutes: number, now: Date) {
  if (!['auditor', 'super_admin'].includes(actor.role)) throw new HttpError(403, 'forbidden', 'Only oversight can change deadlines');
  if (!(minutes >= 1 && minutes <= 60 * 24 * 60)) throw new HttpError(400, 'bad_minutes', 'Choose between 1 minute and 60 days');
  await withUser(actor, (q) => q.query('update case_settings set response_minutes = $1, updated_by = $2, updated_at = $3 where id = 1', [minutes, actor.id, now]), db);
}

export const STATUS_PUBLIC: Record<string, string> = {
  awaiting_response: 'Waiting for the ward office to respond', awaiting_review: 'Response received: awaiting independent review',
  needs_evidence: 'Reviewer asked for more evidence', correction_required: 'Correction required', justified: 'Explanation accepted (justified)',
  corrected: 'Corrected and closed', referred: 'Referred for further review', closed: 'Closed',
};

/** Walkthrough examples, clearly labelled as demo examples (not real responses or audit outcomes). */
export async function seedCaseExamples(db: Db, who: { office: Actor; auditor: Actor }, now: Date) {
  const done = await withSystem((q) => q.query<{ n: number }>('select count(*)::int as n from accountability_cases where is_demo_example'), db);
  if (done.rows[0].n > 0) return;
  const H = 3600_000;
  const pick = async (type: string, ward: string | null, not: string[] = []) => (await withSystem((q) => q.query<{ id: string }>(
    `select id from accountability_cases where kind = 'flag' and flag_type = $1 and ($2::text is null or ward_code = $2) and work_order_id <> all($3) order by amount_under_review desc nulls last limit 1`, [type, ward, not]), db)).rows[0]?.id;
  const mark = (id: string) => withSystem((q) => q.query('update accountability_cases set is_demo_example = true where id = $1', [id]), db);
  // a. Rate-card variance → correction required → corrected.
  const a = await pick('over_rate', 'K/W', ['WO25-01590']);
  if (a) {
    await mark(a);
    await respond(db, who.office, a, { body: 'The work was done at night under a traffic police NOC and included extra milling of the damaged edges, which the contractor billed as a premium. [Demo example]', evidence: [{ kind: 'Traffic NOC', reference: 'NOC/KW/2025/118 (demo)' }, { kind: 'Measurement book', reference: 'MB-KW-22, p.14 (demo)' }] }, new Date(now.getTime() - 50 * H));
    const c = (await withSystem((q) => q.query<{ calculation: { reference: number } }>('select calculation from accountability_cases where id = $1', [a]), db)).rows[0];
    await decide(db, who.auditor, a, { decision: 'correction_required', reason: 'The NOC explains night work but no approved rate revision exists for a premium. Pay up to 1.3× the rate-card estimate (top of the normal band) and recover the rest. [Demo example]', correctedAmount: Math.round(c.calculation.reference * 1.3), correctiveDueDays: 14 }, new Date(now.getTime() - 40 * H));
    await completeCorrection(db, who.office, a, 'Corrected bill issued and the excess deducted from the next running bill. [Demo example]', new Date(now.getTime() - 20 * H));
    await completeCorrection(db, who.auditor, a, 'Corrected bill seen in the payment register; case closed. [Demo example]', new Date(now.getTime() - 10 * H));
  }
  // b. Possible double bill → needs evidence → second response → justified.
  const b = await pick('double_billing', 'K/W');
  if (b) {
    await mark(b);
    await respond(db, who.office, b, { body: 'These were two different stretches of the same road segment, attended on separate days. [Demo example]' }, new Date(now.getTime() - 70 * H));
    await decide(db, who.auditor, b, { decision: 'needs_evidence', reason: 'Please attach the measurement sheets showing the two stretches. [Demo example]' }, new Date(now.getTime() - 60 * H));
    await respond(db, who.office, b, { body: 'Attached measurement sheets and geo-tagged site photos for both stretches; chainages differ by 180 m. [Demo example]', evidence: [{ kind: 'Measurement sheet', reference: 'MS-0611-A and MS-0611-B (demo)' }, { kind: 'Inspection record', reference: 'Site inspection 12 Jun 2025 (demo)' }] }, new Date(now.getTime() - 30 * H));
    await decide(db, who.auditor, b, { decision: 'justified', reason: 'Measurements show two separate stretches with different chainages; not a duplicate. [Demo example]' }, new Date(now.getTime() - 25 * H));
  }
  // c. Spending after the budget ran out → no response → overdue and escalated.
  const c = await pick('over_budget', 'E');
  if (c) {
    await mark(c);
    await withSystem((q) => q.query('update accountability_cases set response_due_at = $2 where id = $1', [c, new Date(now.getTime() - 26 * H)]), db);
  }
}
