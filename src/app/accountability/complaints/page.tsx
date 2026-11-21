import Link from 'next/link';
import { getDb, withSystem } from '@/lib/db';
import { loadRefData } from '@/lib/tickets';
import { loadTrail, trailSummary, type StatusClass } from '@/lib/trail';
import { formatIST, formatDateIST } from '@/lib/time';
import { SyntheticNote } from '@/components/ui';
import { Icon } from '@/components/icons';
import { SegmentBar, type Tone } from '@/components/Visuals';
import { ChartCaption, Legend, RecordsToggle } from '@/components/charts/ChartCard';

type SP = Record<string, string | undefined>;
const CLASS_LABEL: Record<StatusClass, string> = { fixed: 'Fixed by a work order', duplicate_on_job: 'Duplicate, covered by a job', open_unfixed: 'Open, no work order', forwarded: 'Forwarded to another agency', rejected: 'Rejected' };
const CLASS_TONE: Record<StatusClass, { tone: Tone; swatch: string; chip: string }> = {
  fixed: { tone: 'ok', swatch: 'bg-ok', chip: 'border-green-200 bg-ok-soft text-ok' },
  duplicate_on_job: { tone: 'action', swatch: 'bg-action', chip: 'border-teal-200 bg-action-soft text-action' },
  open_unfixed: { tone: 'crit', swatch: 'bg-crit', chip: 'border-red-200 bg-crit-soft text-crit' },
  forwarded: { tone: 'violet', swatch: 'bg-violet-600', chip: 'border-violet-200 bg-violet-50 text-violet-800' },
  rejected: { tone: 'std', swatch: 'bg-std', chip: 'border-orange-200 bg-std-soft text-std' },
};
const LANG: Record<string, string> = { 'hi-en': 'Hinglish', mr: 'Marathi', hi: 'Hindi', en: 'English' };

export default async function ComplaintTrail({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { rows, issues } = await withSystem(async (q) => loadTrail(q, await loadRefData(q)), await getDb());
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
  const classes: [StatusClass, number][] = [['fixed', s.fixed], ['duplicate_on_job', s.duplicates], ['open_unfixed', s.openUnfixed], ['forwarded', s.forwarded], ['rejected', s.rejected]];
  // Open issues: repeat complaints about the same problem in the same place, never fixed.
  const clusters = [...issues.entries()].filter(([k]) => k.startsWith('ISSUE-'))
    .filter(([, cs]) => !sp.ward || cs[0].inferred_ward === sp.ward)
    .sort((a, b) => b[1].length - a[1].length || b[1].reduce((x, c) => x + c.upvotes, 0) - a[1].reduce((x, c) => x + c.upvotes, 0)).slice(0, 9);

  const table = (
    <table className="table">
      <thead><tr><th>Complaint</th><th>What the citizen said</th><th>Ward</th><th>Category picked / from words</th><th>Outcome</th><th>Issue / work order</th></tr></thead>
      <tbody>
        {list.slice(0, 150).map((r) => (
          <tr key={r.complaint_id}>
            <td className="whitespace-nowrap"><Link className="font-mono font-semibold text-action! underline" href={`/accountability/complaints/${r.complaint_id}`}>{r.complaint_id}</Link><div className="text-xs text-muted">{formatIST(r.received_at)}<br />{r.channel}</div></td>
            <td className="max-w-md text-xs">“{r.description}”<div className="text-muted">{r.locality_text} · {LANG[r.language] ?? r.language}</div></td>
            <td className="whitespace-nowrap">{r.inferred_ward ?? '?'}{r.ward_source !== 'recorded' ? <div className="text-xs text-med">{r.ward_source === 'unresolved' ? 'not resolved' : `inferred (${r.ward_source})`}</div> : null}</td>
            <td className="text-xs">{r.category_reported}{r.category_mismatch ? <div className="text-med">Words say: {r.text_category} (“{r.text_matched}”)</div> : null}</td>
            <td className="text-xs">{CLASS_LABEL[r.status_class]}<div className="text-muted">{r.status}</div></td>
            <td className="whitespace-nowrap text-xs">{r.work_orders.length ? r.work_orders.map((w) => <Link key={w} className="block font-mono underline" href={`/accountability/work-orders/${w}`}>{w}</Link>) : <span>{r.issue_id}</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <section className="hero-drift relative -mx-4 -mt-6 overflow-hidden px-5 pb-7 pt-9 text-white sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-8">
        <div className="hero-grid" aria-hidden="true" />
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 max-w-3xl">
              <div className="fade-up d1 kicker text-teal-300">Connect the trail · synthetic 2025 complaints</div>
              <h1 className="fade-up d2 mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Complaints → issues → work orders</h1>
              <p className="fade-up d3 mt-2 text-slate-300">Every complaint is traced to the work order that fixed it, or shown as still open. Repeat complaints are grouped into issues; originals are never overwritten.</p>
            </div>
            <Link href="/accountability" className="btn border border-white/30 bg-white/10 hover:bg-white/20"><Icon name="rupee" />Money trail</Link>
          </div>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-3"><span className="text-4xl font-extrabold tnum">{s.complaints.toLocaleString('en-IN')}</span><span className="text-sm text-slate-300">complaints, and what happened to each</span></div>
          <div className="mt-3"><SegmentBar height="h-7" segments={classes.map(([k, n]) => ({ key: k, value: n, tone: CLASS_TONE[k].tone, href: qs({ cls: k }), label: `${CLASS_LABEL[k]}: ${n.toLocaleString('en-IN')}` }))} /></div>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {classes.map(([k, n]) => (
              <li key={k}><Link href={qs({ cls: k })} className={`block rounded-xl border px-3 py-2 ${sp.cls === k ? 'border-teal-300 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                <span className="flex items-center gap-1.5 text-xs text-slate-300"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${CLASS_TONE[k].swatch}`} aria-hidden="true" />{CLASS_LABEL[k]}</span>
                <span className="block text-xl font-extrabold tnum">{n.toLocaleString('en-IN')}</span>
              </Link></li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">Languages:</span>
            {s.languages.map(([l, n]) => <Link key={l} href={qs({ lang: sp.lang === l ? undefined : l })} className={`chip ${sp.lang === l ? 'border-teal-300 bg-teal-300 text-navy-950' : 'border-white/20 bg-white/5 text-white'}`}>{LANG[l] ?? l} <span className="tnum">{n.toLocaleString('en-IN')}</span></Link>)}
            <Link href={qs({ blank: sp.blank ? undefined : '1' })} className={`chip ${sp.blank ? 'border-amber-300 bg-amber-300 text-navy-950' : 'border-amber-300/40 bg-amber-300/10 text-amber-200'}`}>Ward was blank <span className="tnum">{s.blankWard}</span> ({s.wardInferred} inferred)</Link>
            <Link href={qs({ mismatch: sp.mismatch ? undefined : '1' })} className={`chip ${sp.mismatch ? 'border-amber-300 bg-amber-300 text-navy-950' : 'border-amber-300/40 bg-amber-300/10 text-amber-200'}`}>Words differ from category <span className="tnum">{s.categoryMismatch.toLocaleString('en-IN')}</span></Link>
          </div>
        </div>
      </section>
      <SyntheticNote>Synthetic data. Category from words uses a transparent keyword list in English, Hinglish, Marathi and Hindi; it is a review aid, not a replacement for the citizen&apos;s choice.</SyntheticNote>

      <section aria-labelledby="cl-h" className="space-y-3">
        <div>
          <div className="kicker text-crit">Still open, never fixed{sp.ward ? ` · Ward ${sp.ward}` : ''}</div>
          <h2 id="cl-h" className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">Biggest open issues</h2>
          <p className="mt-1 text-sm text-muted">{s.openUnfixed.toLocaleString('en-IN')} open complaints grouped into {s.openIssues.toLocaleString('en-IN')} issues: same ward, same problem, same place, within 14 days.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map(([id, cs]) => {
            const first = cs[0]; const last = cs[cs.length - 1];
            const langs = [...new Set(cs.map((c) => c.language))];
            const cat = first.text_category ?? first.category_reported;
            const votes = cs.reduce((x, c) => x + c.upvotes, 0);
            return (
              <li key={id} className="card lift min-w-0 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate font-bold">{first.locality_text || 'Unknown place'}</div><div className="text-xs text-muted">Ward {first.inferred_ward ?? '?'} · {id}</div></div>
                  <div className="text-right"><div className="text-2xl font-extrabold text-crit tnum">{cs.length}</div><div className="text-[11px] text-muted">complaints</div></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip border-red-200 bg-crit-soft text-crit">{cat}</span>
                  {langs.map((l) => <span key={l} className="chip border-gray-300 bg-white text-gray-700">{LANG[l] ?? l}</span>)}
                  {votes ? <span className="chip border-gray-300 bg-white text-gray-700 tnum">{votes} upvotes</span> : null}
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-ink/80">“{first.description}”</p>
                <div className="mt-2 text-[11px] text-muted tnum">{formatDateIST(first.received_at)}{cs.length > 1 ? ` – ${formatDateIST(last.received_at)}` : ''} · <Link className="underline" href={`/accountability/complaints/${first.complaint_id}`}>{first.complaint_id}</Link></div>
              </li>
            );
          })}
        </ul>
        <ChartCaption c={{ period: 'Jun–Oct 2025', unit: 'complaints', n: `${s.openIssues} open issues (9 largest shown)`, source: 'complaints.csv, work_orders.csv links' }} />
      </section>

      <section aria-labelledby="list-h" className="space-y-3">
        <h2 id="list-h" className="text-xl font-extrabold tracking-tight">Find a complaint</h2>
        <form className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Search complaints">
          <input name="q" defaultValue={sp.q ?? ''} className="input lg:col-span-2" placeholder="Complaint ID, words or locality (e.g. BMC25-004138, gadda, Juhu)" aria-label="Search" />
          <select name="cls" defaultValue={sp.cls ?? ''} className="input" aria-label="Outcome"><option value="">Any outcome</option>{Object.entries(CLASS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="ward" defaultValue={sp.ward ?? ''} className="input" aria-label="Ward"><option value="">All wards</option>{wards.map((w) => <option key={w} value={w}>Ward {w}</option>)}</select>
          <select name="lang" defaultValue={sp.lang ?? ''} className="input" aria-label="Language"><option value="">Any language</option><option value="en">English</option><option value="hi-en">Hinglish</option><option value="mr">Marathi</option><option value="hi">Hindi</option></select>
          <button className="btn-primary">Search</button>
        </form>
        <Legend items={classes.map(([k]) => ({ label: CLASS_LABEL[k], swatch: CLASS_TONE[k].swatch }))} />
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, 24).map((r) => (
            <li key={r.complaint_id} className="card min-w-0 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link className="font-mono text-sm font-bold text-action! underline" href={`/accountability/complaints/${r.complaint_id}`}>{r.complaint_id}</Link>
                <span className={`chip ${CLASS_TONE[r.status_class].chip}`}>{CLASS_LABEL[r.status_class]}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm">“{r.description}”</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="chip border-gray-300 bg-white text-gray-700">{LANG[r.language] ?? r.language}</span>
                <span className="chip border-gray-300 bg-white text-gray-700">{r.category_reported}</span>
                {r.category_mismatch ? <span className="chip border-yellow-200 bg-med-soft text-med">Words say: {r.text_category}</span> : null}
                {r.ward_source !== 'recorded' ? <span className="chip border-yellow-200 bg-med-soft text-med">Ward {r.inferred_ward ?? '?'} {r.ward_source === 'unresolved' ? 'not resolved' : `inferred (${r.ward_source})`}</span> : null}
              </div>
              <div className="mt-2 text-[11px] text-muted tnum">{formatIST(r.received_at)} · {r.locality_text} · Ward {r.inferred_ward ?? '?'}{r.work_orders.length ? <> · <Link className="font-mono underline" href={`/accountability/work-orders/${r.work_orders[0]}`}>{r.work_orders[0]}</Link></> : ` · ${r.issue_id}`}</div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted tnum">{list.length.toLocaleString('en-IN')} matching complaints; {Math.min(24, list.length)} shown as cards.</p>
        <RecordsToggle rows={Math.min(150, list.length)}>{table}</RecordsToggle>
      </section>
    </div>
  );
}
