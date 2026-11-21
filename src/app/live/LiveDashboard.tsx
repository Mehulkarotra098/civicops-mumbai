'use client';
// Projector-friendly live view. Polls /api/live every 10 s; numbers count up, new activity slides in.
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveMetric, LiveTicket, LiveWard } from '@/components/LiveMap';
import { METRIC_LABEL } from '@/components/LiveMap';

const LiveMap = dynamic(() => import('@/components/LiveMap'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center rounded-xl bg-slate-800/60 text-sm text-white">Loading map…</div>,
});

interface FeedItem { at: string; kind: 'ticket' | 'case'; ref: string; ward: string; type: string; text: string; title?: string }
interface LiveData {
  now: string;
  kpis: {
    openTickets: number; criticalOpen: number; overdue: number; escalated: number; verifiedToday: number; avgFirstActionMinutes: number | null;
    casesOpen: number; casesOverdue: number; casesDecided: number; amountQuestioned: number; billed: number; budget: number;
    questionedWorkOrders?: number; period?: string;
  };
  wards: LiveWard[]; tickets: LiveTicket[]; feed: FeedItem[];
  byCategory: { category: string; n: number }[];
  trend?: TrendDay[];
  officeQuestions?: { office: string; open: number; overdue: number }[];
  slaDonut: { onTrack: number; dueSoon: number; overdue: number; met: number; breached: number };
}

// ---------------------------------------------------------------- formatting
function inrShort(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
const intFmt = (n: number) => Math.round(n).toLocaleString('en-IN');
function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
const clock = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
interface TrendDay { day: string; open: number; working: number; checking: number; verified: number; other: number }

// ---------------------------------------------------------------- animated number
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e;
      setV(cur);
      from.current = cur;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function KpiTile({ label, value, money, tone, sub, upIsBad = true }: { label: string; value: number | null; money?: boolean; tone?: 'crit' | 'ok' | 'med'; sub?: string; upIsBad?: boolean }) {
  const shown = useCountUp(value ?? 0);
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    if (value == null) return;
    if (prev.current != null && prev.current !== value) {
      const up = value > prev.current;
      setFlash(up === upIsBad ? 'up' : 'down');
      const t = window.setTimeout(() => setFlash(''), 1600);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value, upIsBad]);
  const toneCls = tone === 'crit' ? 'text-red-300' : tone === 'ok' ? 'text-emerald-300' : tone === 'med' ? 'text-amber-300' : 'text-white';
  const flashCls = flash === 'up' ? 'live-flash-bad' : flash === 'down' ? 'live-flash-good' : '';
  return (
    <div className={`min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors ${flashCls}`}>
      <div className="text-xs font-semibold leading-tight text-slate-300">{label}</div>
      <div className={`tnum mt-1 whitespace-nowrap text-[clamp(1.35rem,1.75vw,1.875rem)] font-extrabold leading-none tracking-tight tabular-nums ${toneCls}`}>
        {value == null ? '—' : money ? inrShort(shown) : intFmt(shown)}
      </div>
      {sub && <div className="tnum mt-1 truncate text-[11px] text-slate-400" title={sub}>{sub}</div>}
      {flash && <span className="sr-only">{label} changed</span>}
    </div>
  );
}

// ---------------------------------------------------------------- charts
function BudgetBars({ wards }: { wards: LiveWard[] }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(t); }, []);
  const top = [...wards].sort((a, b) => b.spend - a.spend).slice(0, 12);
  const max = Math.max(1, ...top.map((w) => Math.max(w.budget, w.spend)));
  return (
    <ol className="grid gap-x-6 gap-y-2.5 lg:grid-cols-2" aria-label="Budget versus billed for the 12 wards with the highest spend">
      {top.map((w, i) => {
        const over = w.spend > w.budget && w.budget > 0;
        const pct = w.budget ? Math.round((w.spend / w.budget) * 100) : 0;
        return (
          <li key={w.code} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2" title={`${w.code} ${w.name}: budget ${inrShort(w.budget)}, billed ${inrShort(w.spend)} (${pct}%)`}>
            <span className="tnum text-sm font-bold text-slate-200">{w.code}</span>
            <span className="space-y-0.5" aria-hidden>
              <span className="block h-1.5 rounded bg-slate-600 transition-[width] duration-700 motion-reduce:transition-none" style={{ width: on ? `${(w.budget / max) * 100}%` : 0 }} />
              <span className={`block h-2 rounded transition-[width] duration-700 motion-reduce:transition-none ${over ? 'bg-red-500' : 'bg-teal-400'}`} style={{ width: on ? `${(w.spend / max) * 100}%` : 0, transitionDelay: `${i * 40}ms` }} />
            </span>
            <span className={`tnum whitespace-nowrap text-right text-xs ${over ? 'font-semibold text-red-300' : 'text-slate-200'}`}>{inrShort(w.spend)} · {pct}%{over ? ' over' : ''}</span>
          </li>
        );
      })}
    </ol>
  );
}

const DONUT = [
  { key: 'onTrack', label: 'Open, on track', color: '#2dd4bf' },
  { key: 'dueSoon', label: 'Open, due soon', color: '#facc15' },
  { key: 'overdue', label: 'Open, overdue', color: '#f04438' },
  { key: 'met', label: 'Closed, deadline met', color: '#22c55e' },
  { key: 'breached', label: 'Closed, deadline missed', color: '#a855f7' },
] as const;
function Donut({ d }: { d: LiveData['slaDonut'] }) {
  const total = DONUT.reduce((s, x) => s + d[x.key], 0);
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`Deadline health of ${total} tickets`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#1e293b" strokeWidth="18" />
        {total > 0 && DONUT.map((x) => {
          const len = (d[x.key] / total) * C;
          const el = (
            <circle key={x.key} cx="70" cy="70" r={R} fill="none" stroke={x.color} strokeWidth="18"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dasharray 800ms ease, stroke-dashoffset 800ms ease' }} />
          );
          acc += len;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" fill="#fff" fontSize="24" fontWeight="700">{total}</text>
        <text x="70" y="86" textAnchor="middle" fill="#94a3b8" fontSize="10">tickets</text>
      </svg>
      <ul className="w-full space-y-1.5 text-sm">
        {DONUT.map((x) => (
          <li key={x.key} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: x.color }} aria-hidden />
            <span className="flex-1 text-slate-300">{x.label}</span>
            <span className="font-mono font-semibold tabular-nums text-white">{d[x.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryBars({ rows }: { rows: LiveData['byCategory'] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.category}>
          <div className="flex justify-between text-sm"><span className="text-slate-300">{r.category}</span><span className="font-mono font-semibold text-white">{r.n}</span></div>
          <div className="mt-1 h-2 rounded bg-slate-800">
            <div className="h-2 rounded bg-teal-400 transition-[width] duration-700" style={{ width: `${(r.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {!rows.length && <li className="text-sm text-slate-400">No reports yet.</li>}
    </ul>
  );
}

// ---------------------------------------------------------------- feed
function Feed({ items, now }: { items: FeedItem[]; now: number }) {
  const seen = useRef<Set<string> | null>(null);
  const keyOf = (f: FeedItem) => `${f.kind}|${f.ref}|${f.type}|${f.at}`;
  const first = seen.current == null;
  const fresh = new Set(first ? [] : items.map(keyOf).filter((k) => !seen.current!.has(k)));
  useEffect(() => { seen.current = new Set(items.map(keyOf)); }, [items]);
  return (
    <ol aria-live="polite" aria-relevant="additions" className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 440 }}>
      {items.map((f) => {
        const k = keyOf(f);
        const bad = /Escalated|overdue|missed|correction required/i.test(f.text);
        const good = /verified|accepted|Correction verified/i.test(f.text);
        const dot = bad ? 'bg-red-500' : good ? 'bg-emerald-400' : f.kind === 'case' ? 'bg-violet-400' : 'bg-teal-400';
        return (
          <li key={k} className={`flex gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5 ${fresh.has(k) ? 'live-slide' : ''}`}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-semibold ${bad ? 'text-red-300' : 'text-white'}`}>{f.text}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{ago(f.at, now)}</span>
              </div>
              <div className="truncate text-xs text-slate-400">
                <span className="mr-1 rounded bg-white/10 px-1 text-[10px] font-semibold uppercase text-slate-200">{f.kind === 'case' ? 'Spending' : 'Ticket'}</span>
                {f.kind === 'case'
                  ? <Link href={`/spending/case/${encodeURIComponent(f.ref)}`} className="font-mono text-teal-300 underline-offset-2 hover:underline">{f.ref}</Link>
                  : <span className="font-mono text-slate-200">{f.ref}</span>}
                {f.ward && <> · {f.ward}</>}
                {f.title && <> · {f.title}</>}
              </div>
            </div>
          </li>
        );
      })}
      {!items.length && <li className="text-sm text-slate-400">No activity yet.</li>}
    </ol>
  );
}

function WardCard({ w, onClose }: { w: LiveWard; onClose: () => void }) {
  const over = w.utilisation > 1;
  return (
    <div className="live-slide mb-3 rounded-xl border border-teal-400/40 bg-teal-400/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-200">Ward {w.code}</div>
          <div className="text-lg font-bold text-white">{w.name}</div>
        </div>
        <button type="button" onClick={onClose} className="rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10" aria-label="Close ward details">Close</button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-[11px] text-slate-400">Budget</dt><dd className="font-mono font-semibold text-white">{inrShort(w.budget)}</dd></div>
        <div><dt className="text-[11px] text-slate-400">Billed</dt><dd className={`font-mono font-semibold ${over ? 'text-red-300' : 'text-white'}`}>{inrShort(w.spend)} ({Math.round(w.utilisation * 100)}%)</dd></div>
        <div><dt className="text-[11px] text-slate-400">Money flags</dt><dd className="font-mono font-semibold text-white">{w.flags}</dd></div>
        <div><dt className="text-[11px] text-slate-400">Open tickets</dt><dd className="font-mono font-semibold text-white">{w.openTickets}</dd></div>
      </dl>
      <Link href={`/spending/ward/${encodeURIComponent(w.code)}`} className="mt-2 inline-block text-sm font-semibold text-teal-300 underline underline-offset-2">
        Open the {w.code} spending trail →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- trend + offices
const TREND = [
  { key: 'open', label: 'Open', color: '#f59e0b' },
  { key: 'working', label: 'Work started', color: '#38bdf8' },
  { key: 'checking', label: 'Awaiting check', color: '#a78bfa' },
  { key: 'verified', label: 'Verified fixed', color: '#22c55e' },
  { key: 'other', label: 'Closed other way', color: '#64748b' },
] as const;
function TrendChart({ days }: { days: TrendDay[] }) {
  const total = (d: TrendDay) => TREND.reduce((s, x) => s + d[x.key], 0);
  const max = Math.max(1, ...days.map(total));
  const W = 360, H = 150, padL = 22, padB = 20, bw = (W - padL) / days.length;
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const sum = days.reduce((s, d) => s + total(d), 0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Tickets reported per day over the last 14 days: ${sum} in total`}>
        {ticks.map((t) => {
          const y = (H - padB) - (t / max) * (H - padB - 6);
          return <g key={t}><line x1={padL} x2={W} y1={y} y2={y} stroke="#1e293b" /><text x={padL - 5} y={y + 3.5} fill="#94a3b8" fontSize="10" textAnchor="end">{t}</text></g>;
        })}
        {days.map((d, i) => {
          let acc = 0;
          const x = padL + i * bw + bw * 0.18;
          const label = new Date(`${d.day}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
          return (
            <g key={d.day}>
              {TREND.map((s) => {
                const v = d[s.key];
                if (!v) return null;
                const h = (v / max) * (H - padB - 6);
                acc += h;
                return <rect key={s.key} x={x} width={bw * 0.64} y={(H - padB) - acc} height={Math.max(1, h - 1)} rx={2} fill={s.color} style={{ transition: 'all 600ms ease' }} />;
              })}
              {(i === days.length - 1 || (days.length - 1 - i) % 4 === 0) && <text x={x + bw * 0.32} y={H - 5} fill="#94a3b8" fontSize="10.5" textAnchor="middle">{i === days.length - 1 ? 'Today' : label}</text>}
              <title>{`${label}: ${TREND.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`}</title>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
        {TREND.map((s) => <span key={s.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</span>)}
      </p>
    </div>
  );
}

function OfficeBars({ rows }: { rows: NonNullable<LiveData['officeQuestions']> }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <ol className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.office}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-slate-200" title={r.office}><span className="tnum mr-1.5 text-slate-500">{i + 1}</span>{r.office}</span>
            <span className="tnum shrink-0 font-semibold text-white">{r.open}{r.overdue ? <span className="ml-1.5 text-xs font-semibold text-red-300">{r.overdue} overdue</span> : null}</span>
          </div>
          <div className="mt-1 flex h-2 overflow-hidden rounded bg-slate-800">
            <div className="h-2 bg-amber-400 transition-[width] duration-700" style={{ width: `${((r.open - r.overdue) / max) * 100}%` }} />
            <div className="h-2 bg-red-500 transition-[width] duration-700" style={{ width: `${(r.overdue / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {!rows.length && <li className="text-sm text-slate-400">No open spending questions.</li>}
    </ol>
  );
}

// ---------------------------------------------------------------- page
const METRICS: { key: LiveMetric; label: string }[] = [{ key: 'utilisation', label: 'Budget used' }, { key: 'flags', label: 'Money flags' }, { key: 'openTickets', label: 'Open tickets' }];

export default function LiveDashboard() {
  const [data, setData] = useState<LiveData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [metric, setMetric] = useState<LiveMetric>('utilisation');
  const [sel, setSel] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/live', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as LiveData;
      setData(j); setErr(null); setUpdated(new Date());
    } catch {
      setErr('Connection lost — retrying every 10 seconds. Showing the last figures received.');
    }
  }, []);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, 10_000);
    const tick = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const present = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.().catch(() => {}); return; }
    root.current?.requestFullscreen?.().catch(() => {});
  };

  const k = data?.kpis;
  const ward = data && sel ? data.wards.find((w) => w.code === sel) ?? null : null;

  return (
    <div ref={root} className={`min-h-screen bg-[#0b1324] text-white ${full ? 'overflow-y-auto' : ''}`}>
      <style>{`
        @keyframes live-ping { 0% { transform: scale(1); opacity: .8 } 100% { transform: scale(2.6); opacity: 0 } }
        .live-ping { animation: live-ping 1.4s ease-out infinite; }
        @keyframes live-slide { from { transform: translateY(-14px); opacity: 0 } to { transform: none; opacity: 1 } }
        .live-slide { animation: live-slide 600ms cubic-bezier(.2,.8,.2,1); }
        @keyframes live-flash-bad { 0%,40% { background-color: rgba(240,68,56,.35) } 100% { background-color: rgba(255,255,255,.04) } }
        @keyframes live-flash-good { 0%,40% { background-color: rgba(34,197,94,.35) } 100% { background-color: rgba(255,255,255,.04) } }
        .live-flash-bad { animation: live-flash-bad 1.6s ease-out; }
        .live-flash-good { animation: live-flash-good 1.6s ease-out; }
        @media (prefers-reduced-motion: reduce) { .live-ping { animation: none } .live-slide { animation-duration: 1ms } .live-flash-bad, .live-flash-good { animation-duration: 1ms } }
      `}</style>

      <header className="bg-gradient-to-r from-[#0b1324] via-[#17264a] to-[#0f3b4a] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl lg:text-3xl">Mumbai live: service and spending</h1>
            <p className="text-xs text-slate-300 sm:text-sm">Live tickets from this app · synthetic spending data{k?.period ? ` · ${k.period}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-black/25 px-3 py-1.5" role="status" aria-live="off">
              <span className="relative flex h-3 w-3" aria-hidden>
                <span className={`absolute inline-flex h-full w-full rounded-full ${err ? 'bg-amber-400' : 'bg-red-500 live-ping'}`} />
                <span className={`relative inline-flex h-3 w-3 rounded-full ${err ? 'bg-amber-400' : 'bg-red-500'}`} />
              </span>
              <span className="text-sm font-bold tracking-widest">LIVE</span>
              <span className="tnum text-xs text-slate-200" data-testid="live-updated">{updated ? <>Updated {clock(updated)} IST<span className="hidden sm:inline"> · refreshes every 10 s</span></> : 'Connecting…'}</span>
            </div>
            <button type="button" onClick={present} className="min-h-[40px] rounded-full border border-teal-300/40 bg-teal-400/15 px-4 text-sm font-semibold text-teal-100 hover:bg-teal-400/25" aria-pressed={full}>
              {full ? 'Exit presentation' : 'Present'}
            </button>
          </div>
        </div>
        {err && <p className="mt-2 rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-100" role="alert">{err}</p>}
      </header>

      <div className="space-y-4 p-3 sm:p-5">
        <section aria-label="Key figures" className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 xl:grid-cols-8">
          <KpiTile label="Open tickets" value={k?.openTickets ?? null} />
          <KpiTile label="Critical open" value={k?.criticalOpen ?? null} tone="crit" />
          <KpiTile label="Overdue" value={k?.overdue ?? null} tone="crit" />
          <KpiTile label="Escalated" value={k?.escalated ?? null} tone="med" />
          <KpiTile label="Verified today" value={k?.verifiedToday ?? null} tone="ok" upIsBad={false} />
          <KpiTile label="Avg first action" value={k?.avgFirstActionMinutes ?? null} sub="minutes" />
          <KpiTile label="Amount questioned" value={k?.amountQuestioned ?? null} money tone="med" sub={k ? `of ${inrShort(k.billed)} billed` : undefined} />
          <KpiTile label="Cases overdue" value={k?.casesOverdue ?? null} tone="crit" sub={k ? `${intFmt(k.casesOpen)} open · ${k.casesDecided} decided` : undefined} />
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3 lg:col-span-2" aria-label="Ward map">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-lg font-bold">Wards and live tickets</h2>
              <div className="flex gap-1" role="group" aria-label="Colour the wards by">
                {METRICS.map((m) => (
                  <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}
                    className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors sm:text-sm ${metric === m.key ? 'bg-teal-400 text-[#0b1324]' : 'bg-white/10 text-slate-200 hover:bg-white/20'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[58vh] min-h-[340px] lg:h-[max(460px,calc(100vh-250px))]">
              {data ? <LiveMap wards={data.wards} tickets={data.tickets} metric={metric} selected={sel} onSelectWard={setSel} />
                : <div className="grid h-full place-items-center rounded-xl bg-slate-800/60 text-sm">Loading live data…</div>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-300">
              {[['#b42318', 'Critical'], ['#d4a000', 'Medium'], ['#d4570b', 'Standard'], ['#067647', 'Verified fixed']].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-white" style={{ background: c }} aria-hidden />{l}</span>
              ))}
              <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-400 bg-[#0f1b33] text-[8px] font-bold" aria-hidden>3</span>Group (red ring = critical or overdue inside)</span>
              <span className="text-slate-400">{METRIC_LABEL[metric]} colours the wards. Select a ward for details.</span>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3" aria-label="Live activity">
            {ward && <WardCard w={ward} onClose={() => setSel(null)} />}
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
              Live activity <span className="text-xs font-normal text-slate-400">tickets and spending cases</span>
            </h2>
            {data ? <Feed items={data.feed} now={now} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Tickets reported per day">
            <h2 className="text-lg font-bold">Tickets reported, last 14 days</h2>
            <p className="mb-2 text-xs text-slate-400">Each bar is one day (IST), split by where those tickets stand now.</p>
            {data?.trend ? <TrendChart days={data.trend} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Unresolved spending questions by office">
            <h2 className="text-lg font-bold">Unresolved spending questions</h2>
            <p className="mb-3 flex flex-wrap gap-3 text-xs text-slate-400">
              <span>By responsible office, most first</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-amber-400" aria-hidden />Open</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-red-500" aria-hidden />Overdue</span>
            </p>
            {data?.officeQuestions ? <OfficeBars rows={data.officeQuestions} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Deadline health">
            <h2 className="mb-3 text-lg font-bold">Deadline health</h2>
            {data ? <Donut d={data.slaDonut} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:col-span-2" aria-label="Budget versus billed by ward">
            <h2 className="text-lg font-bold">Budget vs billed by ward</h2>
            <p className="mb-2 flex flex-wrap gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-slate-600" aria-hidden />Budget</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-teal-400" aria-hidden />Billed</span>
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-red-500" aria-hidden />Billed, over budget</span>
              <span>Top 12 by spend, monsoon 2025</span>
            </p>
            {data ? <BudgetBars wards={data.wards} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
          <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4" aria-label="Reports by category">
            <h2 className="mb-3 text-lg font-bold">Reports by category</h2>
            {data ? <CategoryBars rows={data.byCategory} /> : <p className="text-sm text-slate-400">Loading…</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
