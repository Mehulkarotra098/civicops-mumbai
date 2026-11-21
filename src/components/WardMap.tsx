'use client';
// Offline SVG ward map drawn from the repo's synthetic Voronoi boundaries and road lines.
// No tile server: works without network and does not suggest street-level precision.
import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface MapWard { code: string; name: string; polygon: number[][] }
export interface MapPoint { lat: number; lon: number; label: string; tone?: 'crit' | 'med' | 'std' | 'ok' | 'grey' | 'hotspot'; href?: string }
export interface MapRoad { id: string; coords: number[][]; dlp?: boolean }

const TONE: Record<string, string> = { crit: '#b42318', med: '#d4a000', std: '#d4570b', ok: '#067647', grey: '#6b7280', hotspot: '#2563eb' };

export function WardMap({ wards, points = [], roads = [], highlight, pin, onPick, height = 420, label = 'Ward map' }: {
  wards: MapWard[]; points?: MapPoint[]; roads?: MapRoad[]; highlight?: string | null; pin?: { lat: number; lon: number } | null;
  onPick?: (lat: number, lon: number) => void; height?: number; label?: string;
}) {
  const all = useMemo(() => wards.flatMap((w) => w.polygon), [wards]);
  const [minX, minY, maxX, maxY] = useMemo(() => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const [x, y] of all) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    return [a, b, c, d];
  }, [all]);
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const W = 1000, H = ((maxY - minY) / ((maxX - minX) * k)) * W;
  const px = (lon: number) => ((lon - minX) / (maxX - minX)) * W;
  const py = (lat: number) => H - ((lat - minY) / (maxY - minY)) * H;
  const focus = useMemo(() => {
    const w = wards.find((x) => x.code === highlight);
    if (!w) return null;
    const xs = w.polygon.map((p) => px(p[0])), ys = w.polygon.map((p) => py(p[1]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.6;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, wards, W, H]);
  const [zoom, setZoom] = useState(1);
  const base = focus ?? { x: 0, y: 0, w: W, h: H };
  const vb = { w: base.w / zoom, h: base.h / zoom, x: base.x + (base.w - base.w / zoom) / 2, y: base.y + (base.h - base.h / zoom) / 2 };
  const r = vb.w / 120;

  function click(e: React.MouseEvent<SVGSVGElement>) {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return;
    const p = pt.matrixTransform(m.inverse());
    const lon = minX + (p.x / W) * (maxX - minX);
    const lat = minY + ((H - p.y) / H) * (maxY - minY);
    onPick(Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6);
  }

  return (
    <figure className="relative overflow-hidden rounded-xl border border-line bg-[#eef3f7]">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ height, width: '100%', cursor: onPick ? 'crosshair' : 'default' }} onClick={click} role="img" aria-label={label}>
        {wards.map((w) => (
          <g key={w.code}>
            <polygon points={w.polygon.map((p) => `${px(p[0])},${py(p[1])}`).join(' ')} fill={w.code === highlight ? '#ccfbf1' : '#ffffff'} stroke={w.code === highlight ? '#0f766e' : '#94a3b8'} strokeWidth={w.code === highlight ? r / 2.5 : r / 6} />
          </g>
        ))}
        {roads.map((rd) => <polyline key={rd.id} points={rd.coords.map((c) => `${px(c[0])},${py(c[1])}`).join(' ')} fill="none" stroke={rd.dlp ? '#7c3aed' : '#475569'} strokeWidth={r / 4} strokeLinecap="round" />)}
        {wards.map((w) => {
          const cx = w.polygon.reduce((s, p) => s + px(p[0]), 0) / w.polygon.length;
          const cy = w.polygon.reduce((s, p) => s + py(p[1]), 0) / w.polygon.length;
          return <text key={`t${w.code}`} x={cx} y={cy} fontSize={r * 1.6} textAnchor="middle" fill="#334155" fontWeight={700} pointerEvents="none">{w.code}</text>;
        })}
        {points.map((p, i) => {
          const c = <circle cx={px(p.lon)} cy={py(p.lat)} r={p.tone === 'hotspot' ? r * 0.6 : r * 0.8} fill={TONE[p.tone ?? 'std']} stroke="#fff" strokeWidth={r / 5}><title>{p.label}</title></circle>;
          return p.href ? <Link key={i} href={p.href} aria-label={p.label}>{c}</Link> : <g key={i}>{c}</g>;
        })}
        {pin ? (
          <g transform={`translate(${px(pin.lon)},${py(pin.lat)})`} pointerEvents="none">
            <circle r={r * 1.1} fill="#0f766e" stroke="#fff" strokeWidth={r / 4} />
            <circle r={r * 0.35} fill="#fff" />
          </g>
        ) : null}
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button type="button" className="btn-secondary btn-sm bg-white" onClick={() => setZoom((z) => Math.min(8, z * 1.6))} aria-label="Zoom in">+</button>
        <button type="button" className="btn-secondary btn-sm bg-white" onClick={() => setZoom((z) => Math.max(1, z / 1.6))} aria-label="Zoom out">−</button>
      </div>
      <figcaption className="border-t border-line bg-white px-3 py-1.5 text-[11px] text-muted">
        Synthetic ward boundaries (Voronoi approximation from the dataset), not official BMC limits.{onPick ? ' Tap the map to place a pin.' : ''}
      </figcaption>
    </figure>
  );
}
