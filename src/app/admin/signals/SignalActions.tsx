'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/components/client';

export function SignalActions({ postId }: { postId: string }) {
  const router = useRouter();
  const [target, setTarget] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function send(action: 'link' | 'dismiss') {
    const r = await postJson(`/api/admin/signals/${postId}`, { action, target });
    if (!r.ok) setErr(r.message); else router.refresh();
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input className="input w-64" placeholder="Ticket ref (CO-…) or complaint (BMC25-…)" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Link to ticket or complaint" />
      <button className="btn-secondary btn-sm" disabled={!target} onClick={() => send('link')}>Link as supporting signal</button>
      <button className="btn-secondary btn-sm" onClick={() => send('dismiss')}>Dismiss as noise</button>
      {err ? <span className="text-xs text-crit" role="alert">{err}</span> : null}
    </div>
  );
}
