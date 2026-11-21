'use client';
// Scan a road's QR with the phone camera (BarcodeDetector, built into Chrome on Android and recent Safari),
// or type the road ID printed under the code. Either way it opens the road page.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

function roadFrom(text: string): string | null {
  const m = text.match(/\/r\/([A-Za-z0-9_-]{2,32})/) ?? text.trim().match(/^(RD\d{2,6})$/i);
  return m ? m[1].toUpperCase() : null;
}

export function Scanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'idle' | 'scanning' | 'unsupported' | 'denied'>('idle');
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => () => {
    const s = video.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setErr(null);
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) { setState('unsupported'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      setState('scanning');
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!video.current || video.current.readyState < 2) { requestAnimationFrame(tick); return; }
        try {
          const codes = await det.detect(video.current);
          const road = codes.map((c) => roadFrom(c.rawValue)).find(Boolean);
          if (road) { stream.getTracks().forEach((t) => t.stop()); router.push(`/r/${road}`); return; }
          if (codes.length) setErr('That QR code is not a CivicOps road code.');
        } catch { /* keep scanning */ }
        setTimeout(() => requestAnimationFrame(tick), 250);
      };
      requestAnimationFrame(tick);
    } catch { setState('denied'); }
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    const road = roadFrom(typed) ?? (typed.trim() ? typed.trim().toUpperCase() : null);
    if (road) router.push(`/r/${encodeURIComponent(road)}`);
  }

  return (
    <div className="space-y-5">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-navy-950 text-white shadow-[var(--shadow-2)]">
        <video ref={video} className={`h-full w-full object-cover ${state === 'scanning' ? '' : 'hidden'}`} playsInline muted aria-label="Camera view" />
        {state === 'scanning' ? (
          <div className="pointer-events-none absolute inset-10 rounded-2xl border-4 border-teal-300/90 shadow-[0_0_0_999px_rgba(11,19,36,0.45)]" aria-hidden />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-300"><Icon name="camera" className="h-8 w-8" /></span>
            <p className="text-lg font-bold">Point your camera at the QR on the road&apos;s site board</p>
            {state === 'unsupported' ? <p className="text-sm text-amber-200">This browser can&apos;t read QR codes. Use your phone&apos;s camera app, or type the road ID below.</p> : null}
            {state === 'denied' ? <p className="text-sm text-amber-200">Camera access was blocked. Type the road ID below instead.</p> : null}
            <button type="button" onClick={start} className="btn-primary">Open camera</button>
          </div>
        )}
      </div>
      {err ? <p className="text-center text-sm text-crit" role="alert">{err}</p> : null}
      <form onSubmit={go} className="mx-auto flex max-w-sm gap-2">
        <label className="sr-only" htmlFor="road-id">Road ID</label>
        <input id="road-id" className="input" placeholder="Road ID, e.g. RD0220" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="btn-secondary shrink-0">Open road</button>
      </form>
    </div>
  );
}
