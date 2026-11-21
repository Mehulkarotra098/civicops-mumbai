'use client';
// Ward explorer: a big Mumbai map with the 24 wards, a searchable keyboard-operable list, and a summary of the
// selected ward. Map and list share one selection, which is kept in the URL (?ward=K%2FW&layer=flags).
// Public data only: ward aggregates, flood hotspots and road repair history; no tickets or reporter details.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import MumbaiMap, { type Choropleth, type ExtraLayer } from './MumbaiMap';
import { formatInr } from './Visuals';

export interface ExplorerWard {
  code: string; name: string; zone: string; office: string; crews: number; centroid: [number, number]; polygon: [number, number][];
  budget: number; spend: number; utilisation: number; jobs: number; flags: number; openTickets: number; criticalOpen: number;
  questioned: number; questionedBills: number; localities: string[]; search: string; hotspots: number;
}
export interface ExplorerHotspot { id: string; name: string; ward: string; lat: number; lon: number; depthCm: number | null; years: number | null }
export interface ExplorerRoad { id: string; name: string; ward: string; dlp: boolean; coords: [number, number][]; jobs: number; reopenRate: number | null }

type Layer = 'utilisation' | 'flags' | 'openTickets' | 'flood' | 'roads';
const LAYERS: { key: Layer; label: string }[] = [
  { key: 'utilisation', label: 'Budget used' }, { key: 'flags', label: 'Flagged bills' }, { key: 'openTickets', label: 'Open tickets' },
  { key: 'flood', label: 'Flood hotspots' }, { key: 'roads', label: 'Road repairs' },
];
const isLayer = (s: string): s is Layer => LAYERS.some((l) => l.key === s);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const reopenColor = (r: number | null) => (r == null ? '#94a3b8' : r >= 0.5 ? '#b42318' : r >= 0.25 ? '#d97706' : '#0f766e');

export function WardsRealMap({ wards, hotspots = [], roads = [], initialWard = '', initialLayer = '', initialQuery = '' }: {
  wards: ExplorerWard[]; hotspots?: ExplorerHotspot[]; roads?: ExplorerRoad[]; initialWard?: string; initialLayer?: string; initialQuery?: string;
}) {
  const [sel, setSel] = useState<string | null>(wards.some((w) => w.code === initialWard) ? initialWard : null);
  const [layer, setLayer] = useState<Layer>(isLayer(initialLayer) ? initialLayer : 'utilisation');
  const [q, setQ] = useState(initialQuery);
  const [active, setActive] = useState(() => Math.max(0, wards.findIndex((w) => w.code === initialWard)));
  const listRef = useRef<HTMLUListElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Keep the selection in the URL without a server round trip.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (sel) p.set('ward', sel); else p.delete('ward');
    if (layer !== 'utilisation') p.set('layer', layer); else p.delete('layer');
    if (q.trim()) p.set('q', q.trim()); else p.delete('q');
    const s = p.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  }, [sel, layer, q]);

  const needle = q.trim().toLowerCase();
  const list = useMemo(() => wards.filter((w) => !needle || w.search.includes(needle)), [wards, needle]);
  const firstNeedle = useRef(true);
  useEffect(() => { if (firstNeedle.current) { firstNeedle.current = false; return; } setActive(0); }, [needle]);
  const ward = sel ? wards.find((w) => w.code === sel) ?? null : null;

  const choropleth = useMemo<Choropleth | null>(() => {
    if (layer === 'flood' || layer === 'roads') return null;
    const values = Object.fromEntries(wards.map((w) => [w.code, w[layer]]));
    if (layer === 'utilisation') return { values, min: 0.5, max: 1.2, label: 'Budget used (billed ÷ budget)', format: pct };
    const max = Math.max(1, ...wards.map((w) => w[layer]));
    return { values, min: 0, max, label: layer === 'flags' ? 'Flagged bills per ward' : 'Open tickets per ward', format: (v) => String(Math.round(v)) };
  }, [wards, layer]);
  const info = useMemo(() => Object.fromEntries(wards.map((w) => [w.code,
    layer === 'flags' ? `${w.flags} flagged bill${w.flags === 1 ? '' : 's'}` : layer === 'openTickets' ? `${w.openTickets} open ticket${w.openTickets === 1 ? '' : 's'}`
      : layer === 'flood' ? `${w.hotspots} flood hotspot${w.hotspots === 1 ? '' : 's'}` : `${pct(w.utilisation)} of budget billed`])), [wards, layer]);
  const extra = useMemo<ExtraLayer[]>(() => [
    { id: 'flood', label: 'Flood hotspots', kind: 'points', color: '#2563eb', visible: layer === 'flood',
      features: hotspots.map((h) => ({ lat: h.lat, lon: h.lon, label: h.name, size: 0.8 + Math.min(4, h.years ?? 0) * 0.15 })),
      legend: [{ color: '#2563eb', label: 'Flood hotspot (bigger = flagged in more years)' }] },
    { id: 'roads', label: 'Road repairs', kind: 'lines', color: '#0f766e', visible: layer === 'roads',
      features: roads.map((r) => ({ coords: r.coords, color: reopenColor(r.reopenRate), label: r.name })),
      legend: [{ color: '#0f766e', label: 'Repairs held' }, { color: '#d97706', label: '25%+ reopened' }, { color: '#b42318', label: '50%+ reopened' }, { color: '#94a3b8', label: 'No repairs' }] },
  ], [hotspots, roads, layer]);

  const shapes = useMemo(() => wards.map((w) => ({ code: w.code, name: w.name, polygon: w.polygon, centroid: [w.centroid[1], w.centroid[0]] as [number, number] })), [wards]);

  function choose(code: string) {
    setSel(code);
    const i = list.findIndex((w) => w.code === code);
    if (i >= 0) setActive(i);
  }
  function onKey(e: React.KeyboardEvent) {
    if (!list.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(list.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(list.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const w = list[active]; if (w) { setSel(w.code); summaryRef.current?.scrollIntoView({ block: 'nearest' }); } }
  }
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const layerRoads = ward ? roads.filter((r) => r.ward === ward.code) : [];
  const roadReopen = layerRoads.filter((r) => r.jobs > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section aria-label="Ward map" className="min-w-0 space-y-2">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Map layer">
          {LAYERS.map((l) => (
            <button key={l.key} type="button" aria-pressed={layer === l.key} onClick={() => setLayer(l.key)}
              className={`min-h-[40px] shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors ${layer === l.key ? 'border-action bg-action text-white' : 'border-gray-300 bg-white text-ink hover:border-action'}`}>{l.label}</button>
          ))}
        </div>
        <div className="h-[55vh] min-h-[320px] overflow-hidden rounded-2xl border border-line shadow-sm lg:h-[max(520px,calc(100vh-230px))]">
          <MumbaiMap wards={shapes} choropleth={choropleth} wardInfo={info} selectedWard={sel} onSelectWard={choose} layers={extra}
            height="100%" ariaLabel="Map of Mumbai's 24 wards. Select a ward to see its summary." />
        </div>
      </section>

      <aside className="min-w-0 space-y-3 rounded-t-3xl border border-line bg-white p-3 shadow-[0_-8px_24px_rgba(11,19,36,0.06)] lg:rounded-2xl lg:shadow-sm">
        <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300 lg:hidden" aria-hidden />
        {ward ? (
          <div ref={summaryRef} className="rounded-xl border border-action/30 bg-action-soft/40 p-3" aria-live="polite" data-testid="ward-summary">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="kicker">{ward.zone} · {ward.office}</div>
                <h2 className="text-xl font-extrabold tracking-tight">Ward {ward.code} <span className="font-semibold text-muted">· {ward.name}</span></h2>
              </div>
              <button type="button" className="min-h-[36px] shrink-0 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-white" onClick={() => setSel(null)} aria-label="Clear the selected ward">Clear</button>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">Budget used</span>
                <span className={`tnum font-bold ${ward.utilisation > 1 ? 'text-crit' : 'text-ink'}`}>{pct(ward.utilisation)}</span>
              </div>
              <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-white ring-1 ring-line" role="img" aria-label={`Billed ${formatInr(ward.spend)} of a ${formatInr(ward.budget)} budget`}>
                <div className={`h-full rounded-full ${ward.utilisation > 1 ? 'bg-crit' : 'bg-action'}`} style={{ width: `${Math.min(100, ward.utilisation * 100)}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted"><span className="tnum">Billed {formatInr(ward.spend)}</span><span className="tnum">Budget {formatInr(ward.budget)}</span></div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white p-2"><dt className="text-[11px] font-semibold text-muted">Questioned</dt><dd className="tnum text-sm font-bold text-amber-700">{formatInr(ward.questioned)}</dd><dd className="tnum text-[11px] text-muted">{ward.questionedBills} bills</dd></div>
              <div className="rounded-lg bg-white p-2"><dt className="text-[11px] font-semibold text-muted">Open tickets</dt><dd className="tnum text-sm font-bold">{ward.openTickets}</dd><dd className="tnum text-[11px] text-crit">{ward.criticalOpen} critical</dd></div>
              <div className="rounded-lg bg-white p-2"><dt className="text-[11px] font-semibold text-muted">Flood spots</dt><dd className="tnum text-sm font-bold text-blue-700">{ward.hotspots}</dd><dd className="tnum text-[11px] text-muted">{roadReopen.length} roads repaired</dd></div>
            </dl>
            {ward.localities.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Localities">
                {ward.localities.slice(0, 8).map((l) => <li key={l} className="rounded-full border border-line bg-white px-2 py-0.5 text-xs">{l}</li>)}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/wards/${encodeURIComponent(ward.code)}`} className="btn-primary btn-sm">Open ward {ward.code}</Link>
              <Link href={`/spending/ward/${encodeURIComponent(ward.code)}`} className="btn-secondary btn-sm">Spending trail</Link>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-surface p-3 text-sm text-muted">Tap a ward on the map, or pick one below, to see its budget, questions and open problems.</p>
        )}

        <form action="/wards" className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (list[0]) choose(list[0].code); }}>
          <input name="q" value={q} onChange={(e) => setQ(e.target.value)} className="input min-w-0 flex-1" placeholder="Search: Juhu, Andheri, अंधेरी, K/W…" aria-label="Search wards"
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); listRef.current?.focus(); } }} />
          <button className="btn-primary shrink-0">Search</button>
        </form>
        <p className="text-xs text-muted"><span className="tnum">{list.length}</span> of <span className="tnum">{wards.length}</span> wards · use ↑ ↓ and Enter in the list</p>
        <ul ref={listRef} role="listbox" tabIndex={0} aria-label="Wards" aria-activedescendant={list[active] ? `ward-opt-${active}` : undefined} onKeyDown={onKey}
          className="max-h-[50vh] space-y-1 overflow-y-auto rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-action lg:max-h-[calc(100vh-520px)] lg:min-h-[180px]">
          {list.map((w, i) => (
            <li key={w.code} id={`ward-opt-${i}`} data-i={i} role="option" aria-selected={sel === w.code} onClick={() => { choose(w.code); }}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${sel === w.code ? 'border-action bg-action-soft/50' : i === active ? 'border-gray-300 bg-surface' : 'border-transparent hover:bg-surface'}`}>
              <span className="tnum w-12 shrink-0 text-base font-extrabold">{w.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{w.name}</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden><span className={`block h-full ${w.utilisation > 1 ? 'bg-crit' : 'bg-action'}`} style={{ width: `${Math.min(100, w.utilisation * 100)}%` }} /></span>
              </span>
              <span className={`tnum shrink-0 text-xs font-semibold ${w.utilisation > 1 ? 'text-crit' : 'text-muted'}`}>{pct(w.utilisation)}</span>
            </li>
          ))}
          {!list.length ? <li className="p-3 text-sm text-muted">No ward matches “{q}”. Try an area name such as Juhu or Dadar.</li> : null}
        </ul>
      </aside>
    </div>
  );
}
