// Fair contractor comparison: speed with and without heavy rain, durability against what is
// expected for the repair methods used, and the typical bill against the rate card band.
import { AnimatedBar } from '../Visuals';
import { BandBar } from './BandBar';

export interface FairCard {
  contractor_name: string; jobs: number; sla_met_pct: number; sla_met_pct_outside_heavy_rain: number | null; heavy_rain_jobs: number;
  reopen_pct: number; expected_reopen_pct: number; median_cost_ratio: number;
}

const pc = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export function durabilityWord(c: FairCard) {
  return c.reopen_pct <= c.expected_reopen_pct * 0.9 ? { word: 'Better than expected', cls: 'text-ok', tone: 'ok' as const }
    : c.reopen_pct >= c.expected_reopen_pct * 1.1 ? { word: 'Worse than expected', cls: 'text-crit', tone: 'crit' as const }
      : { word: 'About as expected', cls: 'text-ink', tone: 'action' as const };
}

export function FairBars({ c, large }: { c: FairCard; large?: boolean }) {
  const dur = durabilityWord(c);
  const reopenMax = Math.max(c.reopen_pct, c.expected_reopen_pct, 0.05) * 1.25;
  const h = large ? 'h-3' : 'h-2';
  const row = 'grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-2';
  return (
    <div className={`space-y-4 ${large ? 'text-sm' : 'text-xs'}`}>
      <div>
        <div className="flex items-baseline justify-between gap-2"><span className="font-bold">Speed</span><span className="text-muted">met the time target</span></div>
        <div className="mt-1.5 space-y-1.5">
          <div className={row}><AnimatedBar pct={c.sla_met_pct * 100} tone="action" height={h} label={`All jobs: ${pc(c.sla_met_pct)} met the time target`} /><span className="text-right font-bold tnum">{pc(c.sla_met_pct)}</span></div>
          <div className={row}><AnimatedBar pct={(c.sla_met_pct_outside_heavy_rain ?? 0) * 100} tone="ok" height={h} delayMs={120} label={`Without heavy rain: ${pc(c.sla_met_pct_outside_heavy_rain)} met the time target`} /><span className="text-right font-bold tnum">{pc(c.sla_met_pct_outside_heavy_rain)}</span></div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted"><span><span className="mr-1 inline-block h-2 w-3 rounded-full bg-action align-middle" />All jobs</span><span><span className="mr-1 inline-block h-2 w-3 rounded-full bg-ok align-middle" />Rain-adjusted (no heavy rain; {c.heavy_rain_jobs} rainy jobs left out)</span></div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2"><span className="font-bold">Durability</span><span className={`font-semibold ${dur.cls}`}>{dur.word}</span></div>
        <div className="mt-1.5 space-y-1.5">
          <div className={row}><AnimatedBar pct={(c.reopen_pct / reopenMax) * 100} tone={dur.tone} height={h} label={`Reopened within 30 days: ${pc(c.reopen_pct)}`} /><span className="text-right font-bold tnum">{pc(c.reopen_pct)}</span></div>
          <div className={row}><AnimatedBar pct={(c.expected_reopen_pct / reopenMax) * 100} tone="std" trackTone="std" trackPct={0} height={h} delayMs={120} label={`Expected for the methods used: ${pc(c.expected_reopen_pct)}`} /><span className="text-right text-muted tnum">{pc(c.expected_reopen_pct)}</span></div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted"><span>Top: reopened within 30 days</span><span><span className="mr-1 inline-block h-2 w-3 rounded-full bg-std align-middle" />Expected for the repair methods used</span></div>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2"><span className="font-bold">Typical bill</span><span className={`font-bold tnum ${c.median_cost_ratio > 1.3 ? 'text-crit' : ''}`}>{c.median_cost_ratio.toFixed(2)}× rate card</span></div>
        <div className="mt-1.5"><BandBar compact billed={c.median_cost_ratio} reference={1} ariaLabel={`Median bill is ${c.median_cost_ratio.toFixed(2)} times the rate card; the normal band is 1.0 to 1.3 times`} /></div>
        <div className="mt-1 text-[11px] text-muted"><span className="mr-1 inline-block h-2 w-3 rounded-full bg-action-soft align-middle" />Normal band 1.0× to 1.3×</div>
      </div>
    </div>
  );
}
