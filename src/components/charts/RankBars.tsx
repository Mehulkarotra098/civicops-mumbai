// Ranked horizontal bars: label, a bar on a shared scale, the value with a text label.
// Server component; the bars themselves grow on mount (AnimatedBar).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AnimatedBar, type Tone } from '../Visuals';

export interface RankRow {
  key: string; label: ReactNode; sub?: ReactNode; value: number; display: ReactNode; tone?: Tone; href?: string; aria: string;
  /** Optional second, lighter value drawn behind (e.g. total vs overdue). */
  track?: number;
}

export function RankBars({ rows, max, numbered = true, testId }: { rows: RankRow[]; max?: number; numbered?: boolean; testId?: string }) {
  const scale = Math.max(1, max ?? Math.max(...rows.map((r) => Math.max(r.value, r.track ?? 0)), 1));
  return (
    <ol className="min-w-0 space-y-1" data-testid={testId}>
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-baseline gap-2">
                {numbered ? <span className="w-5 shrink-0 text-right text-xs font-bold text-muted tnum">{i + 1}</span> : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{r.label}</span>
                  {r.sub ? <span className="block truncate text-xs text-muted">{r.sub}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-bold tnum">{r.display}</span>
            </span>
            <span className={`mt-1.5 block ${numbered ? 'pl-7' : ''}`}>
              <AnimatedBar pct={(r.value / scale) * 100} trackPct={r.track != null ? (r.track / scale) * 100 : 100} tone={r.tone ?? 'action'} label={r.aria} height="h-2.5" delayMs={Math.min(i * 40, 500)} />
            </span>
          </>
        );
        return (
          <li key={r.key} className="min-w-0">
            {r.href ? <Link href={r.href} className="block rounded-lg px-2 py-2 hover:bg-surface">{inner}</Link> : <div className="px-2 py-2">{inner}</div>}
          </li>
        );
      })}
    </ol>
  );
}
