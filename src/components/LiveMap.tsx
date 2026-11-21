'use client';
// Real Mumbai map for the live dashboard. Leaflet is loaded from a CDN at runtime (no npm install),
// and everything degrades: no tiles offline → polygons on a plain background; no Leaflet → a message.
import { useEffect, useRef, useState } from 'react';

export type LiveMetric = 'utilisation' | 'flags' | 'openTickets';
export interface LiveWard {
  code: string; name: string; centroid: [number, number]; polygon: [number, number][];
  budget: number; spend: number; utilisation: number; flags: number; openTickets: number;
}
export interface LiveTicket { ref: string; lat: number; lon: number; priority: string; status: string; title: string; category: string; overdue?: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet comes from a CDN script, so it has no bundled types */
type L = any;
declare global { interface Window { L?: L } }
/* eslint-enable @typescript-eslint/no-explicit-any */

const CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let loader: Promise<L | null> | null = null;
function loadLeaflet(): Promise<L | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (loader) return loader;
  loader = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = CSS;
      document.head.appendChild(link);
    }
    const done = () => resolve(window.L ?? null);
    const timer = window.setTimeout(done, 8000);
    const s = document.createElement('script');
    s.src = JS; s.async = true;
    s.onload = () => { window.clearTimeout(timer); done(); };
    s.onerror = () => { window.clearTimeout(timer); loader = null; resolve(null); };
    document.head.appendChild(s);
  });
  return loader;
}

export const METRIC_LABEL: Record<LiveMetric, string> = { utilisation: 'Budget used', flags: 'Money flags', openTickets: 'Open tickets' };
export function metricText(w: LiveWard, m: LiveMetric) {
  if (m === 'utilisation') return `${Math.round(w.utilisation * 100)}% of budget billed`;
  if (m === 'flags') return `${w.flags} money flag${w.flags === 1 ? '' : 's'}`;
  return `${w.openTickets} open ticket${w.openTickets === 1 ? '' : 's'}`;
}

// teal → amber → red
function scale(t: number) {
  const stops = [[15, 118, 110], [212, 160, 0], [180, 35, 24]];
  const x = Math.max(0, Math.min(1, t)) * 2;
  const i = Math.min(1, Math.floor(x));
  const f = x - i;
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function norm(wards: LiveWard[], m: LiveMetric) {
  if (m === 'utilisation') return (w: LiveWard) => (w.utilisation - 0.5) / 0.7; // 50% → teal, 85% → amber, 120% → red
  const max = Math.max(1, ...wards.map((w) => w[m]));
  return (w: LiveWard) => w[m] / max;
}
function markerColor(t: LiveTicket) {
  if (t.status === 'verified_resolved') return '#067647';
  if (t.priority === 'critical') return '#b42318';
  if (t.priority === 'medium') return '#d4a000';
  return '#d4570b';
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export default function LiveMap({ wards, tickets, metric, selected, onSelectWard }: {
  wards: LiveWard[]; tickets: LiveTicket[]; metric: LiveMetric; selected?: string | null; onSelectWard?: (code: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L>(null);
  const wardLayer = useRef<L>(null);
  const ticketLayer = useRef<L>(null);
  const onSelect = useRef(onSelectWard);
  const [state, setState] = useState<'loading' | 'ready' | 'nolib'>('loading');
  const [tilesOk, setTilesOk] = useState(true);

  useEffect(() => { onSelect.current = onSelectWard; }, [onSelectWard]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let tileTimer = 0;
    loadLeaflet().then((Lf) => {
      if (cancelled || !box.current) return;
      if (!Lf) { setState('nolib'); return; }
      const m = Lf.map(box.current, { center: [19.07, 72.88], zoom: 11, scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      let loaded = false;
      const tiles = Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
      });
      tiles.on('tileload', () => { loaded = true; setTilesOk(true); });
      tiles.addTo(m);
      tileTimer = window.setTimeout(() => { if (!loaded) setTilesOk(false); }, 6000);
      map.current = m;
      wardLayer.current = Lf.layerGroup().addTo(m);
      ticketLayer.current = Lf.layerGroup().addTo(m);
      setState('ready');
    });
    return () => {
      cancelled = true;
      window.clearTimeout(tileTimer);
      if (map.current) { map.current.remove(); map.current = null; }
    };
  }, []);

  // Ward choropleth + labels.
  useEffect(() => {
    const Lf = window.L;
    if (state !== 'ready' || !Lf || !wardLayer.current) return;
    const g = wardLayer.current;
    g.clearLayers();
    const n = norm(wards, metric);
    const bounds: [number, number][] = [];
    for (const w of wards) {
      if (w.polygon.length < 3) continue;
      const latlngs = w.polygon.map(([lon, lat]) => [lat, lon] as [number, number]);
      bounds.push(...latlngs);
      const isSel = selected === w.code;
      const base = { color: isSel ? '#0b1324' : '#ffffff', weight: isSel ? 3 : 1.5, fillColor: scale(n(w)), fillOpacity: 0.55 };
      const poly = Lf.polygon(latlngs, base);
      poly.bindTooltip(`<strong>${esc(w.code)}</strong> · ${esc(w.name)}<br/>${esc(metricText(w, metric))}`, { sticky: true });
      poly.on('mouseover', () => poly.setStyle({ weight: 3, fillOpacity: 0.75, color: '#0b1324' }));
      poly.on('mouseout', () => poly.setStyle(base));
      poly.on('click', () => onSelect.current?.(w.code));
      poly.addTo(g);
      if (w.centroid[0] && w.centroid[1]) {
        Lf.marker(w.centroid, {
          interactive: false, keyboard: false,
          icon: Lf.divIcon({ className: 'livemap-label', html: `<span>${esc(w.code)}</span>`, iconSize: [44, 16], iconAnchor: [22, 8] }),
        }).addTo(g);
      }
    }
    if (bounds.length && !g._fitted) { map.current.fitBounds(bounds, { padding: [10, 10] }); g._fitted = true; }
  }, [state, wards, metric, selected]);

  // Ticket markers.
  useEffect(() => {
    const Lf = window.L;
    if (state !== 'ready' || !Lf || !ticketLayer.current) return;
    const g = ticketLayer.current;
    g.clearLayers();
    for (const t of tickets) {
      if (!Number.isFinite(t.lat) || !Number.isFinite(t.lon)) continue;
      const color = markerColor(t);
      const open = t.status !== 'verified_resolved';
      if (open && (t.priority === 'critical' || t.overdue)) {
        Lf.marker([t.lat, t.lon], {
          interactive: false, keyboard: false,
          icon: Lf.divIcon({ className: 'livemap-pulse-wrap', html: `<span class="livemap-pulse" style="--c:${color}"></span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        }).addTo(g);
      }
      Lf.circleMarker([t.lat, t.lon], { radius: 7, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.95 })
        .bindTooltip(`<strong>${esc(t.ref)}</strong> · ${esc(t.category)}<br/>${esc(t.title)}<br/><em>${esc(t.priority)}${t.overdue ? ' · overdue' : ''}${open ? '' : ' · verified fixed'}</em>`)
        .addTo(g);
    }
  }, [state, tickets]);

  return (
    <div className="relative h-full w-full">
      <style>{`
        .livemap-label span { display:block; text-align:center; font: 700 11px/16px system-ui, sans-serif; color:#0b1324;
          text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; white-space:nowrap; pointer-events:none; }
        .livemap-pulse-wrap { pointer-events:none; }
        .livemap-pulse { position:absolute; inset:0; border-radius:9999px; border:3px solid var(--c); animation: livemap-pulse 1.8s ease-out infinite; }
        @keyframes livemap-pulse { 0% { transform: scale(.35); opacity:.95 } 100% { transform: scale(1.6); opacity:0 } }
        @media (prefers-reduced-motion: reduce) { .livemap-pulse { animation-duration: 4s; } }
        .leaflet-container { background:#e8edf3; font-family: inherit; }
      `}</style>
      <div ref={box} className="h-full w-full overflow-hidden rounded-xl" role="region" aria-label="Map of Mumbai wards with live tickets" />
      <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/85 px-2 py-0.5 text-[11px] text-slate-700">
        Ward boundaries are the dataset&apos;s synthetic approximation.
      </p>
      {state === 'loading' && (
        <div className="absolute inset-0 grid place-items-center rounded-xl bg-slate-800/60 text-sm text-white">Loading map…</div>
      )}
      {state === 'nolib' && (
        <div className="absolute inset-0 grid place-items-center rounded-xl bg-slate-800 p-6 text-center text-sm text-white">
          Map unavailable offline. The ward figures beside and below the map are still live.
        </div>
      )}
      {state === 'ready' && !tilesOk && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-md bg-white/90 px-2 py-1 text-xs font-semibold text-slate-800 shadow">
          Map tiles unavailable offline
        </div>
      )}
    </div>
  );
}
