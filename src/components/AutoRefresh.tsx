'use client';
// Keeps staff screens live: re-fetches the server-rendered page every few seconds (no full reload,
// form state and scroll are kept) and pauses while the tab is hidden.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  const [at, setAt] = useState<string>('');
  useEffect(() => {
    const stamp = () => setAt(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    stamp();
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return; // never interrupt typing
      router.refresh();
      stamp();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800" role="status" aria-live="off">
      <span className="pulse-ring inline-block h-2 w-2 rounded-full bg-emerald-500 text-emerald-500/50" aria-hidden="true" />
      Live · updated {at} IST
    </span>
  );
}
