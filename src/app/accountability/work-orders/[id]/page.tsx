import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { NORMAL_BAND_MAX, OVER_RATE_THRESHOLD, loadHistory, traceWorkOrder } from '@/lib/history';
import { formatIST, formatDateIST, inr } from '@/lib/time';
import { OriginBadge, PageHeader, SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';

export default async function WorkOrderTrace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tr = await withSystem(async (q) => traceWorkOrder(q, await loadHistory(q), decodeURIComponent(id)), await getDb());
  if (!tr) notFound();
  const { wo, complaints, sameRoad, flags, contractor, rain } = tr;
  const road = wo.road;
  const hours = wo.hours_first_complaint_to_completion;
  const verdict = wo.cost_ratio > OVER_RATE_THRESHOLD ? 'crit' : wo.cost_ratio > NORMAL_BAND_MAX ? 'med' : 'ok';
  const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <li className="relative pl-12">
      <span className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-white">{n}</span>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </li>
  );
  return (
    <div className="space-y-5">
      <PageHeader kicker="Money trail · one job end to end" title={`${wo.work_order_id} · ${road?.road_name ?? wo.road_id}${road ? ` (segment ${road.segment_no})` : ''}, Ward ${wo.ward_code}`}
        actions={<OriginBadge origin="synthetic_repo" />}>
        Complaint → work order → rate card → SLA → durability. Every value below is read from the imported repo files; check them against <code>work_orders.csv</code>, <code>complaints.csv</code>, <code>rate_card.csv</code> and <code>roads.csv</code>.
      </PageHeader>
      <SyntheticNote />
      <ol className="card space-y-8 p-6">
        <Step n={1} title={`Citizen complaint${complaints.length > 1 ? 's' : ''} (${complaints.length})`}>
          {complaints.length ? complaints.map((c) => {
            const r = c as Record<string, string | number | Date | null>;
            return (
              <div key={String(r.complaint_id)} className="mb-2 rounded-lg border border-line p-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs text-muted"><b className="font-mono text-ink">{String(r.complaint_id)}</b><span>{formatIST(r.received_at as Date)}</span><span>{String(r.channel)}</span><span>{String(r.category_reported)}</span><span>{String(r.locality_text)} · Ward {String(r.ward_code ?? '—')}</span><span>status: {String(r.status)}</span><span>{String(r.upvotes)} upvotes</span></div>
                <p className="mt-1">“{String(r.description)}” <span className="text-xs text-muted">({String(r.language)})</span></p>
                {r.photo_description ? <p className="mt-1 text-xs text-muted">Photo (described in the dataset): {String(r.photo_description)}</p> : null}
              </div>
            );
          }) : <p className="text-sm text-crit">No complaint is linked to this work order.</p>}
        </Step>
        <Step n={2} title="Work order">
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="kicker">Work type</dt><dd>{wo.work_type}</dd></div>
            <div><dt className="kicker">Method</dt><dd>{wo.repair_method}</dd></div>
            <div><dt className="kicker">Contractor</dt><dd><Link className="underline" href={`/accountability/contractors/${wo.contractor_id}`}>{wo.contractor_name}</Link> ({wo.contractor_id}{contractor ? `, empanelled ${(contractor as { empanelled_since: number }).empanelled_since}` : ''})</dd></div>
            <div><dt className="kicker">Assigned</dt><dd>{formatIST(wo.assigned_at)}</dd></div>
            <div><dt className="kicker">Work started</dt><dd>{formatIST(wo.work_started_at)}</dd></div>
            <div><dt className="kicker">Completed</dt><dd>{formatIST(wo.completed_at)}</dd></div>
            <div><dt className="kicker">Area repaired</dt><dd>{wo.area_sqm} m²</dd></div>
            <div><dt className="kicker">Engineer remark</dt><dd>{wo.engineer_remark ?? '—'}</dd></div>
            <div><dt className="kicker">Road</dt><dd>{road ? <Link className="underline" href={`/accountability/roads/${road.road_id}`}>{road.road_id}</Link> : wo.road_id} · {road?.road_type} · {road?.surface} · {road?.lanes} lanes{road?.bus_route ? ' · bus route' : ''}</dd></div>
          </dl>
        </Step>
        <Step n={3} title="Bill vs rate card">
          <div className={`rounded-lg border p-4 ${verdict === 'crit' ? 'border-red-200 bg-crit-soft' : verdict === 'med' ? 'border-med-edge bg-med-soft' : 'border-green-200 bg-ok-soft'}`}>
            <div className="grid gap-3 text-sm sm:grid-cols-4">
              <div><div className="kicker">Billed</div><div className="text-2xl font-bold" data-testid="billed">{inr(wo.cost_inr)}</div></div>
              <div><div className="kicker">Reference</div><div className="text-2xl font-bold" data-testid="reference">{inr(wo.expected_cost)}</div><div className="text-xs">{wo.unit === 'per sqm' ? `${wo.area_sqm} m² × ${inr(wo.rate)} per m² (${wo.repair_method})` : `${inr(wo.rate)} per job (${wo.repair_method})`}</div></div>
              <div><div className="kicker">Ratio</div><div className="text-2xl font-bold">{wo.cost_ratio.toFixed(2)}×</div><div className="text-xs">Normal band up to {NORMAL_BAND_MAX}×</div></div>
              <div><div className="kicker">Per m²</div><div className="text-2xl font-bold">{inr(wo.cost_inr / wo.area_sqm)}</div><div className="text-xs">vs {wo.unit === 'per sqm' ? `${inr(wo.rate)} on the rate card` : 'a per-job rate'}</div></div>
            </div>
            <p className="mt-3 text-sm">{verdict === 'crit' ? <>Billed <b>{inr(wo.cost_inr - wo.expected_cost)}</b> more than the reference ({inr(wo.cost_inr - wo.expected_cost * NORMAL_BAND_MAX)} above the top of the normal band). Flagged for review.</> : verdict === 'med' ? 'Slightly above the normal band.' : 'Within the normal band.'}</p>
          </div>
        </Step>
        <Step n={4} title="Time target (historical SLA, as recorded)">
          <p className="text-sm">Target <b>{wo.sla_hours} h</b> from first complaint to completion. Recorded result: <b className={wo.sla_met ? 'text-ok' : 'text-crit'}>{wo.sla_met ? 'met' : 'missed'}</b>{hours != null ? <> · recomputed from timestamps: <b>{hours.toFixed(1)} h</b> ({hours <= wo.sla_hours ? 'within' : 'over'} target, {(hours <= wo.sla_hours) === wo.sla_met ? 'consistent with the record' : 'inconsistent with the record: data-quality flag'})</> : null}.</p>
          <p className="mt-1 text-xs text-muted">Historical SLA hours are the 2025 system's targets (24 h severity 5 to 168 h severity 1). They are kept separate from CivicOps' new ticket policy.</p>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">{rain.map((r) => <span key={r.date} className={`rounded border px-2 py-1 ${r.mm >= 64.5 ? 'border-blue-300 bg-blue-50 font-semibold' : 'border-line'}`}>{formatDateIST(r.date)}: {r.mm} mm</span>)}</div>
          <p className="mt-1 text-xs text-muted">Daily rainfall on those dates (max of Santacruz/Colaba), recorded values for those dates. Heavy rain (≥ 64.5 mm) is context for delays.</p>
          {/rain/i.test(wo.engineer_remark ?? '') ? (
            <p className="mt-2 rounded-lg border border-line bg-gray-50 p-2 text-sm">The engineer's remark says <i>“{wo.engineer_remark}”</i>. Recorded rainfall during the job peaked at <b>{Math.max(...rain.map((r) => r.mm))} mm</b>, {Math.max(...rain.map((r) => r.mm)) >= 64.5 ? 'which is heavy rain and supports the explanation.' : 'below the heavy-rain mark, so the delay is not explained by rainfall alone. Worth asking the contractor.'}</p>
          ) : null}
        </Step>
        <Step n={5} title="Did the fix hold?">
          <p className="text-sm">Reopened within 30 days: <b className={wo.reopened_within_30d ? 'text-crit' : 'text-ok'}>{wo.reopened_within_30d ? 'Yes, the fix failed' : 'No'}</b>.</p>
          <p className="mt-1 text-sm">Road under defect liability: <b>{road?.under_dlp ? 'Yes' : 'No'}</b> (last resurfaced {road?.last_resurfaced ? formatDateIST(road.last_resurfaced) : '—'}).</p>
          <h3 className="mt-3 text-sm font-semibold">All repairs on this road segment ({sameRoad.length})</h3>
          <div className="mt-1 overflow-x-auto"><table className="table"><thead><tr><th>Work order</th><th>Type</th><th>Method</th><th>Completed</th><th>Bill</th><th>× rate</th><th>Reopened</th></tr></thead>
            <tbody>{sameRoad.map((x) => <tr key={x.work_order_id} className={x.work_order_id === wo.work_order_id ? 'bg-teal-50' : ''}><td><Link className="font-mono underline" href={`/accountability/work-orders/${x.work_order_id}`}>{x.work_order_id}</Link></td><td>{x.work_type}</td><td>{x.repair_method}</td><td className="whitespace-nowrap">{formatDateIST(x.completed_at)}</td><td>{inr(x.cost_inr)}</td><td className={x.cost_ratio > OVER_RATE_THRESHOLD ? 'font-semibold text-crit' : ''}>{x.cost_ratio.toFixed(2)}</td><td>{x.reopened_within_30d ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
        </Step>
        <Step n={6} title="Audit result">
          {flags.length ? <ul className="space-y-2">{flags.map((f) => <li key={f.type} className="flex items-start gap-2 rounded-lg border border-red-200 bg-crit-soft p-3 text-sm"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-crit" /><span>{f.reason}</span></li>)}</ul> : <p className="text-sm text-ok">No audit flags on this job.</p>}
          <p className="mt-2 text-xs text-muted">Review signal for the ward engineer and auditor. Ask for measurement sheets and site photos before drawing conclusions.</p>
        </Step>
      </ol>
    </div>
  );
}
