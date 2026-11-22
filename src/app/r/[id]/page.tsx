// /r/<road id>: the public page a road's QR site board opens. Phone first: the warranty clock leads,
// "Report a problem on this road" is one tap away, then the money, the history and who is responsible.
import { pageMeta } from '@/lib/seo';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { roadProfile, type RoadProfile } from '@/lib/roads';
import { currentUser } from '@/lib/session';
import { CATEGORY_BY_CODE } from '@/lib/config';
import { formatDateIST, inr, inrShort as formatInr } from '@/lib/time';
import { Icon } from '@/components/icons';
import { PriorityBadge, StatusBadge } from '@/components/ui';
import { RoadActionBar } from '../RoadActions';
import { WarrantyClock, reportHref, siteOrigin } from '../shared';

export const dynamic = 'force-dynamic';

const validId = (id: string) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!validId(id)) return { title: 'Road not found · CivicOps Mumbai' };
  const p = await withSystem((q) => roadProfile(q, id), await getDb());
  if (!p) return { title: 'Road not found' };
  const w = p.warranty;
  const when = w.expires ? (w.state === 'expired' ? `Free-repair period ended ${w.expires.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}.` : `Free repairs until ${w.expires.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}.`) : 'Free-repair period unknown.';
  // the image comes from ./opengraph-image.tsx (road name, warranty clock, paid-twice count)
  return pageMeta(`${p.road.road_name}, segment ${p.road.segment_no} · Road QR`, `${when} See who must fix defects, every rupee spent on this road, and report a problem here. Ward ${p.road.ward_code}, synthetic demo data.`, null);
}

export default async function RoadQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validId(id)) notFound();
  const [p, user, origin] = await Promise.all([withSystem((q) => roadProfile(q, id), await getDb()), currentUser(), siteOrigin()]);
  if (!p) notFound();
  const { road, warranty: w } = p;
  const url = `${origin}/r/${road.road_id}`;
  const title = `${road.road_name}, segment ${road.segment_no}`;
  const aboveNav = !user || user.role === 'resident';

  return (
    <div className="-mx-4 -mt-6 pb-28 lg:mx-0 lg:mt-0 lg:pb-0">
      <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6">
        {/* Left on desktop: who this road is + the clock + action */}
        <div className="space-y-4 lg:sticky lg:top-24">
          <header className="relative overflow-hidden bg-navy-900 px-4 pb-14 pt-4 text-white lg:rounded-2xl">
            <RoadGlyph />
            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-teal-200">
                <Icon name="road" className="h-4 w-4" />Road QR · <span className="font-mono">{road.road_id}</span>
              </div>
              <h1 className="mt-1 text-[26px] font-extrabold leading-[1.1] tracking-tight sm:text-[30px]">{road.road_name}</h1>
              <p className="mt-1 text-sm text-indigo-100">Segment {road.segment_no} · Ward {p.ward.code} ({p.ward.name})</p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5 text-xs" aria-label="Road facts">
                <li className="chip border-white/20 bg-white/10 text-white">{road.surface}</li>
                <li className="chip tnum border-white/20 bg-white/10 text-white">{Math.round(Number(road.length_m)).toLocaleString('en-IN')} m · {road.lanes} lanes</li>
                <li className="chip hidden border-white/20 bg-white/10 text-white sm:inline-flex">{road.road_type}</li>
                {road.bus_route ? <li className="chip border-amber-300/50 bg-amber-300/15 text-amber-100"><Icon name="truck" className="h-3.5 w-3.5" />BEST bus route</li> : null}
              </ul>
              <p className="mt-2 text-[11px] text-indigo-200">Synthetic demo data (Claude Impact Lab) · not BMC records</p>
            </div>
          </header>
          <div className="relative -mt-12 space-y-3 px-4 lg:px-0">
            <WarrantyClock w={w} contractor={p.contractor?.name ?? null} />
            <RoadActionBar reportHref={reportHref(road.road_id)} url={url} title={title} aboveNav={aboveNav} />
          </div>
        </div>

        {/* Right on desktop: evidence */}
        <div className="mt-4 space-y-4 px-4 lg:mt-0 lg:px-0">
          {p.paidTwice.length ? <PaidTwice p={p} /> : null}
          <Money p={p} />
          <Trail p={p} />
          <LiveNow p={p} />
          <Responsible p={p} />
          <SegmentMap p={p} />
          <nav aria-label="More about this road" className="flex flex-wrap gap-2 pb-2 text-sm">
            <Link className="btn-secondary btn-sm" href={`/r/${road.road_id}/board`}><Icon name="board" className="h-4 w-4" />QR site board</Link>
            <Link className="btn-secondary btn-sm" href="/roads"><Icon name="list" className="h-4 w-4" />All roads</Link>
            <Link className="btn-secondary btn-sm" href={`/accountability/roads/${road.road_id}`}><Icon name="history" className="h-4 w-4" />Full records</Link>
          </nav>
        </div>
      </div>
    </div>
  );
}

function RoadGlyph() {
  // Decorative: a road receding to the horizon, the trail line running up its centre.
  return (
    <svg aria-hidden viewBox="0 0 200 120" className="pointer-events-none absolute -right-6 bottom-0 h-40 w-64 opacity-25" preserveAspectRatio="xMaxYMax meet">
      <path d="M70 120 L112 0 L128 0 L190 120 Z" fill="#17264a" />
      <path d="M120 4 L130 120" stroke="#5eead4" strokeWidth="2" strokeDasharray="6 8" />
      <circle cx="121" cy="20" r="3" fill="#5eead4" /><circle cx="124" cy="55" r="3.5" fill="#5eead4" /><circle cx="128" cy="95" r="4" fill="#5eead4" />
    </svg>
  );
}

function Section({ id, kicker, title, children, tone = 'bg-white' }: { id: string; kicker: string; title: string; children: React.ReactNode; tone?: string }) {
  return (
    <section aria-labelledby={id} className={`rounded-2xl border border-line ${tone} p-4 shadow-[var(--shadow-1)]`}>
      <div className="kicker">{kicker}</div>
      <h2 id={id} className="mt-0.5 text-lg font-extrabold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PaidTwice({ p }: { p: RoadProfile }) {
  const total = p.paidTwice.reduce((s, x) => s + x.billed, 0);
  const top = p.paidTwice.slice(0, 3);
  return (
    <section aria-labelledby="paid-h" className="rounded-2xl border-2 border-red-200 bg-crit-soft p-4">
      <div className="flex items-center gap-2 text-crit"><Icon name="alert" className="h-5 w-5" /><h2 id="paid-h" className="text-lg font-extrabold tracking-tight">Paid twice?</h2></div>
      <p className="mt-1 text-sm text-ink">
        The ward paid for <b className="tnum">{p.paidTwice.length}</b> repair{p.paidTwice.length === 1 ? '' : 's'} (<b className="tnum">{formatInr(total)}</b>) while this road was in its free-repair period.
        Should the original contractor have fixed {p.paidTwice.length === 1 ? 'it' : 'them'} at no cost?
      </p>
      <ul className="mt-3 space-y-2">
        {top.map((x) => (
          <li key={x.work_order_id}>
            <Link href={`/spending/wo/${x.work_order_id}`} className="block rounded-xl border border-red-100 bg-white p-3 hover:border-crit">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-mono font-bold text-crit underline">{x.work_order_id}</span><span className="tnum text-muted">{formatDateIST(x.assigned_at)}</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-crit-soft px-2.5 py-2"><div className="text-[11px] font-semibold text-muted">Ward paid</div><div className="tnum text-lg font-extrabold text-crit">{inr(x.billed)}</div></div>
                <div className="rounded-lg bg-ok-soft px-2.5 py-2"><div className="text-[11px] font-semibold text-muted">Under warranty</div><div className="tnum text-lg font-extrabold text-ok">₹0</div></div>
              </div>
              <div className="mt-1.5 text-[11px] text-muted">Rate-card estimate {inr(x.expected)} · {x.contractor_name}</div>
            </Link>
          </li>
        ))}
      </ul>
      {p.paidTwice.length > top.length ? <p className="mt-2 text-xs text-muted">+ {p.paidTwice.length - top.length} more in the repairs list below.</p> : null}
      <p className="mt-2 text-[11px] text-muted">A review signal from synthetic records, not a finding of wrongdoing. Tap a bill to see it and ask the ward office.</p>
    </section>
  );
}

function Money({ p }: { p: RoadProfile }) {
  const max = Math.max(1, ...p.workOrders.map((w) => Math.max(w.cost_inr, w.expected_cost)));
  const shown = p.workOrders.slice(0, 6);
  const rest = p.workOrders.slice(6);
  const row = (w: RoadProfile['workOrders'][number]) => (
    <li key={w.work_order_id}>
      <Link href={`/spending/wo/${w.work_order_id}`} className="block rounded-lg px-1 py-1.5 hover:bg-gray-50">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="min-w-0 truncate"><span className="font-mono font-semibold text-action underline">{w.work_order_id}</span> <span className="text-muted">· {w.repair_method}</span></span>
          <span className="tnum shrink-0 font-bold">{inr(w.cost_inr)}</span>
        </div>
        <div className="mt-1 space-y-0.5" aria-label={`Billed ${inr(w.cost_inr)} against a rate-card estimate of ${inr(w.expected_cost)}`} role="img">
          <div className="h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${w.cost_ratio > 1.35 ? 'bg-[#d97706]' : w.dlp_paid ? 'bg-crit' : 'bg-action'}`} style={{ width: `${(w.cost_inr / max) * 100}%` }} /></div>
          <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-gray-400" style={{ width: `${(w.expected_cost / max) * 100}%` }} /></div>
        </div>
        <div className="tnum mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
          <span>{formatDateIST(w.assigned_at)}</span><span>{w.cost_ratio.toFixed(2)}× rate card</span>
          {w.dlp_paid ? <span className="font-semibold text-crit">During free-repair period</span> : null}
          {w.reopened ? <span className="font-semibold text-std">Failed within 30 days</span> : null}
        </div>
      </Link>
    </li>
  );
  return (
    <Section id="money-h" kicker="Money on this road" title={p.workOrders.length ? `${formatInr(p.totalBilled)} billed for ${p.workOrders.length} repair${p.workOrders.length === 1 ? '' : 's'}` : 'No repairs billed'}>
      {p.workOrders.length ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={formatInr(p.totalBilled)} label="Billed" />
            <Stat value={formatInr(p.totalExpected)} label="Rate card" />
            <Stat value={String(p.reopenCount)} label="Reopened" tone={p.reopenCount ? 'text-std' : undefined} />
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-action" />Bill</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-gray-400" />Rate-card estimate</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-crit" />Paid in free-repair period</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-[#d97706]" />Over 1.35× rate</span>
          </div>
          <ul className="mt-2 divide-y divide-line">{shown.map(row)}</ul>
          {rest.length ? (
            <details className="mt-1">
              <summary className="cursor-pointer py-2 text-sm font-semibold text-action">Show {rest.length} more repair{rest.length === 1 ? '' : 's'}</summary>
              <ul className="divide-y divide-line">{rest.map(row)}</ul>
            </details>
          ) : null}
          <p className="mt-2 text-[11px] text-muted">Jun–Oct 2025 repair records. Every bill links to its public record.</p>
        </>
      ) : <p className="text-sm text-muted">No repair work orders are on record for this segment (Jun–Oct 2025).</p>}
    </Section>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return <div className="rounded-xl bg-surface px-2 py-2.5"><div className={`tnum text-base font-extrabold ${tone ?? ''}`}>{value}</div><div className="text-[11px] font-semibold text-muted">{label}</div></div>;
}

type TrailEvent = { at: Date; kind: 'resurfaced' | 'repair' | 'paid' | 'reopened' | 'complaint' | 'end' | 'today'; title: string; sub?: string; href?: string };

function Trail({ p }: { p: RoadProfile }) {
  const w = p.warranty;
  const now = new Date();
  const ev: TrailEvent[] = [];
  if (w.start) ev.push({ at: w.start, kind: 'resurfaced', title: 'Resurfaced', sub: `${p.road.surface}${w.years ? ` · ${w.years}-year free-repair period starts` : ''}` });
  for (const x of p.workOrders) {
    ev.push({ at: x.assigned_at, kind: x.dlp_paid ? 'paid' : 'repair', title: `Repair: ${x.work_type}`, sub: `${x.repair_method} · ${inr(x.cost_inr)}${x.dlp_paid ? ' · billed during free-repair period' : ''}`, href: `/spending/wo/${x.work_order_id}` });
    if (x.reopened) ev.push({ at: x.completed_at, kind: 'reopened', title: 'Repair failed within 30 days', sub: `${x.work_order_id} reopened`, href: `/spending/wo/${x.work_order_id}` });
  }
  for (const c of p.complaints.latest) ev.push({ at: c.received_at, kind: 'complaint', title: `Complaint: ${c.category}`, sub: `${c.status}${c.channel ? ` · via ${c.channel}` : ''}` });
  if (w.expires) ev.push({ at: w.expires, kind: 'end', title: w.state === 'expired' ? 'Free-repair period ended' : 'Free-repair period ends', sub: w.basis === 'Dataset flag' ? 'Date from the dataset and the standard period' : 'Assumed from surface type' });
  ev.push({ at: now, kind: 'today', title: 'Today' });
  ev.sort((a, b) => a.at.getTime() - b.at.getTime());
  const LIMIT = 9;
  const cut = ev.length > LIMIT ? ev.length - LIMIT : 0;
  // Keep the first event and the warranty end visible; fold the middle.
  const kept = cut ? ev.slice(1, cut + 1).filter((e) => e.kind === 'end') : [];
  const hidden = cut - kept.length;
  const shown = cut ? [ev[0], ...kept, ...ev.slice(cut + 1)] : ev;
  const DOT: Record<TrailEvent['kind'], string> = {
    resurfaced: 'border-action bg-action', repair: 'border-action bg-white', paid: 'border-crit bg-crit', reopened: 'border-std bg-std-soft',
    complaint: 'border-indigo-400 bg-indigo-100', end: 'border-ok bg-ok-soft', today: 'border-navy-900 bg-navy-900',
  };
  return (
    <Section id="trail-h" kicker="The trail" title="This road's story" tone="bg-white">
      <ol className="relative space-y-3 pl-7 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-0.5 before:rounded before:bg-action/30">
        {shown.map((e, i) => [
          hidden > 0 && i === 1 ? <li key="more" className="relative text-xs font-semibold text-muted"><span aria-hidden className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-action/40" />… {hidden} earlier events (see repairs above)</li> : null,
          <li key={i} className="relative">
            <span aria-hidden className={`absolute -left-7 top-1 h-[18px] w-[18px] rounded-full border-[3px] ${DOT[e.kind]} ${e.kind === 'today' ? 'ring-4 ring-navy-900/15' : ''}`} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              {e.href ? <Link href={e.href} className={`text-sm font-bold underline-offset-2 hover:underline ${e.kind === 'paid' ? 'text-crit' : e.kind === 'reopened' ? 'text-std' : ''}`}>{e.title}</Link>
                : <span className={`text-sm font-bold ${e.kind === 'today' ? 'text-navy-900' : e.kind === 'end' ? 'text-ok' : ''}`}>{e.title}</span>}
              <time className="tnum text-xs text-muted" dateTime={e.at.toISOString()}>{formatDateIST(e.at)}</time>
            </div>
            {e.sub ? <div className="text-xs text-muted">{e.sub}</div> : null}
          </li>,
        ])}
      </ol>
      <p className="mt-3 text-xs text-muted">
        <b className="tnum text-ink">{p.complaints.count}</b> historical complaint{p.complaints.count === 1 ? '' : 's'} on or near this road ({p.complaints.open} still open), linked by work order or within 150 m. Complainants are never shown.
      </p>
    </Section>
  );
}

function LiveNow({ p }: { p: RoadProfile }) {
  return (
    <Section id="live-h" kicker="Live now" title={p.openTickets ? `${p.openTickets} open report${p.openTickets === 1 ? '' : 's'} on this road` : 'No open reports on this road'} tone="bg-action-soft/40">
      {p.tickets.length ? (
        <ul className="space-y-2">
          {p.tickets.map((t) => (
            <li key={t.ref} className="rounded-xl border border-line bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{CATEGORY_BY_CODE[t.category_code]?.short ?? CATEGORY_BY_CODE[t.category_code]?.label ?? t.category_code}</span>
                <span className="font-mono text-[11px] text-muted">{t.ref}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} /></div>
              <div className="tnum mt-1 text-[11px] text-muted">Reported {formatDateIST(t.submitted_at)}</div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nobody has reported a problem here yet. Seen one? Use the report button: it is pinned to this road.</p>}
      <p className="mt-2 text-[11px] text-muted">Reports filed on this road or within 150 m of it. Only the reference, type, status and priority are public.</p>
    </Section>
  );
}

function Responsible({ p }: { p: RoadProfile }) {
  return (
    <Section id="resp-h" kicker="Who is responsible" title="Who fixes this road">
      <ul className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-xl bg-surface p-3">
          <Icon name="board" className="h-5 w-5 text-action" />
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Ward office</div>
          <div className="text-sm font-bold">{p.ward.office ?? `Ward ${p.ward.code} office`}</div>
          <Link href={`/wards`} className="text-xs font-semibold text-action underline">Ward {p.ward.code} · {p.ward.name}</Link>
        </li>
        <li className="rounded-xl bg-surface p-3">
          <Icon name="wrench" className="h-5 w-5 text-action" />
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Contractor</div>
          <div className="text-sm font-bold">{p.contractor?.name ?? 'Not on record'}</div>
          {p.contractor ? <div className="text-[11px] text-muted">{p.contractor.how}</div> : null}
        </li>
        <li className="rounded-xl bg-surface p-3">
          <Icon name="bell" className="h-5 w-5 text-action" />
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">BMC helpline</div>
          <a href="tel:1916" className="tnum text-2xl font-extrabold text-action underline">1916</a>
          <div className="text-[11px] text-muted">24 × 7 municipal helpline</div>
        </li>
      </ul>
    </Section>
  );
}

function SegmentMap({ p }: { p: RoadProfile }) {
  const r = p.road;
  const pts: number[][] = [...(p.ward.boundary ?? []), [r.start_lon, r.start_lat], [r.end_lon, r.end_lat]];
  const lat0 = p.midpoint.lat * Math.PI / 180;
  const xs = pts.map((q) => q[0] * Math.cos(lat0)), ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 320, H = 180, pad = 14;
  const s = Math.min((W - pad * 2) / Math.max(maxX - minX, 1e-6), (H - pad * 2) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  const P = (lon: number, lat: number) => [ox + (lon * Math.cos(lat0) - minX) * s, H - (oy + (lat - minY) * s)];
  const ring = (p.ward.boundary ?? []).map(([lon, lat]) => P(lon, lat).map((v) => v.toFixed(1)).join(',')).join(' ');
  const [ax, ay] = P(r.start_lon, r.start_lat), [bx, by] = P(r.end_lon, r.end_lat);
  return (
    <Section id="map-h" kicker="Where" title={`Segment ${r.segment_no} in Ward ${p.ward.code}`} tone="bg-white">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto max-h-64 w-full max-w-lg rounded-xl bg-surface" role="img" aria-label={`Sketch of ${r.road_name} segment ${r.segment_no} inside Ward ${p.ward.code}`}>
        {ring ? <polygon points={ring} fill="#ccfbf1" fillOpacity="0.45" stroke="#0f766e" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="4 3" /> : null}
        <circle cx={(ax + bx) / 2} cy={(ay + by) / 2} r="22" fill="#0f766e" fillOpacity="0.12" stroke="#0f766e" strokeOpacity="0.6" strokeWidth="1.5" />
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#0b1324" strokeWidth="9" strokeLinecap="round" />
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#5eead4" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" />
        <circle cx={ax} cy={ay} r="5" fill="#fff" stroke="#0f766e" strokeWidth="2.5" />
        <circle cx={bx} cy={by} r="5" fill="#0f766e" stroke="#fff" strokeWidth="2" />
        <text x={(ax + bx) / 2} y={(ay + by) / 2 - 28} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0b1324">{r.road_name.length > 28 ? r.road_name.slice(0, 27) + '…' : r.road_name}</text>
      </svg>
      <p className="tnum mt-2 text-xs text-muted">Midpoint {p.midpoint.lat.toFixed(5)}, {p.midpoint.lon.toFixed(5)} · Synthetic dataset · Approximate demo boundaries</p>
    </Section>
  );
}
