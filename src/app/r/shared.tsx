// Shared pieces for the Road QR pages: absolute origin for QR links, warranty tones and the
// warranty clock (the focal visual). Server-safe: no hooks.
import { headers } from 'next/headers';
import { Icon } from '@/components/icons';
import { ProgressRing, type RingTone } from '@/components/ui';
import { formatDateIST } from '@/lib/time';
import { BASIS_LABEL, WARRANTY_LABEL, type Warranty, type WarrantyState } from '@/lib/roads';

export const FALLBACK_ORIGIN = 'https://civicops-mumbai.vercel.app';

export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host || !/^[A-Za-z0-9.:[\]-]+$/.test(host)) return FALLBACK_ORIGIN;
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() || (/^(localhost|127\.|\[::1\])/.test(host) ? 'http' : 'https');
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

export const reportHref = (id: string) => '/login?next=' + encodeURIComponent(`/report?category=road_damage&road=${id}`);

export const STATE_TONE: Record<WarrantyState, { ring: RingTone; text: string; soft: string; border: string; icon: string; bar: string }> = {
  active: { ring: 'ok', text: 'text-ok', soft: 'bg-ok-soft', border: 'border-green-200', icon: 'shield', bar: 'bg-ok' },
  expiring: { ring: 'med', text: 'text-[#b45309]', soft: 'bg-med-soft', border: 'border-amber-300', icon: 'clock', bar: 'bg-[#d97706]' },
  expired: { ring: 'crit', text: 'text-crit', soft: 'bg-gray-100', border: 'border-gray-300', icon: 'x', bar: 'bg-gray-400' },
  unknown: { ring: 'muted', text: 'text-gray-700', soft: 'bg-gray-100', border: 'border-gray-300', icon: 'info', bar: 'bg-gray-300' },
};

export function StateChip({ state, className = '' }: { state: WarrantyState; className?: string }) {
  const t = STATE_TONE[state];
  return <span className={`chip ${t.soft} ${t.text} ${t.border} ${className}`}><Icon name={t.icon} className="h-3.5 w-3.5" />{WARRANTY_LABEL[state]}</span>;
}

export function BasisChip({ w }: { w: Warranty }) {
  const cls = w.basis === 'Dataset flag' ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : w.basis === 'Unknown' ? 'border-gray-300 bg-gray-50 text-gray-700' : 'border-amber-300 bg-amber-50 text-amber-900';
  return <span className={`chip ${cls}`} title={w.note ?? undefined}><Icon name={w.basis === 'Dataset flag' ? 'list' : 'info'} className="h-3.5 w-3.5" />Basis: {BASIS_LABEL[w.basis]}</span>;
}


/** "Until <date>, defects on this road must be repaired free by <contractor>." */
export function warrantySentence(w: Warranty, contractor: string | null): string {
  const who = contractor ?? 'the contractor who resurfaced it';
  if (w.state === 'unknown') return w.note ?? 'The free-repair period for this road is not known.';
  if (w.state === 'expired') return `The free-repair period ended on ${formatDateIST(w.expires)}. Repairs are now paid from the ward budget.`;
  return `Until ${formatDateIST(w.expires)}, defects on this road must be repaired free by ${who}.`;
}

export function WarrantyClock({ w, contractor, compact = false }: { w: Warranty; contractor: string | null; compact?: boolean }) {
  const t = STATE_TONE[w.state];
  const used = w.pctUsed ?? 0;
  const ringLabel = w.state === 'unknown' ? 'Warranty period unknown' : `${Math.round(used)}% of the ${w.years}-year free-repair period used`;
  return (
    <section aria-labelledby="clock-h" className={`overflow-hidden rounded-2xl border-2 ${t.border} bg-white shadow-[var(--shadow-2)]`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${t.soft}`}>
        <h2 id="clock-h" className="text-xs font-extrabold uppercase tracking-wider text-ink">Warranty clock</h2>
        <StateChip state={w.state} />
      </div>
      <div className="flex items-center gap-4 px-4 pb-3 pt-4">
        <ProgressRing pct={w.state === 'unknown' ? 0 : used} size={compact ? 104 : 120} stroke={compact ? 10 : 12} tone={t.ring} label={ringLabel}>
          {w.state === 'unknown' ? <span className="text-3xl text-gray-500">?</span>
            : <span className="flex flex-col items-center"><span className="text-xl font-extrabold">{Math.round(used)}%</span><span className="text-[10px] font-semibold uppercase tracking-wide text-muted">used</span></span>}
        </ProgressRing>
        <div className="min-w-0 flex-1">
          {w.state === 'active' || w.state === 'expiring' ? (
            <>
              <div className="text-xs font-semibold text-muted">Free repairs left</div>
              <div className={`tnum mt-0.5 flex flex-wrap items-baseline gap-x-2 font-extrabold tracking-tight ${t.text}`}>
                {w.left && w.left.years > 0 ? <span><span className="text-4xl">{w.left.years}</span><span className="text-sm"> y</span></span> : null}
                {w.left && (w.left.years > 0 || w.left.months > 0) ? <span><span className="text-4xl">{w.left.months}</span><span className="text-sm"> m</span></span> : null}
                <span><span className="text-4xl">{w.left?.days ?? 0}</span><span className="text-sm"> d</span></span>
              </div>
              <div className="tnum mt-0.5 text-xs text-muted">{w.daysLeft?.toLocaleString('en-IN')} days in all</div>
            </>
          ) : w.state === 'expired' ? (
            <>
              <div className="text-xs font-semibold text-muted">Expired</div>
              <div className="tnum mt-0.5 text-4xl font-extrabold tracking-tight text-crit">{Math.abs(w.daysLeft ?? 0).toLocaleString('en-IN')}</div>
              <div className="text-sm font-semibold text-gray-700">days ago</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold text-muted">Free-repair period</div>
              <div className="mt-0.5 text-2xl font-extrabold tracking-tight text-gray-700">Unknown</div>
              <div className="text-xs text-muted">No standard period for {w.years == null ? 'this surface' : 'this road'}</div>
            </>
          )}
        </div>
      </div>
      {w.state !== 'unknown' ? (
        <div className="px-4">
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-200" role="img" aria-label={ringLabel}>
            <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${used}%` }} />
          </div>
          <div className="tnum mt-1 flex justify-between text-[11px] text-muted">
            <span>Resurfaced {formatDateIST(w.start)}</span>
            <span className="font-semibold text-ink">{w.state === 'expired' ? 'Ended' : 'Ends'} {formatDateIST(w.expires)}</span>
          </div>
        </div>
      ) : null}
      <div className="space-y-2 px-4 pb-4 pt-3">
        <p className="text-[15px] font-semibold leading-snug text-ink">{warrantySentence(w, contractor)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <BasisChip w={w} />
          {w.years != null ? <span className="chip border-line bg-white text-muted">{w.years}-year standard period (IST dates)</span> : null}
        </div>
        {w.note && w.state !== 'unknown' ? <p className="text-xs text-muted">{w.note}</p> : null}
      </div>
    </section>
  );
}
