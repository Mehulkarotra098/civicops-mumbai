// A chart section: kicker + title, legend with text labels, the visual, a caption with
// period, unit, n and source, and the full records table behind a toggle. Server component.
import type { ReactNode } from 'react';
import { Icon } from '../icons';

export interface LegendItem { label: string; swatch: string }
export interface Caption { period?: string; unit?: string; n?: string; source?: string }

export function Legend({ items, dark }: { items: LegendItem[]; dark?: boolean }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-xs ${dark ? 'text-slate-300' : 'text-muted'}`} aria-label="Legend">
      {items.map((l) => (
        <li key={l.label} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-5 shrink-0 rounded-full ${l.swatch}`} aria-hidden="true" />{l.label}</li>
      ))}
    </ul>
  );
}

export function ChartCaption({ c, dark }: { c: Caption; dark?: boolean }) {
  const parts = [c.period && `Period: ${c.period}`, c.unit && `Unit: ${c.unit}`, c.n && `n = ${c.n}`, c.source && `Source: ${c.source}`].filter(Boolean);
  return <p className={`text-[11px] leading-relaxed tnum ${dark ? 'text-slate-400' : 'text-muted'}`}>{parts.join(' · ')}</p>;
}

/** "Show records table (n rows)": the full data stays one tap away. */
export function RecordsToggle({ rows, children, label = 'Show records table', open }: { rows: number; children: ReactNode; label?: string; open?: boolean }) {
  return (
    <details className="group rounded-xl border border-line bg-white" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-semibold text-action [&::-webkit-details-marker]:hidden">
        <Icon name="list" className="h-4 w-4" />{label} <span className="tnum font-normal text-muted">({rows.toLocaleString('en-IN')} {rows === 1 ? 'row' : 'rows'})</span>
        <Icon name="arrowRight" className="ml-auto h-4 w-4 transition-transform group-open:rotate-90" />
      </summary>
      <div className="overflow-x-auto border-t border-line">{children}</div>
    </details>
  );
}

export function ChartCard({ id, kicker, title, intro, legend, caption, aside, children, table, tableRows, testId, kickerClass = '' }: {
  id?: string; kicker?: ReactNode; title: string; intro?: ReactNode; legend?: LegendItem[]; caption?: Caption; aside?: ReactNode;
  children: ReactNode; table?: ReactNode; tableRows?: number; testId?: string; kickerClass?: string;
}) {
  const hid = id ? `${id}-h` : undefined;
  return (
    <section id={id} className="card p-4 sm:p-6" aria-labelledby={hid} data-testid={testId}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker ? <div className={`kicker ${kickerClass}`}>{kicker}</div> : null}
          <h2 id={hid} className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
          {intro ? <div className="mt-1 max-w-3xl text-sm text-muted">{intro}</div> : null}
        </div>
        {aside}
      </div>
      {legend ? <div className="mt-3"><Legend items={legend} /></div> : null}
      <div className="mt-4">{children}</div>
      {caption ? <div className="mt-4"><ChartCaption c={caption} /></div> : null}
      {table ? <div className="mt-3"><RecordsToggle rows={tableRows ?? 0}>{table}</RecordsToggle></div> : null}
    </section>
  );
}
