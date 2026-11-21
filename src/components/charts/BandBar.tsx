'use client';
// Bill vs rate card on one scale: the teal zone is the normal band (1.0× to 1.3× the rate-card
// estimate); the bar is the bill. Red when the bill is above the band. Grows on mount.
import { useMounted, useReducedMotion } from '../Visuals';

const rs = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export function BandBar({ billed, reference, bandMax = 1.3, compact, dark, ariaLabel }: { billed: number; reference: number; bandMax?: number; compact?: boolean; dark?: boolean; ariaLabel?: string }) {
  const reduced = useReducedMotion();
  const on = useMounted(150);
  const grow = reduced || on;
  const band = reference * bandMax;
  const max = Math.max(billed, band) * 1.08 || 1;
  const p = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  // Keep tick labels inside the bar at the edges (no sideways overflow on phones).
  const anchor = (v: number) => { const x = (v / max) * 100; return x > 65 ? '-translate-x-full' : x < 30 ? '' : '-translate-x-1/2'; };
  const over = billed > band;
  const label = ariaLabel ?? `Billed ${rs(billed)}; rate-card estimate ${rs(reference)}; normal band up to ${rs(band)} (${bandMax}×). ${over ? `${rs(billed - band)} above the band.` : 'Within the band.'}`;
  const h = compact ? 'h-4' : 'h-9';
  const barH = compact ? 'h-2' : 'h-4';
  const muted = dark ? 'text-slate-300' : 'text-muted';
  return (
    <div role="img" aria-label={label}>
      {!compact ? (
        <div className={`relative mb-1 h-4 text-[11px] font-semibold ${dark ? 'text-teal-300' : 'text-action'}`} aria-hidden="true">
          <span className={`absolute whitespace-nowrap tnum ${anchor(reference)}`} style={{ left: p(reference) }}>Rate card {rs(reference)}</span>
        </div>
      ) : null}
      <div className={`relative w-full overflow-hidden rounded-lg ${h} ${dark ? 'bg-white/10' : 'bg-gray-100'}`} aria-hidden="true">
        <span className={`absolute inset-y-0 ${dark ? 'bg-teal-300/25' : 'bg-action-soft'}`} style={{ left: p(reference), width: `calc(${p(band)} - ${p(reference)})` }} />
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full ${barH} ${over ? 'bg-crit' : 'bg-ok'}`}
          style={{ width: grow ? p(billed) : '0%', transition: reduced ? 'none' : 'width 1200ms cubic-bezier(.2,.8,.2,1)' }} />
        <span className={`absolute inset-y-0 w-0.5 ${dark ? 'bg-teal-300' : 'bg-action'}`} style={{ left: p(reference) }} />
        <span className={`absolute inset-y-0 w-0.5 ${dark ? 'bg-slate-300' : 'bg-slate-500'}`} style={{ left: p(band) }} />
      </div>
      {!compact ? (
        <div className={`relative mt-1 h-4 text-[11px] font-semibold ${muted}`} aria-hidden="true">
          <span className={`absolute whitespace-nowrap tnum ${anchor(band)}`} style={{ left: p(band) }}>{bandMax}× band top {rs(band)}</span>
        </div>
      ) : null}
    </div>
  );
}
