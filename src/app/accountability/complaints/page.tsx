import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { loadRefData } from '@/lib/tickets';
import { loadTrail, trailSummary, type StatusClass } from '@/lib/trail';
import { formatIST } from '@/lib/time';
import { Kpi, PageHeader, SyntheticNote } from '@/components/ui';

type SP = Record<string, string | undefined>;
const CLASS_LABEL: Record<StatusClass, string> = { fixed: 'Fixed by a work order', duplicate_on_job: 'Duplicate, covered by a job', open_unfixed: 'Open, no work order', forwarded: 'Forwarded to another agency', rejected: 'Rejected' };

export default async function ComplaintTrail({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { rows } = await withSystem(async (q) => loadTrail(q, await loadRefData(q)), await getDb());
  const s = trailSummary(rows);
  const needle = (sp.q ?? '').trim().toLowerCase();
  let list = rows;
  if (sp.cls) list = list.filter((r) => r.status_class === sp.cls);
  if (sp.ward) list = list.filter((r) => r.inferred_ward === sp.ward);
  if (sp.mismatch) list = list.filter((r) => r.category_mismatch);
  if (sp.blank) list = list.filter((r) => !r.ward_code);
  if (sp.lang) list = list.filter((r) => r.language === sp.lang);
  if (needle) list = list.filter((r) => r.complaint_id.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle) || (r.locality_text ?? '').toLowerCase().includes(needle));
  const qs = (p: SP) => '?' + new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][]).toString();
  const wards = [...new Set(rows.map((r) => r.inferred_ward).filter(Boolean))].sort() as string[];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Connect the trail · synthetic 2025 complaints" title="Complaints → issues → work orders" actions={<Link href="/accountability" className="btn-secondary">Money trail</Link>}>
        Every complaint is traced to the work order that fixed it, or shown as still open. Messy input is cleaned without overwriting the original: blank wards are inferred, the category in the citizen's words is shown next to the one they picked, and repeat complaints are grouped into issues.
      </PageHeader>
      <SyntheticNote />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Complaints" value={s.complaints.toLocaleString('en-IN')} href={qs({ cls: undefined })} />
        <Kpi label="Linked to a job" value={s.linked.toLocaleString('en-IN')} sub={`${s.jobs.toLocaleString('en-IN')} work orders`} href={qs({ cls: 'fixed' })} tone="ok" />
        <Kpi label="Duplicates on a job" value={s.duplicates.toLocaleString('en-IN')} sub="Same problem, one repair" href={qs({ cls: 'duplicate_on_job' })} />
        <Kpi label="Open, never fixed" value={s.openUnfixed.toLocaleString('en-IN')} sub={`${s.openIssues} distinct issues`} href={qs({ cls: 'open_unfixed' })} tone="crit" />
        <Kpi label="Forwarded" value={s.forwarded} sub="MMRDA/PWD, SWM" href={qs({ cls: 'forwarded' })} />
        <Kpi label="Rejected" value={s.rejected} href={qs({ cls: 'rejected' })} />
        <Kpi label="Ward was blank" value={s.blankWard} sub={`${s.wardInferred} inferred from GPS or locality`} href={qs({ blank: '1' })} tone="med" />
        <Kpi label="Category differs from words" value={s.categoryMismatch.toLocaleString('en-IN')} sub="Picked vs described" href={qs({ mismatch: '1' })} tone="med" />
      </div>
      <p className="text-xs text-muted">Languages: {s.languages.map(([l, n]) => `${l === 'hi-en' ? 'Hinglish' : l === 'mr' ? 'Marathi' : l === 'hi' ? 'Hindi' : 'English'} ${n.toLocaleString('en-IN')}`).join(' · ')}. Category from words uses a transparent keyword list in English, Hinglish, Marathi and Hindi; it is a review aid, not a replacement for the citizen's choice.</p>

      <form className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Search complaints">
        <input name="q" defaultValue={sp.q ?? ''} className="input lg:col-span-2" placeholder="Complaint ID, words or locality (e.g. BMC25-004138, gadda, Juhu)" aria-label="Search" />
        <select name="cls" defaultValue={sp.cls ?? ''} className="input" aria-label="Outcome"><option value="">Any outcome</option>{Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="ward" defaultValue={sp.ward ?? ''} className="input" aria-label="Ward"><option value="">All wards</option>{wards.map((w) => <option key={w} value={w}>Ward {w}</option>)}</select>
        <select name="lang" defaultValue={sp.lang ?? ''} className="input" aria-label="Language"><option value="">Any language</option><option value="en">English</option><option value="hi-en">Hinglish</option><option value="mr">Marathi</option><option value="hi">Hindi</option></select>
        <button className="btn-primary">Search</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Complaint</th><th>What the citizen said</th><th>Ward</th><th>Category picked / from words</th><th>Outcome</th><th>Issue / work order</th></tr></thead>
          <tbody>
            {list.slice(0, 150).map((r) => (
              <tr key={r.complaint_id}>
                <td className="whitespace-nowrap"><Link className="font-mono font-semibold text-action underline" href={`/accountability/complaints/${r.complaint_id}`}>{r.complaint_id}</Link><div className="text-xs text-muted">{formatIST(r.received_at)}<br />{r.channel}</div></td>
                <td className="max-w-md text-xs">“{r.description}”<div className="text-muted">{r.locality_text} · {r.language}</div></td>
                <td className="whitespace-nowrap">{r.inferred_ward ?? '?'}{r.ward_source !== 'recorded' ? <div className="text-xs text-med">{r.ward_source === 'unresolved' ? 'not resolved' : `inferred (${r.ward_source})`}</div> : null}</td>
                <td className="text-xs">{r.category_reported}{r.category_mismatch ? <div className="text-med">Words say: {r.text_category} (“{r.text_matched}”)</div> : null}</td>
                <td className="text-xs">{CLASS_LABEL[r.status_class]}<div className="text-muted">{r.status}</div></td>
                <td className="whitespace-nowrap text-xs">{r.work_orders.length ? r.work_orders.map((w) => <Link key={w} className="block font-mono underline" href={`/accountability/work-orders/${w}`}>{w}</Link>) : <span>{r.issue_id}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-xs text-muted">{list.length > 150 ? `Showing 150 of ${list.length.toLocaleString('en-IN')} matching complaints. Narrow the search.` : `${list.length} matching complaints.`}</p>
      </div>
    </div>
  );
}
