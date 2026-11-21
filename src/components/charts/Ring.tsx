'use client';
// Budget-used ring: the outer arc fills to the share used (capped at 100%); anything over
// 100% draws as a second, red inner arc. Grows on mount; instant under reduced motion.
import type { ReactNode } from 'react';
import { useMounted, useReducedMotion } from '../Visuals';

export function Ring({ pct, size = 168, label, children, dark }: { pct: number; size?: number; label: string; children?: ReactNode; dark?: boolean }) {
  const reduced = useReducedMotion();
  const on = useMounted(120);
  const grow = reduced || on;
  const stroke = Math.max(10, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const main = Math.max(0, Math.min(100, pct));
  const over = Math.max(0, Math.min(100, pct - 100));
  const r2 = r - stroke - 3;
  const c2 = 2 * Math.PI * r2;
  const tr = reduced ? 'none' : 'stroke-dashoffset 1200ms cubic-bezier(.2,.8,.2,1)';
  const isOver = pct > 100;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={dark ? 'stroke-white/10' : 'stroke-action-soft'} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={isOver ? 'stroke-crit' : dark ? 'stroke-teal-300' : 'stroke-action'}
          strokeDasharray={c} strokeDashoffset={grow ? c * (1 - main / 100) : c} style={{ transition: tr }} />
        {over > 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r2} fill="none" strokeWidth={Math.max(4, stroke / 2.5)} strokeLinecap="round" className={dark ? 'stroke-red-300' : 'stroke-red-400'}
            strokeDasharray={c2} strokeDashoffset={grow ? c2 * (1 - over / 100) : c2} style={{ transition: reduced ? 'none' : 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1) 1000ms' }} />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
