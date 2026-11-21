'use client';
// Primary action for a scanned road: report a problem (one tap), plus Share and Print.
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/icons';

export function ShareButton({ url, title, className = 'btn-secondary', iconOnlyOnPhone = false }: { url: string; title: string; className?: string; iconOnlyOnPhone?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setMsg('Link copied');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setMsg('Copy this link: ' + url);
    }
    window.setTimeout(() => setMsg(null), 2500);
  }
  return (
    <>
      <button type="button" onClick={share} className={className} aria-label="Share this road page">
        <Icon name="link" className="h-4 w-4" /><span className={iconOnlyOnPhone ? 'sr-only sm:not-sr-only' : ''}>Share</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{msg}</span>
      {msg ? <span className="pointer-events-none fixed inset-x-0 top-20 z-50 mx-auto w-max max-w-[90vw] rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">{msg}</span> : null}
    </>
  );
}

/** Fixed bar on phones (sits above the site's own bottom bar when that is shown); inline on desktop. */
export function RoadActionBar({ reportHref, url, title, aboveNav }: { reportHref: string; url: string; title: string; aboveNav: boolean }) {
  return (
    <>
      <div className={`no-print fixed inset-x-0 z-30 border-t border-line bg-white/95 px-4 py-2.5 shadow-[0_-6px_20px_rgba(15,27,51,0.10)] backdrop-blur lg:hidden ${aboveNav ? 'bottom-[calc(56px+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[calc(10px+env(safe-area-inset-bottom))]'}`}>
        <div className="mx-auto flex max-w-md gap-2">
          <Link href={reportHref} className="btn-primary min-h-12 flex-1 whitespace-nowrap px-2.5 text-[14px] tracking-tight min-[380px]:text-[15px]"><Icon name="camera" className="h-5 w-5 shrink-0" />Report a problem on this road</Link>
          <ShareButton url={url} title={title} className="btn-secondary min-h-12 w-12 shrink-0 px-0 sm:w-auto sm:px-3" iconOnlyOnPhone />
        </div>
      </div>
      <div className="hidden gap-2 lg:flex">
        <Link href={reportHref} className="btn-primary min-h-12 flex-1 text-[15px]"><Icon name="camera" className="h-5 w-5" />Report a problem on this road</Link>
        <ShareButton url={url} title={title} className="btn-secondary min-h-12" />
      </div>
    </>
  );
}

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="btn-primary no-print"><Icon name="upload" className="h-4 w-4 rotate-180" />Print board</button>;
}
