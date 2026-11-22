// Share preview for one road: name, ward, the free-repair clock and the "paid twice?" count, 1200x630.
import { ImageResponse } from 'next/og';
import { getDb, withSystem } from '@/lib/db';
import { roadProfile } from '@/lib/roads';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Road QR: free-repair guarantee and spending for this road';

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = /^[A-Za-z0-9_-]{1,32}$/.test(id) ? await withSystem((q) => roadProfile(q, id), await getDb()).catch(() => null) : null;
  const road = p?.road;
  const w = p?.warranty;
  const state = w?.state ?? 'unknown';
  const tone = state === 'active' ? '#34d399' : state === 'expiring' ? '#fbbf24' : state === 'expired' ? '#f87171' : '#94a3b8';
  const big = !w?.expires ? 'Guarantee unknown' : state === 'expired' ? 'Free repairs ended' : 'Free repairs until';
  const date = w?.expires ? fmt(w.expires) : '';
  const left = w?.daysLeft != null && w.daysLeft > 0 ? `${w.daysLeft.toLocaleString('en-IN')} days left` : w?.daysLeft != null ? `${Math.abs(w.daysLeft).toLocaleString('en-IN')} days ago` : '';
  const paidTwice = p?.paidTwice?.length ?? 0;
  const pct = Math.max(0, Math.min(100, Math.round(w?.pctUsed ?? 0)));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 64px', color: '#fff',
        background: 'linear-gradient(125deg, #0b1324 0%, #17264a 70%, #134e4a 100%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#5eead4', fontWeight: 700 }}>ROAD QR · CIVICOPS MUMBAI</div>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 800, marginTop: 14, lineHeight: 1.05 }}>{road ? road.road_name : 'Road not found'}</div>
          <div style={{ display: 'flex', fontSize: 28, color: '#cbd5e1', marginTop: 10 }}>
            {road ? `Segment ${road.segment_no} · Ward ${road.ward_code} · ${road.surface}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 30, color: '#cbd5e1' }}>{big}</div>
            <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, color: tone }}>{date || '—'}</div>
            <div style={{ display: 'flex', marginTop: 16, width: 560, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.15)' }}>
              <div style={{ display: 'flex', width: `${pct}%`, height: 18, borderRadius: 9, background: tone }} />
            </div>
            <div style={{ display: 'flex', fontSize: 24, color: '#94a3b8', marginTop: 10 }}>{left ? `${left} · ${pct}% of the period used` : ''}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {paidTwice > 0 ? (
              <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#fecaca', background: 'rgba(239,68,68,0.22)', border: '2px solid rgba(248,113,113,0.6)', borderRadius: 18, padding: '12px 22px' }}>
                {`Paid twice? ${paidTwice} bill${paidTwice === 1 ? '' : 's'}`}
              </div>
            ) : null}
            <div style={{ display: 'flex', fontSize: 24, color: '#94a3b8', marginTop: 18 }}>Scan · see the money · report a problem</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
