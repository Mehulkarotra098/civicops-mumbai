'use client';
// Small motion + data-visual building blocks for the public pages: count-up numbers and
// bars that grow on mount. Every motion respects prefers-reduced-motion (final state at once).
import Link from 'next/link';
import { useEffect, useState } from 'react';

export type Tone = 'ok' | 'crit' | 'action' | 'med' | 'std' | 'violet';

const FILL: Record<Tone, string> = {
  ok: 'bg-ok', crit: 'bg-crit', action: 'bg-action', med: 'bg-med-edge', std: 'bg-std', violet: 'bg-violet-600',
};
const TRACK: Record<Tone, string> = {
  ok: 'bg-ok-soft', crit: 'bg-crit-soft', action: 'bg-action-soft', med: 'bg-med-soft', std: 'bg-std-soft', violet: 'bg-violet-50',
};
export const toneFill = (t: Tone) => FILL[t];

/** ₹ with Indian grouping; big numbers in Cr / L. `unitOf` fixes the unit (used while counting up). */
export function formatInr(n: number, unitOf: number = n): string {
  const a = Math.abs(unitOf);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** True one frame after mount, so CSS width transitions run from 0. */
function useMounted(delayMs = 0): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let raf = 0;
    const timer = window.setTimeout(() => { raf = requestAnimationFrame(() => setOn(true)); }, delayMs);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [delayMs]);
  return on;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

export function CountUp({ value, format = 'number', durationMs = 1600, className }: {
  value: number; format?: 'inr' | 'number'; durationMs?: number; className?: string;
}) {
  const fmt = (n: number) => (format === 'inr' ? formatInr(n, value) : formatNumber(n));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || durationMs <= 0) { setShown(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      setShown(value * easeOutCubic(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">{fmt(shown)}</span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

/**
 * A horizontal bar that grows from 0 on mount. `pct` is the fill (0–100, clamped);
 * `trackPct` draws a lighter track behind it (e.g. the budget on a shared scale).
 */
export function AnimatedBar({ pct, tone = 'action', label, href, trackPct, height = 'h-3', delayMs = 0, trackTone }: {
  pct: number; tone?: Tone; label: string; href?: string; trackPct?: number; height?: string; delayMs?: number; trackTone?: Tone;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted(delayMs);
  const fill = Math.max(0, Math.min(100, pct));
  const track = trackPct == null ? 100 : Math.max(0, Math.min(100, trackPct));
  const grow = reduced || mounted;
  const transition = reduced ? 'none' : 'width 1100ms cubic-bezier(.2,.8,.2,1)';
  const bar = (
    <div className={`relative w-full overflow-hidden rounded-full ${height}`} role="img" aria-label={label} title={label}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${TRACK[trackTone ?? tone]}`} style={{ width: `${grow ? track : 0}%`, transition }} />
      <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[tone]}`} style={{ width: `${grow ? fill : 0}%`, transition }} />
    </div>
  );
  return href ? <Link href={href} className="block" aria-label={label}>{bar}</Link> : bar;
}

/** One bar split into labelled segments (each optionally a link). Widths are shares of the total. */
export function SegmentBar({ segments, height = 'h-6' }: {
  segments: { key: string; value: number; tone: Tone; label: string; href?: string }[]; height?: string;
}) {
  const reduced = useReducedMotion();
  const mounted = useMounted(150);
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const grow = reduced || mounted;
  return (
    <div className={`flex w-full gap-0.5 overflow-hidden rounded-full bg-gray-100 ${height}`}>
      {segments.map((s, i) => {
        const w = (s.value / total) * 100;
        const style = { width: `${grow ? Math.max(w, s.value > 0 ? 1.5 : 0) : 0}%`, transition: reduced ? 'none' : `width 1100ms cubic-bezier(.2,.8,.2,1) ${i * 120}ms` };
        const cls = `block h-full ${FILL[s.tone]} hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2`;
        return s.href
          ? <Link key={s.key} href={s.href} className={cls} style={style} aria-label={s.label} title={s.label} />
          : <span key={s.key} className={cls} style={style} role="img" aria-label={s.label} title={s.label} />;
      })}
    </div>
  );
}
