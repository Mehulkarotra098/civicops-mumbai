// All timestamps are stored in UTC (timestamptz) and displayed in Mumbai time.
const TZ = 'Asia/Kolkata';

const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });

/** "21 Nov 2026, 10:42 AM IST" */
export function formatIST(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return `${dateFmt.format(date)}, ${timeFmt.format(date)} IST`;
}

export function formatDateIST(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return dateFmt.format(date);
}

/** yymmdd in IST, used in ticket references. */
export function ymdIST(d: Date): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

export function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function inr(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function inrShort(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return inr(n);
}
