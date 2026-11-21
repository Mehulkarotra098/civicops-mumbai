'use client';
// Wards directory map: real Mumbai basemap (OpenStreetMap/CARTO via Leaflet) with the 24 wards
// coloured by a chosen metric. Clicking a ward opens its page.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LiveMap, { type LiveMetric, type LiveWard } from './LiveMap';

export function WardsRealMap({ wards }: { wards: LiveWard[] }) {
  const router = useRouter();
  const [metric, setMetric] = useState<LiveMetric>('utilisation');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Colour wards by">
        {([['utilisation', 'Budget used'], ['flags', 'Flagged bills'], ['openTickets', 'Open tickets']] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${metric === k ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{l}</button>
        ))}
      </div>
      <div className="h-[420px] overflow-hidden rounded-xl border border-line sm:h-[560px]">
        <LiveMap wards={wards} tickets={[]} metric={metric} onSelectWard={(code) => router.push(`/wards/${encodeURIComponent(code)}`)} />
      </div>
    </div>
  );
}
