'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';

type Item = { key: string; file: File; url: string; progress: number; state: 'ready' | 'uploading' | 'done' | 'failed'; error?: string; warning?: string };

/** Camera or gallery upload with preview, progress and retry. Staff choose before/during/after. */
export function EvidenceUploader({ ticketId, staff, onUploaded }: { ticketId: string; staff?: boolean; onUploaded: () => void }) {
  const [phase, setPhase] = useState(staff ? 'after' : 'report');
  const [note, setNote] = useState('');
  const [wo, setWo] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  function upload(it: Item) {
    setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, state: 'uploading', progress: 0, error: undefined } : x)));
    const fd = new FormData();
    fd.append('file', it.file); fd.append('phase', phase); if (note) fd.append('note', note); if (wo) fd.append('workOrderRef', wo);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tickets/${ticketId}/evidence`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, progress: Math.round((e.loaded / e.total) * 100) } : x))); };
    xhr.onload = () => {
      let body: { message?: string; duplicateOf?: string | null } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      const ok = xhr.status < 300;
      setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, state: ok ? 'done' : 'failed', progress: ok ? 100 : x.progress, error: ok ? undefined : body.message ?? 'Upload failed', warning: ok && body.duplicateOf ? 'This photo is identical to one already on file. Reviewers will see a warning.' : undefined } : x)));
      if (ok) onUploaded();
    };
    xhr.onerror = () => setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, state: 'failed', error: 'Network problem. Your photo is still here: tap Retry.' } : x)));
    xhr.send(fd);
  }

  return (
    <div className="space-y-2 rounded-lg border border-line p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon name="camera" />{staff ? 'Add repair evidence' : 'Add a photo'}</div>
      {staff ? (
        <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Photo stage">
          {['before', 'during', 'after'].map((p) => (
            <button key={p} type="button" role="radio" aria-checked={phase === p} onClick={() => setPhase(p)} className={`rounded-md border px-2 py-1.5 text-xs font-semibold capitalize ${phase === p ? 'border-action bg-action text-white' : 'border-gray-300 bg-white'}`}>{p}</button>
          ))}
        </div>
      ) : null}
      {staff ? <input className="input" placeholder="Repair note for this photo" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Photo note" /> : null}
      {staff ? <input className="input" placeholder="Linked work order ID (optional)" value={wo} onChange={(e) => setWo(e.target.value)} aria-label="Linked work order ID" /> : null}
      <label className="btn-secondary w-full cursor-pointer">
        <Icon name="upload" />Take or choose photo
        <input type="file" accept="image/*" capture="environment" className="sr-only" data-testid={staff ? 'staff-photo' : 'resident-photo'}
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            const added = fs.map((f) => ({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), progress: 0, state: 'ready' as const }));
            setItems((xs) => [...xs, ...added]); added.forEach(upload); e.target.value = '';
          }} />
      </label>
      {items.map((it) => (
        <div key={it.key} className="flex items-center gap-2">
          <img src={it.url} alt="Upload preview" className="h-12 w-12 rounded object-cover" />
          <div className="flex-1 text-xs">
            <div className="h-1.5 overflow-hidden rounded bg-gray-200"><div className={`h-full ${it.state === 'failed' ? 'bg-crit' : 'bg-action'}`} style={{ width: `${it.progress}%` }} /></div>
            <div className={`mt-1 ${it.state === 'failed' ? 'text-crit' : 'text-muted'}`} role={it.state === 'failed' ? 'alert' : undefined}>{it.state === 'done' ? 'Uploaded · metadata removed' : it.state === 'failed' ? it.error : `Uploading ${it.progress}%`}</div>
            {it.warning ? <div className="text-med">{it.warning}</div> : null}
          </div>
          {it.state === 'failed' ? <button type="button" className="btn-secondary btn-sm" onClick={() => upload(it)}>Retry</button> : null}
        </div>
      ))}
    </div>
  );
}
