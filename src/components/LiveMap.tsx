'use client';
// Live ward map: the shared MumbaiMap (MapLibre + OpenFreeMap) with the wards coloured by one metric and
// live tickets clustered on top. Kept as its own component so existing pages keep their props.
import { useMemo } from 'react';
import MumbaiMap, { type Choropleth, type MapTicketPoint } from './MumbaiMap';

export type LiveMetric = 'utilisation' | 'flags' | 'openTickets';
export interface LiveWard {
  code: string; name: string; centroid: [number, number]; polygon: [number, number][];
  budget: number; spend: number; utilisation: number; flags: number; openTickets: number;
}
export interface LiveTicket { ref: string; lat: number; lon: number; priority: string; status: string; title: string; category: string; overdue?: boolean }

export const METRIC_LABEL: Record<LiveMetric, string> = { utilisation: 'Budget used', flags: 'Money flags', openTickets: 'Open tickets' };
export function metricText(w: LiveWard, m: LiveMetric) {
  if (m === 'utilisation') return `${Math.round(w.utilisation * 100)}% of budget billed`;
  if (m === 'flags') return `${w.flags} money flag${w.flags === 1 ? '' : 's'}`;
  return `${w.openTickets} open ticket${w.openTickets === 1 ? '' : 's'}`;
}

/** Colour scale for a metric: budget used runs 50% (teal) → 85% (amber) → 120% (red); counts run 0 → max. */
export function choroplethFor(wards: LiveWard[], m: LiveMetric): Choropleth {
  const values = Object.fromEntries(wards.map((w) => [w.code, m === 'utilisation' ? w.utilisation : w[m]]));
  if (m === 'utilisation') return { values, min: 0.5, max: 1.2, label: 'Budget used (billed ÷ budget)', format: (v) => `${Math.round(v * 100)}%` };
  const max = Math.max(1, ...wards.map((w) => w[m]));
  return { values, min: 0, max, label: m === 'flags' ? 'Money flags per ward' : 'Open tickets per ward', format: (v) => String(Math.round(v)) };
}

export function ticketPoints(tickets: LiveTicket[]): MapTicketPoint[] {
  return tickets.map((t) => ({
    id: t.ref, lat: t.lat, lon: t.lon, priority: t.priority, status: t.status, overdue: t.overdue,
    label: `${t.ref} · ${t.category} · ${t.title}${t.overdue ? ' · overdue' : ''}`,
  }));
}

export default function LiveMap({ wards, tickets, metric, selected, onSelectWard, dark = true, height = '100%' }: {
  wards: LiveWard[]; tickets: LiveTicket[]; metric: LiveMetric; selected?: string | null; onSelectWard?: (code: string) => void;
  dark?: boolean; height?: number | string;
}) {
  const shapes = useMemo(() => wards.map((w) => ({ code: w.code, name: w.name, polygon: w.polygon, centroid: w.centroid[0] && w.centroid[1] ? [w.centroid[1], w.centroid[0]] as [number, number] : undefined })), [wards]);
  const choropleth = useMemo(() => choroplethFor(wards, metric), [wards, metric]);
  const info = useMemo(() => Object.fromEntries(wards.map((w) => [w.code, metricText(w, metric)])), [wards, metric]);
  const points = useMemo(() => ticketPoints(tickets), [tickets]);
  return (
    <MumbaiMap wards={shapes} choropleth={choropleth} wardInfo={info} selectedWard={selected ?? null} onSelectWard={onSelectWard}
      points={points} dark={dark} fitTo="wards" height={height} ariaLabel="Map of Mumbai wards with live tickets" />
  );
}
