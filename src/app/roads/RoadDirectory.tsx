'use client';
// Search + filter chips + cards with a warranty mini-bar and a QR thumbnail. Shows 60 at a time.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import { QrCode } from '@/components/QrCode';
import type { RoadCard, WarrantyState } from '@/lib/roads';

type Filter = 'all' | 'active' | 'expiring' | 'expired' | 'paid';
const FILTERS: { key: Filter; label: string; icon: string }[] = [
  { key: 'all', label: 'All roads', icon: 'list' },
  { key: 'active', label: 'Free repair active', icon: 'shield' },
  { key: 'expiring', label: 'Expiring in 90 days', icon: 'clock' },
  { key: 'expired', label: 'Expired', icon: 'x' },
  { key: 'paid', label: 'Paid twice?', icon: 'alert' },
];
const PAGE = 60;
const TONE: Record<WarrantyState, { text: string; bar: string; chip: string; label: string; icon: string }> = {
  active: { text: 'text-ok', bar: 'bg-ok', chip: 'border-green-200 bg-ok-soft text-ok', label: 'Free repair active', icon: 'shield' },
  expiring: { text: 'text-[#b45309]', bar: 'bg-[#d97706]', chip: 'border-amber-300 bg-med-soft text-[#b45309]', label: 'Ends soon', icon: 'clock' },
  expired: { text: 'text-crit', bar: 'bg-gray-400', chip: 'border-gray-300 bg-gray-100 text-crit', label: 'Free repair ended', icon: 'x' },
  unknown: { text: 'text-gray-700', bar: 'bg-gray-300', chip: 'border-gray-300 bg-gray-100 text-gray-700', label: 'Warranty unknown', icon: 'info' },
};
const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');

export function RoadDirectory({ cards, wards, origin }: { cards: RoadCard[]; wards: { code: string; name: string }[]; origin: string }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [ward, setWard] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (ward && c.ward_code !== ward) return false;
      if (filter === 'active' && c.state !== 'active' && c.state !== 'expiring') return false;
      if (filter === 'expiring' && c.state !== 'expiring') return false;
      if (filter === 'expired' && c.state !== 'expired') return false;
      if (filter === 'paid' && !c.paidTwice) return false;
      if (!t) return true;
      return c.road_name.toLowerCase().includes(t) || c.road_id.toLowerCase().includes(t) || c.ward_code.toLowerCase() === t || `ward ${c.ward_code}`.toLowerCase() === t;
    });
  }, [cards, q, filter, ward]);
  const count = (f: Filter) => cards.filter((c) => (ward ? c.ward_code === ward : true) && (f === 'all' || (f === 'active' ? c.state === 'active' || c.state === 'expiring' : f === 'paid' ? c.paidTwice > 0 : c.state === f))).length;
  const wardRoads = ward ? cards.filter((c) => c.ward_code === ward) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block">
          <span className="sr-only">Search roads</span>
          <Icon name="zoom" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input className="input min-h-12 pl-10 text-base" type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Road name, ward or road ID (e.g. SV Road, RD0119)" />
        </label>
        <label className="block">
          <span className="sr-only">Ward</span>
          <select className="input min-h-12 text-base" value={ward} onChange={(e) => { setWard(e.target.value); setLimit(PAGE); }}>
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.code} value={w.code}>Ward {w.code} · {w.name}</option>)}
          </select>
        </label>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter roads">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setLimit(PAGE); }}
            className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold ${filter === f.key ? 'border-action bg-action text-white' : 'border-line bg-white text-ink hover:border-action'}`}>
            <Icon name={f.icon} className="h-4 w-4" />{f.label}<span className={`tnum rounded-full px-1.5 text-xs ${filter === f.key ? 'bg-white/20' : 'bg-gray-100 text-muted'}`}>{count(f.key)}</span>
          </button>
        ))}
      </div>

      {ward ? (
        <details className="rounded-2xl border border-action/30 bg-action-soft/40 p-4">
          <summary className="flex cursor-pointer items-center gap-2 font-bold text-action"><Icon name="board" className="h-5 w-5" />Print QR boards for Ward {ward} ({wardRoads.length})</summary>
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {wardRoads.map((c) => <li key={c.road_id}><Link className="underline" href={`/r/${c.road_id}/board`}><span className="font-mono">{c.road_id}</span> · {c.road_name}, seg {c.segment_no}</Link></li>)}
          </ul>
        </details>
      ) : <p className="flex items-center gap-1.5 text-xs text-muted"><Icon name="board" className="h-4 w-4" />Pick a ward to list its printable QR site boards.</p>}

      <p className="tnum text-sm text-muted" aria-live="polite">{list.length} road segment{list.length === 1 ? '' : 's'}</p>
      {list.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, limit).map((c) => <Card key={c.road_id} c={c} origin={origin} />)}
        </ul>
      ) : <p className="rounded-2xl border border-line bg-white p-6 text-center text-sm text-muted">No roads match. Try another name or clear the filters.</p>}
      {list.length > limit ? (
        <div className="text-center"><button type="button" className="btn-secondary" onClick={() => setLimit((n) => n + PAGE)}>Show more ({list.length - limit} left)</button></div>
      ) : null}
    </div>
  );
}

function Card({ c, origin }: { c: RoadCard; origin: string }) {
  const t = TONE[c.state];
  const left = c.daysLeft ?? 0;
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-1)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted"><span className="font-mono">{c.road_id}</span>· Ward {c.ward_code}</div>
        <Link href={`/r/${c.road_id}`} className="mt-0.5 block text-[15px] font-extrabold leading-tight tracking-tight hover:text-action">{c.road_name}<span className="font-semibold text-muted">, seg {c.segment_no}</span></Link>
        <div className="mt-1 text-xs text-muted">{c.surface} · <span className="tnum">{Math.round(c.length_m)} m</span>{c.bus_route ? ' · bus route' : ''}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`chip ${t.chip}`}><Icon name={t.icon} className="h-3.5 w-3.5" />{t.label}</span>
          {c.paidTwice ? <span className="chip border-red-200 bg-crit-soft text-crit"><Icon name="alert" className="h-3.5 w-3.5" />Paid twice? ×{c.paidTwice}</span> : null}
        </div>
        {c.state !== 'unknown' ? (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200" role="img" aria-label={`${Math.round(c.pctUsed ?? 0)}% of the ${c.years}-year free-repair period used`}>
              <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${c.pctUsed ?? 0}%` }} />
            </div>
            <div className={`tnum mt-1 text-[11px] font-semibold ${t.text}`}>
              {c.state === 'expired' ? `Ended ${date(c.expires)}` : `${left.toLocaleString('en-IN')} days left · until ${date(c.expires)}`}
              {c.basis !== 'Dataset flag' ? <span className="font-normal text-muted"> · assumed</span> : null}
            </div>
          </div>
        ) : <div className="mt-2 text-[11px] text-muted">No standard period for this surface</div>}
      </div>
      <Link href={`/r/${c.road_id}`} className="shrink-0 self-start" aria-label={`Open ${c.road_name} segment ${c.segment_no}`}>
        <QrCode value={`${origin}/r/${c.road_id}`} size={76} />
      </Link>
    </li>
  );
}
