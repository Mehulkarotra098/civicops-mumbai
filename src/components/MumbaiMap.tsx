'use client';
// One Mumbai map for every page: MapLibre GL JS 4.7.1 + OpenFreeMap vector tiles, loaded from a CDN at runtime
// (no npm install, no API key). Wards are a choropleth with code labels, tickets are clustered points coloured by
// priority, extra layers (flood hotspots, roads) toggle from a layer control, and pin mode places a draggable
// marker for reporting. If the library, the style or the tiles fail (or 'load' does not fire within 8 s) the
// offline SVG WardMap is shown instead, so a report is never blocked by the map.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WardMap, type MapPoint, type MapRoad } from './WardMap';

/* eslint-disable @typescript-eslint/no-explicit-any -- MapLibre comes from a CDN script, so it has no bundled types */
type ML = any;
declare global { interface Window { maplibregl?: ML } }
/* eslint-enable @typescript-eslint/no-explicit-any */

const VER = '4.7.1';
const JS = `https://unpkg.com/maplibre-gl@${VER}/dist/maplibre-gl.js`;
const CSS = `https://unpkg.com/maplibre-gl@${VER}/dist/maplibre-gl.css`;
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || 'https://tiles.openfreemap.org/styles/liberty';
export const MUMBAI_BOUNDS: [[number, number], [number, number]] = [[72.77, 18.89], [73.0, 19.28]];
const LOAD_TIMEOUT_MS = 8000;
const SCRIPT_TIMEOUT_MS = 15000; // unpkg can be slow on hackathon wifi; the 8 s map 'load' clock starts once the library is here

let loader: Promise<ML | null> | null = null;
function loadMapLibre(): Promise<ML | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loader) return loader;
  loader = new Promise((resolve) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${JS}"]`);
    const s = existing ?? document.createElement('script');
    const timer = window.setTimeout(() => { loader = null; resolve(window.maplibregl ?? null); }, SCRIPT_TIMEOUT_MS);
    s.addEventListener('load', () => { window.clearTimeout(timer); resolve(window.maplibregl ?? null); });
    s.addEventListener('error', () => { window.clearTimeout(timer); loader = null; resolve(null); });
    if (!existing) { s.src = JS; s.async = true; document.head.appendChild(s); }
  });
  return loader;
}

// ---------------------------------------------------------------- public types
export interface MapWardShape { code: string; name: string; polygon: [number, number][]; centroid?: [number, number] /* [lon, lat] */ }
export type PointTone = 'crit' | 'med' | 'std' | 'ok' | 'grey';
export interface MapTicketPoint { id: string; lat: number; lon: number; priority?: string; status?: string; label: string; href?: string; overdue?: boolean; tone?: PointTone }
export interface Choropleth {
  /** Value per ward code. */
  values: Record<string, number>;
  /** Values at the two ends of the colour scale (clamped). */
  min: number; max: number;
  label: string;
  format?: (v: number) => string;
  /** Colour stops low → high. */
  stops?: string[];
}
export interface ExtraLayer {
  id: string; label: string; kind: 'points' | 'lines';
  features: { lat?: number; lon?: number; coords?: [number, number][]; color?: string; label: string; size?: number }[];
  color: string;
  defaultOn?: boolean;
  /** When set, the page controls visibility and the layer is left out of the in-map control. */
  visible?: boolean;
  legend?: { color: string; label: string }[];
}

export const TONE_COLOR: Record<PointTone, string> = { crit: '#b42318', med: '#d4a000', std: '#d4570b', ok: '#067647', grey: '#6b7280' };
export function toneOf(p: { tone?: PointTone; priority?: string; status?: string }): PointTone {
  if (p.tone) return p.tone;
  if (p.status === 'verified_resolved') return 'ok';
  if (p.priority === 'critical') return 'crit';
  if (p.priority === 'medium') return 'med';
  return 'std';
}
const DEFAULT_STOPS = ['#0f766e', '#d4a000', '#b42318'];
function mix(stops: string[], t: number) {
  const rgb = stops.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const x = Math.max(0, Math.min(1, t)) * (rgb.length - 1);
  const i = Math.min(rgb.length - 2, Math.floor(x));
  const f = x - i;
  const c = rgb[i].map((v, k) => Math.round(v + (rgb[i + 1][k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function centroidOf(w: MapWardShape): [number, number] {
  if (w.centroid && w.centroid[0] && w.centroid[1]) return w.centroid;
  const pts = w.polygon.length > 1 && w.polygon[0][0] === w.polygon[w.polygon.length - 1][0] && w.polygon[0][1] === w.polygon[w.polygon.length - 1][1] ? w.polygon.slice(0, -1) : w.polygon;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
function boundsOf(coords: [number, number][]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [[a, b], [c, d]];
}
function circle(lon: number, lat: number, m: number) {
  const ring: [number, number][] = [];
  const dLat = m / 111320, dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]); }
  return ring;
}
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const EMPTY = { type: 'FeatureCollection', features: [] as unknown[] };

export interface MumbaiMapProps {
  wards: MapWardShape[];
  choropleth?: Choropleth | null;
  /** Short line per ward shown on hover/selection, e.g. "84% of budget billed". */
  wardInfo?: Record<string, string>;
  selectedWard?: string | null;
  onSelectWard?: (code: string) => void;
  points?: MapTicketPoint[];
  onPointClick?: (p: MapTicketPoint) => void;
  pointsLabel?: string;
  layers?: ExtraLayer[];
  /** Pin mode: a draggable marker; taps on the map move it. */
  pinMode?: boolean;
  pin?: { lat: number; lon: number } | null;
  pinAccuracyM?: number | null;
  onPinChange?: (lat: number, lon: number) => void;
  /** Fly here whenever the key changes (e.g. a locality picked from search). */
  focus?: { lat: number; lon: number; zoom?: number; key: string } | null;
  interactive?: boolean;
  /** CSS height of the map box; reserved while loading. */
  height?: number | string;
  caption?: string;
  ariaLabel?: string;
  /** Dark chrome for the projector dashboard. */
  dark?: boolean;
  /** Fit to the selected ward when it changes (default true). */
  flyToSelected?: boolean;
  /** Fit to the ward polygons / points on first load instead of the whole city box. */
  fitTo?: 'mumbai' | 'wards' | 'points' | 'pin';
}

export default function MumbaiMap(props: MumbaiMapProps) {
  const {
    wards, choropleth, wardInfo, selectedWard = null, points, layers = [], pinMode = false, pin = null, pinAccuracyM, focus,
    interactive = true, height = 420, caption = 'Approximate demo boundaries · synthetic data', ariaLabel = 'Map of Mumbai wards', dark = false,
    flyToSelected = true, fitTo = 'mumbai', pointsLabel = 'Tickets',
  } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<ML>(null);
  const marker = useRef<ML>(null);
  const router = useRouter();
  const cb = useRef({ ...props, router });
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hover, setHover] = useState<string | null>(null);
  const [own, setOwn] = useState<Record<string, boolean>>(() => Object.fromEntries(layers.map((l) => [l.id, !!l.defaultOn])));
  const [showPoints, setShowPoints] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => { cb.current = { ...props, router }; });

  const layerOn = (l: ExtraLayer) => (l.visible !== undefined ? l.visible : own[l.id] ?? !!l.defaultOn);
  const controllable = layers.filter((l) => l.visible === undefined);

  // ------------------------------------------------ geojson
  const wardFc = useMemo(() => ({
    type: 'FeatureCollection',
    features: wards.filter((w) => w.polygon.length >= 3).map((w) => {
      const v = choropleth?.values[w.code];
      const t = v == null || !choropleth ? null : (v - choropleth.min) / Math.max(1e-9, choropleth.max - choropleth.min);
      const ring = w.polygon[0][0] === w.polygon[w.polygon.length - 1][0] && w.polygon[0][1] === w.polygon[w.polygon.length - 1][1] ? w.polygon : [...w.polygon, w.polygon[0]];
      return { type: 'Feature', properties: { code: w.code, name: w.name, color: t == null ? '#5eead4' : mix(choropleth?.stops ?? DEFAULT_STOPS, t) }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }),
  }), [wards, choropleth]);
  const labelFc = useMemo(() => ({
    type: 'FeatureCollection',
    features: wards.filter((w) => w.polygon.length >= 3).map((w) => ({ type: 'Feature', properties: { code: w.code }, geometry: { type: 'Point', coordinates: centroidOf(w) } })),
  }), [wards]);
  const pointFc = useMemo(() => ({
    type: 'FeatureCollection',
    features: (points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => {
      const tone = toneOf(p);
      const urgent = tone !== 'ok' && (p.priority === 'critical' || !!p.overdue);
      return { type: 'Feature', properties: { id: p.id, color: TONE_COLOR[tone], urgent: urgent ? 1 : 0, label: p.label }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } };
    }),
  }), [points]);
  const layerFcs = useMemo(() => layers.map((l) => ({
    id: l.id, kind: l.kind,
    fc: {
      type: 'FeatureCollection',
      features: l.features.filter((f) => (l.kind === 'points' ? Number.isFinite(f.lat) && Number.isFinite(f.lon) : (f.coords?.length ?? 0) >= 2)).map((f) => ({
        type: 'Feature', properties: { color: f.color ?? l.color, label: f.label, size: f.size ?? 1 },
        geometry: l.kind === 'points' ? { type: 'Point', coordinates: [f.lon, f.lat] } : { type: 'LineString', coordinates: f.coords },
      })),
    },
  })), [layers]);
  const layerKey = layers.map((l) => `${l.id}:${l.kind}`).join('|');

  // ------------------------------------------------ create the map once
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let m: ML = null;
    loadMapLibre().then((ml) => {
      if (cancelled || !box.current) return;
      if (!ml) { setState('failed'); return; }
      let loaded = false;
      try {
        const sel = cb.current.selectedWard ? cb.current.wards.find((w) => w.code === cb.current.selectedWard) : null;
        const p0 = cb.current.pin;
        const start = sel ? boundsOf(sel.polygon) : null;
        m = new ml.Map({
          container: box.current, style: STYLE, bounds: start ?? MUMBAI_BOUNDS, fitBoundsOptions: { padding: 24 },
          attributionControl: false, interactive, cooperativeGestures: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
          maxBounds: [[72.4, 18.6], [73.4, 19.6]], minZoom: 9, maxZoom: 18,
          ...(p0 && (cb.current.fitTo === 'pin' || (cb.current.pinMode && !start)) ? { center: [p0.lon, p0.lat], zoom: cb.current.fitTo === 'pin' && !cb.current.pinMode ? 15.5 : 15, bounds: undefined } : {}),
        });
      } catch {
        setState('failed'); return;
      }
      map.current = m;
      m.addControl(new ml.AttributionControl({ compact: false, customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>' }), 'bottom-right');
      if (interactive) { m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right'); m.scrollZoom.disable(); m.touchZoomRotate.disableRotation(); }
      timer = window.setTimeout(() => { if (!loaded && !cancelled) setState('failed'); }, LOAD_TIMEOUT_MS);
      m.on('error', () => { if (!loaded && !cancelled) { window.clearTimeout(timer); setState('failed'); } });
      // Scroll zoom only after the user engages with the map, so the page still scrolls past it.
      if (interactive) m.on('click', () => m.scrollZoom.enable());
      m.on('load', () => {
        if (cancelled) return;
        loaded = true; window.clearTimeout(timer);
        const styleLayers: { id: string; type: string }[] = m.getStyle().layers ?? [];
        const firstSymbol = styleLayers.find((l) => l.type === 'symbol')?.id;
        const font = ['Noto Sans Bold'];

        m.addSource('wards', { type: 'geojson', data: EMPTY, promoteId: 'code' });
        m.addSource('ward-labels', { type: 'geojson', data: EMPTY });
        m.addLayer({ id: 'ward-fill', type: 'fill', source: 'wards', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.55, 0.35] } }, firstSymbol);
        m.addLayer({ id: 'ward-line', type: 'line', source: 'wards', paint: { 'line-color': '#ffffff', 'line-width': 1.5 } }, firstSymbol);
        m.addLayer({ id: 'ward-selected', type: 'line', source: 'wards', filter: ['==', ['get', 'code'], ''], paint: { 'line-color': '#0f766e', 'line-width': 4.5 } });
        m.addLayer({ id: 'ward-selected-halo', type: 'line', source: 'wards', filter: ['==', ['get', 'code'], ''], paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-offset': -3 } });

        for (const l of cb.current.layers ?? []) addExtraLayer(m, l);

        m.addLayer({
          id: 'ward-code', type: 'symbol', source: 'ward-labels',
          layout: { 'text-field': ['get', 'code'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 13, 15], 'text-allow-overlap': false, 'text-padding': 1 },
          paint: { 'text-color': '#0b1324', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        });

        m.addSource('pts', { type: 'geojson', data: EMPTY, cluster: true, clusterRadius: 42, clusterMaxZoom: 14, clusterProperties: { urgent: ['+', ['get', 'urgent']] } });
        m.addLayer({ id: 'pts-cluster', type: 'circle', source: 'pts', filter: ['has', 'point_count'],
          paint: { 'circle-color': '#0f1b33', 'circle-opacity': 0.92, 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 40, 25],
            'circle-stroke-color': ['case', ['>', ['get', 'urgent'], 0], '#f04438', '#ffffff'], 'circle-stroke-width': 3 } });
        m.addLayer({ id: 'pts-count', type: 'symbol', source: 'pts', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': font, 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
        m.addLayer({ id: 'pts-halo', type: 'circle', source: 'pts', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'urgent'], 1]],
          paint: { 'circle-color': ['get', 'color'], 'circle-opacity': 0.22, 'circle-radius': 13 } });
        m.addLayer({ id: 'pts-dot', type: 'circle', source: 'pts', filter: ['!', ['has', 'point_count']],
          paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });

        m.addSource('acc', { type: 'geojson', data: EMPTY });
        m.addLayer({ id: 'acc-fill', type: 'fill', source: 'acc', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.12 } });
        m.addLayer({ id: 'acc-line', type: 'line', source: 'acc', paint: { 'line-color': '#0f766e', 'line-width': 1.5, 'line-dasharray': [2, 2] } });

        // Interactions
        let hovered: string | null = null;
        const setHoverState = (code: string | null) => {
          if (hovered) m.setFeatureState({ source: 'wards', id: hovered }, { hover: false });
          hovered = code;
          if (code) m.setFeatureState({ source: 'wards', id: code }, { hover: true });
          setHover(code);
        };
        if (interactive) {
          m.on('mousemove', 'ward-fill', (e: ML) => { const c = e.features?.[0]?.properties?.code; if (c !== hovered) setHoverState(c ?? null); });
          m.on('mouseleave', 'ward-fill', () => setHoverState(null));
          for (const id of ['pts-dot', 'pts-cluster', 'ward-fill']) {
            m.on('mouseenter', id, () => { if (!cb.current.pinMode) m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', id, () => { m.getCanvas().style.cursor = cb.current.pinMode ? 'crosshair' : ''; });
          }
          m.on('click', async (e: ML) => {
            const c = cb.current;
            if (c.pinMode) {
              const ll = e.lngLat;
              marker.current?.setLngLat([ll.lng, ll.lat]);
              c.onPinChange?.(round6(ll.lat), round6(ll.lng));
              return;
            }
            const hit = m.queryRenderedFeatures(e.point, { layers: ['pts-cluster', 'pts-dot'].filter((l) => m.getLayer(l)) });
            const cl = hit.find((f: ML) => f.layer.id === 'pts-cluster');
            if (cl) {
              const zoom = await m.getSource('pts').getClusterExpansionZoom(cl.properties.cluster_id);
              m.easeTo({ center: cl.geometry.coordinates, zoom, duration: reducedMotion() ? 0 : 500 });
              return;
            }
            const pt = hit.find((f: ML) => f.layer.id === 'pts-dot');
            if (pt) {
              const p = (c.points ?? []).find((x) => x.id === pt.properties.id);
              if (p) { if (c.onPointClick) c.onPointClick(p); else if (p.href) c.router.push(p.href); return; }
            }
            const w = m.queryRenderedFeatures(e.point, { layers: ['ward-fill'] })[0];
            if (w) c.onSelectWard?.(w.properties.code);
          });
        }
        if (cb.current.pinMode) m.getCanvas().style.cursor = 'crosshair';
        setState('ready');
      });
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      marker.current?.remove(); marker.current = null;
      if (map.current) { try { map.current.remove(); } catch { /* already gone */ } map.current = null; }
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------ data → sources
  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    m.getSource('wards')?.setData(wardFc);
    m.getSource('ward-labels')?.setData(labelFc);
  }, [state, wardFc, labelFc]);

  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    m.getSource('pts')?.setData(pointFc);
  }, [state, pointFc]);

  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    for (const l of cb.current.layers ?? []) if (!m.getSource(`x-${l.id}`)) addExtraLayer(m, l);
    for (const { id, fc } of layerFcs) m.getSource(`x-${id}`)?.setData(fc);
  }, [state, layerFcs, layerKey]);

  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    for (const l of layers) {
      const vis = layerOn(l) ? 'visible' : 'none';
      for (const suffix of ['', '-label']) if (m.getLayer(`x-${l.id}${suffix}`)) m.setLayoutProperty(`x-${l.id}${suffix}`, 'visibility', vis);
    }
    for (const id of ['pts-cluster', 'pts-count', 'pts-halo', 'pts-dot']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', showPoints ? 'visible' : 'none');
  });

  // ------------------------------------------------ first fit
  const fitted = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m || fitted.current) return;
    fitted.current = true;
    if (selectedWard || (pin && (pinMode || fitTo === 'pin'))) return; // the constructor already framed these
    let b: [[number, number], [number, number]] | null = null;
    if (fitTo === 'wards') b = boundsOf(wards.flatMap((w) => w.polygon));
    else if (fitTo === 'points') b = boundsOf((points ?? []).map((p) => [p.lon, p.lat] as [number, number]));
    if (b) m.fitBounds(b, { padding: 28, duration: 0, maxZoom: 14 });
  }, [state, fitTo, wards, points, selectedWard, pinMode, pin]);

  // ------------------------------------------------ selection
  const lastSel = useRef<string | null>(selectedWard);
  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    const f = ['==', ['get', 'code'], selectedWard ?? ''];
    m.setFilter('ward-selected', f); m.setFilter('ward-selected-halo', f);
    if (lastSel.current === selectedWard) return;
    lastSel.current = selectedWard;
    if (!flyToSelected) return;
    const w = wards.find((x) => x.code === selectedWard);
    const b = w ? boundsOf(w.polygon) : MUMBAI_BOUNDS;
    if (b) m.fitBounds(b, { padding: 36, duration: reducedMotion() ? 0 : 600, maxZoom: 14 });
  }, [state, selectedWard, wards, flyToSelected]);

  // ------------------------------------------------ pin
  useEffect(() => {
    const m = map.current;
    const ml = typeof window !== 'undefined' ? window.maplibregl : null;
    if (state !== 'ready' || !m || !ml) return;
    if (!pin) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      const el = document.createElement('div');
      el.className = 'mm-pin';
      el.setAttribute('aria-label', 'Problem location pin. Drag to adjust.');
      el.innerHTML = '<svg viewBox="0 0 32 44" width="32" height="44" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z" fill="#0f766e" stroke="#fff" stroke-width="2.5"/><circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>';
      marker.current = new ml.Marker({ element: el, anchor: 'bottom', draggable: pinMode }).setLngLat([pin.lon, pin.lat]).addTo(m);
      marker.current.on('dragend', () => { const ll = marker.current.getLngLat(); cb.current.onPinChange?.(round6(ll.lat), round6(ll.lng)); });
    } else {
      marker.current.setLngLat([pin.lon, pin.lat]);
      marker.current.setDraggable(pinMode);
    }
    const inView = m.getBounds().contains([pin.lon, pin.lat]);
    if (!inView || m.getZoom() < 13) m.flyTo({ center: [pin.lon, pin.lat], zoom: Math.max(m.getZoom(), 15), duration: reducedMotion() ? 0 : 600 });
  }, [state, pin, pinMode]);

  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m) return;
    m.getSource('acc')?.setData(pin && pinAccuracyM && pinAccuracyM > 0
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circle(pin.lon, pin.lat, Math.min(pinAccuracyM, 3000))] } }] }
      : EMPTY);
  }, [state, pin, pinAccuracyM]);

  const focusKey = focus?.key;
  useEffect(() => {
    const m = map.current;
    if (state !== 'ready' || !m || !focus) return;
    m.flyTo({ center: [focus.lon, focus.lat], zoom: focus.zoom ?? 15, duration: reducedMotion() ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, focusKey]);

  // ------------------------------------------------ render
  const h = typeof height === 'number' ? `${height}px` : height;
  if (state === 'failed') {
    const fbPoints: MapPoint[] = [
      ...layers.filter((l) => l.kind === 'points' && layerOn(l)).flatMap((l) => l.features.map((f) => ({ lat: f.lat as number, lon: f.lon as number, label: f.label, tone: 'hotspot' as const }))),
      ...(points ?? []).map((p) => ({ lat: p.lat, lon: p.lon, label: p.label, href: p.href, tone: toneOf(p) })),
    ];
    const fbRoads: MapRoad[] = layers.filter((l) => l.kind === 'lines' && layerOn(l)).flatMap((l) => l.features.map((f, i) => ({ id: `${l.id}-${i}`, coords: f.coords ?? [] })));
    const numericH = typeof height === 'number' ? height : 360;
    return (
      <div className="space-y-2" data-testid="map-fallback">
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Map unavailable — use the ward list or locality search
        </p>
        {wards.some((w) => w.polygon.length >= 3) ? <WardMap wards={wards.map((w) => ({ code: w.code, name: w.name, polygon: w.polygon }))} points={fbPoints} roads={fbRoads}
          highlight={selectedWard} pin={pin} height={Math.max(200, numericH - 70)} label={ariaLabel}
          onPick={pinMode ? (lat, lon) => cb.current.onPinChange?.(lat, lon) : undefined} /> : pin ? <p className="tnum text-xs text-muted">Location: {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</p> : null}
      </div>
    );
  }

  const info = hover ?? selectedWard;
  const infoWard = info ? wards.find((w) => w.code === info) : null;
  const legendLayers = layers.filter((l) => layerOn(l));
  const chrome = dark ? 'bg-[#0f1b33]/90 text-white border-white/15' : 'bg-white/95 text-ink border-line';
  return (
    <div className="mm relative w-full overflow-hidden rounded-xl" style={{ height: h }} data-testid="mumbai-map">
      <style>{`
        .mm .maplibregl-ctrl-attrib { font-size: 10px; background: rgba(255,255,255,.86); }
        .mm .maplibregl-ctrl-attrib a { color: #334155; }
        .mm .maplibregl-ctrl-group button { width: 34px; height: 34px; }
        .mm-pin { cursor: grab; filter: drop-shadow(0 3px 4px rgba(11,19,36,.35)); }
        .mm-pin:active { cursor: grabbing; }
        @keyframes mm-shimmer { from { background-position: -400px 0 } to { background-position: 400px 0 } }
        .mm-skel { background: linear-gradient(90deg, #e6ecef 0%, #f3f6f7 50%, #e6ecef 100%); background-size: 800px 100%; animation: mm-shimmer 1.4s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .mm-skel { animation: none; } }
      `}</style>
      <div className="absolute inset-0"><div ref={box} className="h-full w-full" role="region" aria-label={ariaLabel} /></div>
      {state === 'loading' && (
        <div className="mm-skel absolute inset-0 grid place-items-center" aria-busy="true">
          <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow">Loading Mumbai map…</span>
        </div>
      )}
      <p className={`pointer-events-none absolute left-2 top-2 max-w-[calc(100%-5.5rem)] truncate rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-sm ${chrome}`} title={caption}>{caption}</p>

      {state === 'ready' && infoWard && interactive && !pinMode ? (
        <div className={`pointer-events-none absolute left-2 top-9 max-w-[70%] rounded-lg border px-2.5 py-1.5 text-xs shadow ${chrome}`} aria-live="polite">
          <div className="font-bold"><span className="tnum">{infoWard.code}</span> · {infoWard.name}</div>
          {wardInfo?.[infoWard.code] ? <div className="tnum opacity-80">{wardInfo[infoWard.code]}</div> : null}
        </div>
      ) : null}

      {state === 'ready' && controllable.length > 0 ? (
        <div className="absolute right-2 top-2">
          <button type="button" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}
            className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold shadow ${chrome}`}>Layers</button>
          {panelOpen ? (
            <div className={`mt-1 w-48 rounded-lg border p-2 text-xs shadow-lg ${chrome}`} role="group" aria-label="Map layers">
              {points && points.length ? (
                <label className="flex min-h-[32px] items-center gap-2"><input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} /> {pointsLabel}</label>
              ) : null}
              {controllable.map((l) => (
                <label key={l.id} className="flex min-h-[32px] items-center gap-2">
                  <input type="checkbox" checked={layerOn(l)} onChange={(e) => setOwn((o) => ({ ...o, [l.id]: e.target.checked }))} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} aria-hidden /> {l.label}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {state === 'ready' && (choropleth || legendLayers.length) ? (
        <div className={`absolute bottom-12 left-2 max-w-[calc(100%-3.5rem)] rounded-lg sm:bottom-7 md:bottom-2 md:max-w-[calc(100%-7rem)] border px-2.5 py-1.5 text-[11px] shadow ${chrome}`}>
          {choropleth ? (
            <div>
              <div className="font-semibold">{choropleth.label}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="tnum">{choropleth.format ? choropleth.format(choropleth.min) : choropleth.min}</span>
                <span className="inline-block h-2 w-16 rounded sm:w-24" style={{ background: `linear-gradient(90deg,${(choropleth.stops ?? DEFAULT_STOPS).join(',')})`, opacity: 0.8 }} aria-hidden />
                <span className="tnum">{choropleth.format ? choropleth.format(choropleth.max) : choropleth.max}</span>
              </div>
            </div>
          ) : null}
          {legendLayers.map((l) => (
            <div key={l.id} className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {(l.legend ?? [{ color: l.color, label: l.label }]).map((x) => (
                <span key={x.label} className="flex items-center gap-1">
                  <span className={l.kind === 'lines' ? 'h-1 w-3 rounded' : 'h-2.5 w-2.5 rounded-full'} style={{ background: x.color }} aria-hidden />{x.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function addExtraLayer(m: ML, l: ExtraLayer) {
  const src = `x-${l.id}`;
  if (m.getSource(src)) return;
  m.addSource(src, { type: 'geojson', data: EMPTY });
  const before = m.getLayer('ward-code') ? 'ward-code' : undefined;
  if (l.kind === 'lines') {
    m.addLayer({ id: src, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6], 'line-opacity': 0.9 } }, before);
  } else {
    m.addLayer({ id: src, type: 'circle', source: src,
      paint: { 'circle-color': ['get', 'color'], 'circle-opacity': 0.85, 'circle-radius': ['*', ['get', 'size'], ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 10]],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 } }, before);
  }
}
