'use client';
import { useState } from 'react';
import { Icon } from '@/components/icons';

export interface GalleryItem { id: string; phase: string; uploader_role: string; note: string | null; created_at: string; origin: string; duplicate_of_evidence: string | null; work_order_ref: string | null }

export function EvidenceGallery({ items }: { items: GalleryItem[] }) {
  const [zoom, setZoom] = useState<GalleryItem | null>(null);
  if (!items.length) return <p className="mt-2 text-sm text-muted">No photos yet.</p>;
  return (
    <>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((e) => (
          <li key={e.id} className="overflow-hidden rounded-lg border border-line">
            <button type="button" className="block w-full" onClick={() => setZoom(e)} aria-label={`Enlarge ${e.phase} photo from ${e.created_at}`}>
              <img src={`/api/evidence/${e.id}?thumb=1`} alt={`${e.phase} photo`} className="aspect-[4/3] w-full bg-gray-100 object-cover" loading="lazy" />
            </button>
            <div className="space-y-1 p-2 text-xs">
              <div className="flex flex-wrap gap-1">
                <span className="chip border-gray-300 capitalize text-gray-700">{e.phase === 'report' ? 'Resident photo' : e.phase}</span>
                {e.origin === 'illustration' ? <span className="chip border-amber-300 bg-amber-50 text-amber-900">Illustration</span> : null}
                {e.duplicate_of_evidence ? <span className="chip border-red-300 bg-crit-soft text-crit"><Icon name="alert" className="h-3 w-3" />Re-used photo</span> : null}
              </div>
              <div className="text-muted">{e.created_at}</div>
              {e.note ? <div>{e.note}</div> : null}
              {e.work_order_ref ? <div className="text-muted">Work order {e.work_order_ref}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      {zoom ? (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)} onKeyDown={(e) => { if (e.key === 'Escape') setZoom(null); }}>
          <div className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={`/api/evidence/${zoom.id}`} alt={`${zoom.phase} photo, full size`} className="max-h-[80vh] rounded" />
            <div className="mt-2 flex items-center justify-between text-sm text-white"><span className="capitalize">{zoom.phase} · {zoom.created_at}</span><button autoFocus className="btn-secondary btn-sm" onClick={() => setZoom(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
