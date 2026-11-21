'use client';
// QR code drawn as crisp SVG. The encoder (qrcode-generator 1.4.4, MIT) loads once at runtime from
// cdnjs, so nothing is installed. Error correction M, 4-module quiet zone. If the script cannot load,
// the URL is shown as text instead, so the board still works.
import { useEffect, useState } from 'react';

const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
interface QrModel { addData(d: string): void; make(): void; getModuleCount(): number; isDark(r: number, c: number): boolean }
type QrFactory = (typeNumber: number, level: 'L' | 'M' | 'Q' | 'H') => QrModel;
declare global { interface Window { qrcode?: QrFactory } }

let loading: Promise<QrFactory> | null = null;
function loadQr(): Promise<QrFactory> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (loading) return loading;
  loading = new Promise<QrFactory>((resolve, reject) => {
    // The component also renders an async <script> (React hoists it into <head> during SSR, so the
    // encoder starts downloading before hydration). Inject one only if it is missing.
    if (!document.querySelector(`script[src="${SRC}"]`)) {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.addEventListener('error', () => reject(new Error('load failed')));
      document.head.appendChild(s);
    }
    const started = Date.now();
    const tick = window.setInterval(() => {
      if (window.qrcode) { window.clearInterval(tick); resolve(window.qrcode); }
      else if (Date.now() - started > 10000) { window.clearInterval(tick); reject(new Error('timeout')); }
    }, 40);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}

function toPath(qr: QrModel, quiet: number): { d: string; n: number } {
  const count = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      let run = 1;
      while (c + run < count && qr.isDark(r, c + run)) run++;
      d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
      c += run - 1;
    }
  }
  return { d, n: count + quiet * 2 };
}

export function QrCode({ value, size = 160, label, className = '' }: { value: string; size?: number; label?: string; className?: string }) {
  const [shape, setShape] = useState<{ d: string; n: number; for: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadQr().then((make) => {
      if (!live) return;
      const qr = make(0, 'M');
      qr.addData(value);
      qr.make();
      setShape({ ...toPath(qr, 4), for: value });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [value]);

  const aria = `QR code for ${value}`;
  return (
    <figure className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <script async src={SRC} />
      {shape && shape.for === value ? (
        <svg role="img" aria-label={aria} width={size} height={size} viewBox={`0 0 ${shape.n} ${shape.n}`} shapeRendering="crispEdges" className="block rounded-md bg-white">
          <rect width={shape.n} height={shape.n} fill="#ffffff" />
          <path d={shape.d} fill="#0b1324" />
        </svg>
      ) : failed ? (
        <div role="img" aria-label={aria} style={{ width: size, minHeight: size }} className="flex items-center justify-center rounded-md border border-dashed border-gray-400 bg-white p-2 text-center">
          <span className="break-all font-mono text-[10px] leading-tight text-ink">{value}</span>
        </div>
      ) : (
        <div aria-label={aria} role="img" style={{ width: size, height: size }} className="animate-pulse rounded-md bg-gray-100 motion-reduce:animate-none" />
      )}
      {label ? <figcaption className="text-center text-xs text-muted">{label}</figcaption> : null}
    </figure>
  );
}
