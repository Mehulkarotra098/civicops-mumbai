// Claude-assisted evidence review. Server-side only; configured with environment variables.
//   ANTHROPIC_API_KEY        required for live assessments
//   CLAUDE_VISION_MODEL      default claude-opus-5-5
//   CLAUDE_VISION_EFFORT     default medium (low | medium | high | xhigh | max)
//   VISION_PROVIDER=stub     test-only deterministic provider, labelled "stub" everywhere it appears
// Claude only advises. The super admin records the decision; manual review always works.
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { z } from 'zod';
import { HttpError, withUser, type Actor, type Db } from './db.ts';
import { addEvent, getTicketRow } from './tickets.ts';
import { readEvidenceForModel } from './evidence.ts';
import { CATEGORY_BY_CODE } from './config.ts';

export const AssessmentSchema = z.object({
  same_place: z.enum(['yes', 'no', 'unclear']),
  same_issue: z.enum(['yes', 'no', 'unclear']),
  visible_changes: z.array(z.string()),
  verdict: z.enum(['repaired', 'partly_repaired', 'mismatched', 'unclear']),
  supporting_details: z.array(z.string()),
  cannot_verify: z.array(z.string()),
  confidence: z.enum(['low', 'medium', 'high']),
  summary: z.string(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['same_place', 'same_issue', 'visible_changes', 'verdict', 'supporting_details', 'cannot_verify', 'confidence', 'summary'],
  properties: {
    same_place: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'Do the before and after images appear to show the same place?' },
    same_issue: { type: 'string', enum: ['yes', 'no', 'unclear'], description: 'Do they show the reported issue (category) at that place?' },
    visible_changes: { type: 'array', items: { type: 'string' }, description: 'Concrete visible differences between before and after.' },
    verdict: { type: 'string', enum: ['repaired', 'partly_repaired', 'mismatched', 'unclear'] },
    supporting_details: { type: 'array', items: { type: 'string' }, description: 'Specific visual details that support the verdict.' },
    cannot_verify: { type: 'array', items: { type: 'string' }, description: 'What the photos cannot establish (e.g. durability, underground work, exact time).' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string', description: 'Two sentences for the reviewer.' },
  },
};

export function visionProvider(): 'claude' | 'stub' | 'unavailable' {
  if (process.env.VISION_PROVIDER === 'stub') return 'stub';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'claude';
  return 'unavailable';
}

interface Img { id: string; phase: string; storage_key: string; origin: string; note: string | null; sha256: string; duplicate_of_evidence: string | null }

export async function assessEvidence(db: Db, actor: Actor, ticketId: string) {
  if (actor.role !== 'super_admin') throw new HttpError(403, 'forbidden', 'Only a super admin can request an assessment');
  const { t, imgs, notes } = await withUser(actor, async (q) => {
    const t = await getTicketRow(q, ticketId);
    if (t.status !== 'awaiting_verification') throw new HttpError(409, 'bad_state', 'Assessments run on tickets awaiting verification');
    const imgs = (await q.query<Img>(`select id, phase, storage_key, origin, note, sha256, duplicate_of_evidence from evidence where ticket_id = $1 order by created_at`, [t.id])).rows;
    const notes = (await q.query<{ type: string; note: string | null }>(`select type, note from ticket_events where ticket_id = $1 and type in ('first_action','work_started','progress_update','submitted_for_review','access_restored','supply_restored') order by at`, [t.id])).rows;
    return { t, imgs, notes };
  }, db);
  const before = imgs.filter((i) => i.phase === 'report' || i.phase === 'before').slice(-3);
  const after = imgs.filter((i) => i.phase === 'after').slice(-3);
  const provider = visionProvider();
  const started = Date.now();
  let status: 'completed' | 'unavailable' | 'error' = 'completed';
  let result: Assessment | null = null;
  let model: string | null = null;
  let error: string | null = null;

  if (!after.length) {
    status = 'unavailable'; error = 'No "after" photo to assess. Review manually or request evidence.';
  } else if (!before.length) {
    status = 'unavailable'; error = 'No "before" photo (the resident may have reported without one for safety). Review the after photo manually.';
  } else if (provider === 'unavailable') {
    status = 'unavailable'; error = 'Claude is not configured (ANTHROPIC_API_KEY is not set). Use the manual review checklist.';
  } else if (provider === 'stub') {
    model = 'stub-provider (test only)';
    // Deterministic stand-in for tests: compares 16x16 greyscale thumbnails. Not an AI judgement.
    const sig = async (k: string) => sharp(await readEvidenceForModel(k)).resize(16, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
    const b = await sig(before[before.length - 1].storage_key);
    const a = await sig(after[after.length - 1].storage_key);
    let diff = 0; for (let i = 0; i < b.length; i++) diff += Math.abs(b[i] - a[i]);
    const mismatch = after.some((x) => x.duplicate_of_evidence) || diff / b.length > 40;
    result = stubAssessment(t.category_code, mismatch);
  } else {
    try {
      const client = new Anthropic();
      const cat = CATEGORY_BY_CODE[t.category_code];
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const [label, group] of [['BEFORE (resident report or officer before-photo)', before], ['AFTER (officer completion photo)', after]] as const) {
        content.push({ type: 'text', text: label });
        for (const img of group) {
          const data = (await readEvidenceForModel(img.storage_key)).toString('base64');
          content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
          if (img.origin === 'illustration') content.push({ type: 'text', text: '(This image is a labelled illustration used in a demo, not a real photo.)' });
        }
      }
      content.push({ type: 'text', text: [
        `Category: ${cat?.label ?? t.category_code}. Resident description: "${t.description}".`,
        `Closure check for this category: ${cat?.closureCheck ?? ''}`,
        `Officer notes: ${notes.map((n) => `${n.type}: ${n.note ?? ''}`).join(' | ') || 'none'}.`,
        'Compare BEFORE and AFTER. Report only what is visible. Say what cannot be verified from photos. Do not decide closure; a human reviewer decides.',
      ].join('\n') });
      const res = await client.beta.messages.create({
        model: process.env.CLAUDE_VISION_MODEL || 'claude-opus-5-5',
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: (process.env.CLAUDE_VISION_EFFORT as 'medium') || 'medium', format: { type: 'json_schema', schema: JSON_SCHEMA } },
        system: 'You assist a municipal reviewer checking repair evidence for a civic complaint in Mumbai. Be precise and conservative: if the place or the repair cannot be confirmed from the images, say so.',
        messages: [{ role: 'user', content }],
      });
      model = res.model;
      if (res.stop_reason === 'refusal') { status = 'error'; error = 'Claude declined to assess these images. Review manually.'; }
      else {
        const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '';
        const parsed = AssessmentSchema.safeParse(JSON.parse(text));
        if (parsed.success) result = parsed.data; else { status = 'error'; error = 'Claude returned an unexpected format. Review manually.'; }
      }
    } catch (e) {
      status = 'error';
      error = e instanceof Anthropic.AuthenticationError ? 'Claude rejected the API key. Review manually.'
        : e instanceof Anthropic.RateLimitError ? 'Claude is rate-limited right now. Review manually or retry later.'
        : e instanceof Anthropic.APIConnectionError ? 'Could not reach Claude (network). Review manually or retry later.'
        : e instanceof Anthropic.APIError ? `Claude error ${e.status}. Review manually.` : 'Assessment failed. Review manually.';
    }
  }

  const latency = Date.now() - started;
  return withUser(actor, async (q) => {
    const r = await q.query<{ id: string }>(
      `insert into evidence_assessments (ticket_id, requested_by, provider, model, status, result, error, evidence_ids, latency_ms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [t.id, actor.id, provider, model, status, result ? JSON.stringify(result) : null, error, [...before, ...after].map((i) => i.id), latency]);
    await addEvent(q, t.id, actor, new Date(), {
      type: 'assessment_recorded', visibility: 'staff',
      note: status === 'completed' ? `${provider === 'stub' ? 'Stub' : 'Claude'} assessment: ${result?.verdict.replace('_', ' ')} (${result?.confidence} confidence). Advisory only.` : `Assessment not available: ${error}`,
      data: { assessment_id: r.rows[0].id, provider, model, status },
    });
    return { id: r.rows[0].id, status, provider, model, result, error };
  }, db);
}

function stubAssessment(category: string, mismatch: boolean): Assessment {
  return mismatch
    ? { same_place: 'no', same_issue: 'unclear', visible_changes: ['The after image shows a different scene from the before image'], verdict: 'mismatched', supporting_details: ['Street, buildings and signboard from the before image are absent in the after image'], cannot_verify: ['Whether any work happened at the reported location'], confidence: 'medium', summary: `Stub provider (tests): the ${category} after-photo does not match the reported place. Request matching evidence.` }
    : { same_place: 'yes', same_issue: 'yes', visible_changes: ['The reported problem is no longer visible at the same spot'], verdict: 'repaired', supporting_details: ['Same buildings and signboard appear in both images'], cannot_verify: ['How long the repair will last'], confidence: 'medium', summary: `Stub provider (tests): the ${category} issue appears resolved at the same place.` };
}
