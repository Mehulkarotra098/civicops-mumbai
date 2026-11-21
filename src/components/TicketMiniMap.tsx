'use client';
// Small, read-only map for a ticket's location: the pin, its ward outline, and the streets around it.
import { useMemo } from 'react';
import MumbaiMap from './MumbaiMap';

export default function TicketMiniMap({ lat, lon, wardCode, wardPolygon, height = 200 }: {
  lat: number; lon: number; wardCode?: string | null; wardPolygon?: [number, number][]; height?: number;
}) {
  const wards = useMemo(() => (wardPolygon && wardPolygon.length >= 3 ? [{ code: wardCode ?? '', name: wardCode ? `Ward ${wardCode}` : 'Ward', polygon: wardPolygon }] : []), [wardCode, wardPolygon]);
  const pin = useMemo(() => ({ lat, lon }), [lat, lon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return (
    <MumbaiMap wards={wards} pin={pin} fitTo="pin" interactive={false} height={height} selectedWard={null}
      caption={wardCode ? `Ward ${wardCode} · approximate demo boundary` : 'Approximate demo boundaries · synthetic data'}
      ariaLabel={`Map of the reported location${wardCode ? ` in ward ${wardCode}` : ''}`} />
  );
}
export { TicketMiniMap };
