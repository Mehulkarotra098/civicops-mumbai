import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/session';
import { ticketView } from '@/lib/views';
import { HttpError } from '@/lib/db';
import { formatIST } from '@/lib/time';
import { visionProvider } from '@/lib/vision';
import { PageHeader, PriorityBadge, StatusBadge, Timeline } from '@/components/ui';
import { ReviewPanel } from './ReviewPanel';

export default async function ReviewPage({ params }: { params: Promise<{ ref: string }> }) {
  const user = await requirePageUser(['super_admin']);
  const { ref } = await params;
  let v;
  try { v = await ticketView(user, decodeURIComponent(ref)); } catch (e) { if (e instanceof HttpError && e.status === 404) notFound(); throw e; }
  const { t } = v;
  const fmt = (e: (typeof v.evidence)[number]) => ({ id: e.id, phase: e.phase, note: e.note, created_at: formatIST(e.created_at), origin: e.origin, duplicate: !!e.duplicate_of_evidence, uploader_role: e.uploader_role });
  const before = v.evidence.filter((e) => e.phase === 'report' || e.phase === 'before').map(fmt);
  const during = v.evidence.filter((e) => e.phase === 'during').map(fmt);
  const after = v.evidence.filter((e) => e.phase === 'after').map(fmt);
  const officerNotes = v.events.filter((e) => ['first_action', 'work_started', 'progress_update', 'access_restored', 'supply_restored', 'submitted_for_review', 'supporting_handoff'].includes(e.type));
  return (
    <div className="space-y-5">
      <PageHeader kicker="Evidence review" title={`${t.ref} · ${t.title}`} actions={<Link className="btn-secondary" href={`/tickets/${t.ref}`}>Open ticket</Link>}>
        <span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /><span>Ward {t.ward_code} · {v.deptName}</span><span>Reported {formatIST(t.submitted_at)}</span></span>
      </PageHeader>
      <ReviewPanel
        ticketId={t.id} ref_={t.ref} status={t.status} version={t.version} provider={visionProvider()}
        before={before} during={during} after={after}
        closureCheck={v.category?.closureCheck ?? ''} category={v.category?.label ?? t.category_code}
        context={{ location: `${t.locality_name ?? ''}${t.landmark ? ` · ${t.landmark}` : ''} (${Number(t.lat).toFixed(5)}, ${Number(t.lon).toFixed(5)})`, description: t.description, accessRestored: t.access_restored_at ? formatIST(t.access_restored_at) : null, supplyRestored: t.supply_restored_at ? formatIST(t.supply_restored_at) : null, needsSupply: t.category_code === 'water_supply' && t.details?.supply_stopped === 'yes' }}
        notes={officerNotes.map((e) => ({ at: formatIST(e.at), type: e.type, note: e.note ?? '', who: e.actor_name ?? '' }))}
        assessments={v.assessments.map((a) => ({ ...a, created_at: formatIST(a.created_at) }))}
        decisions={v.decisions.map((d) => ({ ...d, created_at: formatIST(d.created_at) }))}
      />
      <section className="card p-5"><h2 className="h2 mb-4">Full history</h2><Timeline events={v.events} viewerId={user.id} viewerRole={user.role} /></section>
    </div>
  );
}
