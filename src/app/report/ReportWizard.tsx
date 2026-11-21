'use client';
// Mobile-first, category-driven report flow with draft recovery, location confirmation,
// routing preview, duplicate check, and photo upload with progress and retry.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { CategoryConfig } from '@/lib/config';
import { Icon } from '@/components/icons';
import { Alert, postJson } from '@/components/client';
import type { MapWard } from '@/components/WardMap';
import MumbaiMap from '@/components/MumbaiMap';
import { compressImage } from '@/lib/compress-image';

type Loc = { lat?: number | null; lon?: number | null; gpsAccuracyM?: number | null; source?: 'gps' | 'pin' | 'locality' | 'address'; localityText?: string; address?: string; confirmedLocality?: string | null };
interface Draft { step: number; category: string | null; details: Record<string, unknown>; description: string; loc: Loc; landmark: string; photoUnsafe: boolean; requestId: string }
interface Preview {
  location: { status: string; wardCode: string | null; suggestedWardCode: string | null; confidence: string; message: string; candidates: { locality: string; ward_code: string }[]; locality: string | null; lat: number | null; lon: number | null; road: { road_name: string; road_type: string; under_dlp: boolean } | null; nearbyFacilities: { name: string; type: string; distance_m: number }[]; nearbyHotspot: { name: string } | null };
  department: { primary: string | null; primaryName: string | null; supportingNames: string[]; reasons: string[] };
  priority: { priority: 'critical' | 'medium' | 'standard'; reasons: string[] };
  willTriage: boolean; triageReason: string | null;
  duplicates: { id: string; ref: string; status: string; distance_m: number; submitted_at: string; title: string }[];
}
type Upload = { key: string; file: File; url: string; progress: number; state: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string };

const KEY = 'civicops.reportDraft.v1';
const STEPS = ['What is the problem?', 'A few details', 'Where is it?', 'Photos', 'Check and send'];
const STEP_SHORT = ['Problem', 'Details', 'Location', 'Photos', 'Send'];
const PRIORITY_INFO = {
  critical: { label: 'Red · Critical', due: 'First action within 5 hours', cls: 'border-red-200 bg-crit-soft text-crit', icon: 'alert' },
  medium: { label: 'Yellow · Medium', due: 'Reminder on day 2, resolve by day 7', cls: 'border-med-edge bg-med-soft text-med', icon: 'clock' },
  standard: { label: 'Orange · Standard', due: 'Resolve by day 10', cls: 'border-orange-200 bg-std-soft text-std', icon: 'circle' },
};
const newDraft = (): Draft => ({ step: 0, category: null, details: {}, description: '', loc: {}, landmark: '', photoUnsafe: false, requestId: crypto.randomUUID() });

export interface InitialRoad { id: string; name: string; ward: string | null; lat: number; lon: number }

export function ReportWizard({ categories, wards, initialCategory, initialRoad }: { categories: CategoryConfig[]; wards: MapWard[]; initialCategory?: string; initialRoad?: InitialRoad }) {
  const [d, setD] = useState<Draft>(newDraft);
  const [restored, setRestored] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<{ name: string; ward_code: string; lat: number; lon: number; aliases: string[] }[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [compressing, setCompressing] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; ref: string } | null>(null);
  const [pending, setPending] = useState<{ lat: number; lon: number } | null>(null);
  const [fromQr, setFromQr] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom?: number; key: string } | null>(null);
  const mapWards = useMemo(() => wards.map((w) => ({ code: w.code, name: w.name, polygon: w.polygon as [number, number][] })), [wards]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cat = useMemo(() => categories.find((c) => c.code === d.category) ?? null, [categories, d.category]);

  // Draft recovery (text only; photos cannot be stored safely in the browser).
  useEffect(() => {
    // Opened from a road QR code: start a fresh report with the road's midpoint waiting for the resident to confirm.
    if (initialRoad) {
      let saved: Draft | null;
      try { const raw = localStorage.getItem(KEY); saved = raw ? JSON.parse(raw) as Draft : null; } catch { saved = null; }
      // A reload of the same QR link keeps what was already typed for this road.
      const same = saved && saved.category === (initialCategory ?? null) && saved.loc?.localityText === initialRoad.name;
      if (same && saved) { setD(saved); setRestored(true); }
      else setD({ ...newDraft(), category: initialCategory ?? null, step: initialCategory ? 1 : 0, loc: { localityText: initialRoad.name } });
      if (!same || saved?.loc?.lat == null) { setPending({ lat: initialRoad.lat, lon: initialRoad.lon }); setFromQr(true); }
      setFocus({ lat: initialRoad.lat, lon: initialRoad.lon, zoom: 16, key: `road-${initialRoad.id}` });
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const parsed = JSON.parse(raw) as Draft; if (parsed.category && (!initialCategory || parsed.category === initialCategory)) { setD(parsed); setRestored(true); return; } }
      if (initialCategory) setD((x) => ({ ...x, category: initialCategory, step: Math.max(x.step, 1) }));
    } catch { if (initialCategory) setD((x) => ({ ...x, category: initialCategory, step: Math.max(x.step, 1) })); }
  }, [initialCategory, initialRoad]);
  useEffect(() => { if (!done) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ } } }, [d, done]);
  useEffect(() => { headingRef.current?.focus(); }, [d.step]);

  const update = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const setLoc = (p: Partial<Loc>) => setD((x) => ({ ...x, loc: { ...x.loc, ...p } }));

  const runPreview = useCallback(async (draft: Draft) => {
    if (!draft.category) return;
    const hasLoc = (draft.loc.lat != null && draft.loc.lon != null) || draft.loc.localityText || draft.loc.address || draft.loc.confirmedLocality;
    if (!hasLoc) { setPreview(null); return; }
    const r = await postJson<Preview>('/api/report/preview', { category: draft.category, description: draft.description, details: draft.details, location: draft.loc, landmark: draft.landmark });
    if (r.ok) { setPreview(r.data); setPreviewErr(null); } else setPreviewErr(r.message);
  }, []);
  useEffect(() => { const id = setTimeout(() => { if (d.step >= 2) runPreview(d); }, 400); return () => clearTimeout(id); }, [d.loc, d.details, d.landmark, d.step, d.category, runPreview, d]);

  useEffect(() => {
    if (search.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(async () => {
      try { const r = await fetch(`/api/localities?q=${encodeURIComponent(search)}`); const j = await r.json(); setHits(j.results ?? []); } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  function useGps() {
    setGpsMsg('Finding your location…');
    if (!('geolocation' in navigator)) { setGpsMsg('This device has no GPS. Search for your area or drop a pin.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setPending(null); setLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude, gpsAccuracyM: Math.round(pos.coords.accuracy), source: 'gps', confirmedLocality: null }); setGpsMsg(`Location found (accurate to about ${Math.round(pos.coords.accuracy)} m).`); },
      (err) => setGpsMsg(err.code === err.PERMISSION_DENIED ? 'Location access was blocked. Search for your area or tap the map to drop a pin instead.' : 'Could not get a GPS fix. Search for your area or drop a pin.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function canContinue(): string | null {
    if (d.step === 0 && !d.category) return 'Choose what the problem is';
    if (d.step === 1) {
      if (d.description.trim().length < 5) return 'Describe the problem in a few words';
      const missing = cat?.questions.find((q) => !q.optional && q.type !== 'text' && q.type !== 'date' && (d.details[q.key] == null || (Array.isArray(d.details[q.key]) && !(d.details[q.key] as unknown[]).length)));
      if (missing) return `Answer: ${missing.label}`;
    }
    if (d.step === 2 && pending) return 'Confirm the pin on the map, or choose Not here / Undo';
    if (d.step === 2 && !preview) return 'Add a location: use GPS, search for your area, or tap the map';
    if (d.step === 3 && !uploads.length && !d.photoUnsafe) return null; // photos are optional
    return null;
  }

  async function submit(acceptTriage = false) {
    setSubmitting(true); setError(null);
    const r = await postJson<{ id: string; ref: string }>('/api/tickets', {
      category: d.category, description: d.description, details: d.details, location: d.loc, landmark: d.landmark,
      photoUnsafe: d.photoUnsafe, acceptTriage: acceptTriage || !!preview?.willTriage, clientRequestId: d.requestId,
    });
    setSubmitting(false);
    if (!r.ok) { setError(r.message); return; }
    setDone(r.data);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    uploads.forEach((u) => uploadOne(r.data.id, u));
  }

  function uploadOne(ticketId: string, u: Upload) {
    setUploads((xs) => xs.map((x) => (x.key === u.key ? { ...x, state: 'uploading', progress: 0, error: undefined } : x)));
    const fd = new FormData(); fd.append('file', u.file); fd.append('phase', 'report');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/tickets/${ticketId}/evidence`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploads((xs) => xs.map((x) => (x.key === u.key ? { ...x, progress: Math.round((e.loaded / e.total) * 100) } : x))); };
    xhr.onload = () => {
      let msg = 'Upload failed';
      try { msg = JSON.parse(xhr.responseText).message ?? msg; } catch { /* ignore */ }
      setUploads((xs) => xs.map((x) => (x.key === u.key ? (xhr.status < 300 ? { ...x, state: 'done', progress: 100 } : { ...x, state: 'failed', error: msg }) : x)));
    };
    const fail = () => setUploads((xs) => xs.map((x) => (x.key === u.key ? { ...x, state: 'failed', error: 'Network problem. Tap retry.' } : x)));
    xhr.onerror = fail; xhr.onabort = fail; xhr.ontimeout = fail;
    try { xhr.send(fd); } catch { fail(); }
  }

  const pin = d.loc.lat != null && d.loc.lon != null ? { lat: d.loc.lat as number, lon: d.loc.lon as number } : preview?.location.lat != null && preview.location.lon != null ? { lat: preview.location.lat, lon: preview.location.lon } : null;
  const blockMsg = canContinue();

  if (done) {
    const pending = uploads.some((u) => u.state === 'uploading');
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="card border-green-200 p-6 text-center">
          <Icon name="checkCircle" className="mx-auto h-10 w-10 text-ok" />
          <h1 className="h1 mt-2">Report sent</h1>
          <p className="mt-2 text-sm text-muted">Your tracking ID</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wide" data-testid="tracking-id">{done.ref}</p>
          {preview ? <p className="mt-3 text-sm">{preview.willTriage ? 'A triage officer will confirm the ward and team.' : <>Sent to <b>Ward {preview.location.wardCode} · {preview.department.primaryName}</b>. {PRIORITY_INFO[preview.priority.priority].due}.</>}</p> : null}
        </div>
        {uploads.length ? (
          <div className="card space-y-2 p-4">
            <h2 className="h2">Photos</h2>
            {uploads.map((u) => (
              <div key={u.key} className="flex items-center gap-3">
                <img src={u.url} alt="" className="h-12 w-12 rounded object-cover" />
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded bg-gray-200"><div className={`h-full ${u.state === 'failed' ? 'bg-crit' : 'bg-action'}`} style={{ width: `${u.progress}%` }} /></div>
                  <div className="mt-1 text-xs text-muted">{u.state === 'done' ? 'Uploaded (location metadata removed)' : u.state === 'failed' ? u.error : u.state === 'waiting' ? 'Not uploaded yet' : `Uploading ${u.progress}%`}</div>
                </div>
                {u.state === 'failed' || u.state === 'waiting' ? <button className="btn-secondary btn-sm" onClick={() => uploadOne(done.id, u)}>{u.state === 'failed' ? 'Retry' : 'Upload'}</button> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={`/tickets/${done.ref}`} className={`btn-primary ${pending ? 'pointer-events-none opacity-60' : ''}`} aria-disabled={pending}>Track this ticket</Link>
          <Link href="/my" className="btn-secondary">My tickets</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <ol className="relative flex items-start justify-between" aria-label={`Step ${d.step + 1} of ${STEPS.length}`}>
          <span className="absolute left-4 right-4 top-4 h-0.5 bg-gray-200" aria-hidden />
          <span className="absolute left-4 top-4 h-0.5 bg-action transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `calc((100% - 2rem) * ${d.step / (STEPS.length - 1)})` }} aria-hidden />
          {STEP_SHORT.map((s, i) => (
            <li key={s} className="relative z-[1] flex w-14 flex-col items-center gap-1 text-center" aria-current={i === d.step ? 'step' : undefined}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold tnum ${i < d.step ? 'border-action bg-action text-white' : i === d.step ? 'border-action bg-white text-action ring-4 ring-action/20' : 'border-gray-300 bg-white text-gray-500'}`}>
                {i < d.step ? <Icon name="check" className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[11px] leading-tight ${i === d.step ? 'font-bold text-action' : 'text-muted'} ${i === d.step ? '' : 'hidden sm:block'}`}>{s}</span>
            </li>
          ))}
        </ol>
        <div className="kicker mt-4">Step {d.step + 1} of {STEPS.length}</div>
        <h1 ref={headingRef} tabIndex={-1} className="h1 mt-1 outline-none">{STEPS[d.step]}</h1>
      </div>
      {restored ? <div className="mb-4"><Alert tone="info">We restored your unsent draft. <button className="font-semibold underline" onClick={() => { setD(newDraft()); setRestored(false); setPreview(null); }}>Start over</button></Alert></div> : null}

      {d.step === 0 ? (
        <fieldset>
          <legend className="sr-only">Category</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <button key={c.code} type="button" aria-pressed={d.category === c.code}
                onClick={() => update({ category: c.code, details: d.category === c.code ? d.details : {}, step: 1 })}
                className={`card group flex min-h-[72px] items-center gap-3 p-3.5 text-left transition-[border-color,box-shadow] hover:border-action hover:shadow-md motion-reduce:transition-none ${d.category === c.code ? 'border-action ring-2 ring-action/30' : ''}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${d.category === c.code ? 'bg-action text-white' : 'bg-action-soft text-action group-hover:bg-action group-hover:text-white'}`}><Icon name={c.icon} className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{c.label}</span><span className="block text-xs text-muted">{c.urgencyGuidance.split('.')[0]}.</span></span>
                <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-action" />
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {d.step === 1 && cat ? (
        <div className="space-y-5">
          <p className="text-sm text-muted">Short answers help the right team act faster. Questions marked optional can be skipped.</p>
          {cat.questions.map((q) => (
            <div key={q.key}>
              {q.type === 'select' || q.type === 'multiselect' ? (
                <fieldset>
                  <legend className="label">{q.label}{q.optional ? <span className="font-normal text-muted"> (optional)</span> : null}</legend>
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map((o) => {
                      const cur = d.details[q.key];
                      const on = q.type === 'multiselect' ? Array.isArray(cur) && (cur as string[]).includes(o.value) : cur === o.value;
                      return (
                        <button key={o.value} type="button" aria-pressed={on}
                          className={`rounded-full border px-3 py-2 text-sm ${on ? 'border-action bg-action text-white' : 'border-gray-300 bg-white hover:border-action'}`}
                          onClick={() => {
                            if (q.type === 'multiselect') {
                              const arr = Array.isArray(cur) ? [...(cur as string[])] : [];
                              const next = on ? arr.filter((v) => v !== o.value) : o.value === 'none' ? ['none'] : [...arr.filter((v) => v !== 'none'), o.value];
                              update({ details: { ...d.details, [q.key]: next } });
                            } else update({ details: { ...d.details, [q.key]: o.value } });
                          }}>{o.label}</button>
                      );
                    })}
                  </div>
                  {q.help ? <p className="help">{q.help}</p> : null}
                </fieldset>
              ) : (
                <>
                  <label className="label" htmlFor={`q-${q.key}`}>{q.label}{q.type === 'text' || q.optional ? <span className="font-normal text-muted"> (optional)</span> : null}</label>
                  <input id={`q-${q.key}`} className="input" type={q.type === 'date' ? 'date' : q.type === 'number' ? 'number' : 'text'} value={String(d.details[q.key] ?? '')}
                    onChange={(e) => update({ details: { ...d.details, [q.key]: e.target.value } })} />
                  {q.help ? <p className="help">{q.help}</p> : null}
                </>
              )}
            </div>
          ))}
          <div>
            <label className="label" htmlFor="desc">Describe the problem in your own words</label>
            <textarea id="desc" rows={4} className="input" value={d.description} onChange={(e) => update({ description: e.target.value })} placeholder="English, मराठी, हिन्दी or Hinglish are all fine" />
            <p className="help">We keep your original words. Staff may add a translation alongside them.</p>
          </div>
          <div className="rounded-lg border border-line bg-white p-3 text-xs text-muted"><b className="text-ink">How urgency is decided:</b> {cat.urgencyGuidance}</div>
        </div>
      ) : null}

      {d.step === 2 && cat ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={useGps}><Icon name="pin" /> Use my location</button>
          </div>
          {gpsMsg ? <Alert tone={gpsMsg.includes('blocked') || gpsMsg.includes('Could not') || gpsMsg.includes('no GPS') ? 'warn' : 'info'}>{gpsMsg}</Alert> : null}
          <div className="relative">
            <label className="label" htmlFor="loc-search">Search for your area</label>
            <input id="loc-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && search.trim().length >= 2) { e.preventDefault(); const text = search.trim(); setLoc({ localityText: text, confirmedLocality: null, ...(d.loc.source === 'gps' || d.loc.source === 'pin' ? {} : { source: 'locality', lat: null, lon: null }) }); setSearch(''); setHits([]); } }} placeholder="e.g. Juhu, Andheri East, अंधेरी" autoComplete="off" role="combobox" aria-expanded={hits.length > 0} aria-controls="loc-hits" />
            {hits.length ? (
              <ul id="loc-hits" role="listbox" className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                {hits.map((h) => (
                  <li key={h.name}>
                    <button type="button" role="option" aria-selected={false} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50"
                      onClick={() => { setLoc({ confirmedLocality: h.name, localityText: h.name, source: d.loc.lat != null && d.loc.source !== 'locality' ? d.loc.source : 'locality', ...(d.loc.source === 'gps' || d.loc.source === 'pin' ? {} : { lat: null, lon: null }) }); setSearch(''); setHits([]); if (h.lat != null && h.lon != null) setFocus({ lat: h.lat, lon: h.lon, zoom: 14.5, key: h.name }); }}>
                      <span>{h.name}{h.aliases.length ? <span className="text-xs text-muted"> · {h.aliases.join(', ')}</span> : null}</span>
                      <span className="chip border-gray-300 text-gray-700">Ward {h.ward_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {initialRoad ? (
            <p className="flex" data-testid="qr-road-chip">
              <span className="chip border-action/30 bg-action-soft px-3 py-1 text-sm text-action"><Icon name="road" className="h-4 w-4" /> From the QR code on {initialRoad.name} ({initialRoad.id})</span>
            </p>
          ) : null}
          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <MumbaiMap wards={mapWards} pinMode pin={pending ?? pin} pinAccuracyM={!pending && d.loc.source === 'gps' ? d.loc.gpsAccuracyM ?? null : null}
              onPinChange={(lat, lon) => { setPending({ lat, lon }); setFromQr(false); }} selectedWard={preview?.location.wardCode ?? preview?.location.suggestedWardCode ?? null} flyToSelected={false}
              focus={focus} height="clamp(260px, 44vh, 420px)" ariaLabel="Map for placing the problem. Tap the map or drag the pin." caption="Approximate demo boundaries · synthetic data" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2.5" aria-live="polite">
              {pending ? (
                <>
                  <span className="text-sm"><b>{fromQr ? 'Is this the spot?' : 'Pin moved.'}</b> <span className="tnum text-muted">{pending.lat.toFixed(5)}, {pending.lon.toFixed(5)}</span></span>
                  <span className="flex gap-2">
                    <button type="button" className="btn-secondary btn-sm min-h-[44px]" onClick={() => { setPending(null); setFromQr(false); }}>{fromQr ? 'Not here' : 'Undo'}</button>
                    <button type="button" className="btn-primary min-h-[44px]" onClick={() => { setLoc({ lat: pending.lat, lon: pending.lon, source: 'pin', gpsAccuracyM: null }); setPending(null); setFromQr(false); }}><Icon name="check" /> Confirm this spot</button>
                  </span>
                </>
              ) : d.loc.lat != null && d.loc.lon != null ? (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Icon name="checkCircle" className="h-5 w-5 text-ok" />
                  <b>{d.loc.source === 'gps' ? 'Your location' : 'Pinned spot'}</b>
                  <span className="tnum text-muted">{(d.loc.lat as number).toFixed(5)}, {(d.loc.lon as number).toFixed(5)}</span>
                  {d.loc.source === 'gps' && d.loc.gpsAccuracyM ? <span className="chip tnum border-action/30 bg-action-soft text-action">GPS ± {d.loc.gpsAccuracyM} m</span> : null}
                  <span className="text-xs text-muted">Drag the pin if it is not exactly right.</span>
                </span>
              ) : (
                <span className="text-sm text-muted">Tap the map where the problem is, or use your location. No map? Search for your area above.</span>
              )}
            </div>
          </div>
          {d.loc.confirmedLocality ? <p className="text-sm">Area: <b>{d.loc.confirmedLocality}</b> <button className="ml-1 text-xs font-semibold text-action underline" onClick={() => setLoc({ confirmedLocality: null })}>change</button></p> : null}
          {previewErr ? <Alert tone="error">{previewErr}</Alert> : null}
          {preview ? <RoutingCard preview={preview} onPickCandidate={(name) => setLoc({ confirmedLocality: name, localityText: name })} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="addr">Address or street</label><input id="addr" className="input" value={d.loc.address ?? ''} onChange={(e) => setLoc({ address: e.target.value, source: d.loc.source ?? 'address' })} placeholder="e.g. Juhu Tara Road" /></div>
            <div><label className="label" htmlFor="landmark">Nearby landmark</label><input id="landmark" className="input" value={d.landmark} onChange={(e) => update({ landmark: e.target.value })} placeholder="e.g. opposite the church" /></div>
          </div>
        </div>
      ) : null}

      {d.step === 3 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Photos help the team find and fix the problem. Location data inside photos is removed when they are uploaded.</p>
          <label className={`card flex cursor-pointer flex-col items-center gap-2 border-dashed p-6 text-center hover:border-action ${d.photoUnsafe ? 'pointer-events-none opacity-50' : ''}`}>
            <Icon name="camera" className="h-8 w-8 text-action" />
            <span className="font-semibold">Take a photo or choose from gallery</span>
            <span className="text-xs text-muted">JPEG, PNG or WebP, up to 12 MB each</span>
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" data-testid="report-photo"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (!files.length) return;
                setCompressing((n) => n + 1);
                try {
                  // Shrink phone photos so each upload fits the hosting request limit; preview and upload use the same file.
                  const small = await Promise.all(files.map((f) => compressImage(f)));
                  setUploads((xs) => [...xs, ...small.map((f) => ({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), progress: 0, state: 'waiting' as const }))]);
                } finally {
                  setCompressing((n) => n - 1);
                }
              }} />
          </label>
          {uploads.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {uploads.map((u) => (
                <li key={u.key} className="relative">
                  <img src={u.url} alt="Selected photo preview" className="aspect-square w-full rounded-lg object-cover" />
                  <button type="button" className="absolute right-1 top-1 rounded-full bg-white/90 p-1" aria-label="Remove photo" onClick={() => setUploads((xs) => xs.filter((x) => x.key !== u.key))}><Icon name="x" className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={d.photoUnsafe} onChange={(e) => update({ photoUnsafe: e.target.checked })} />
            <span><b>It is not safe to take a photo</b> (fallen wires, deep water, traffic). You can still send the report.</span>
          </label>
        </div>
      ) : null}

      {d.step === 4 && cat ? (
        <div className="space-y-4">
          <div className="card divide-y divide-line">
            <Row k="Problem" v={<span className="inline-flex items-center gap-2"><Icon name={cat.icon} />{cat.label}</span>} edit={() => update({ step: 0 })} />
            <Row k="Details" v={<span className="text-sm">{d.description}<br /><span className="text-xs text-muted">{Object.entries(d.details).map(([k, v]) => `${k.replace('_', ' ')}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}</span></span>} edit={() => update({ step: 1 })} />
            <Row k="Location" v={<span className="text-sm">{preview?.location.locality ?? d.loc.confirmedLocality ?? d.loc.address ?? (pin ? `${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}` : '—')}{d.landmark ? ` · ${d.landmark}` : ''}</span>} edit={() => update({ step: 2 })} />
            <Row k="Photos" v={<span className="text-sm">{uploads.length ? `${uploads.length} photo(s) will upload after sending` : d.photoUnsafe ? 'None: unsafe to take one' : 'None'}</span>} edit={() => update({ step: 3 })} />
          </div>
          {preview ? <RoutingCard preview={preview} onPickCandidate={(name) => { setLoc({ confirmedLocality: name, localityText: name }); update({ step: 2 }); }} /> : <Alert tone="warn">Add a location before sending.</Alert>}
          {preview?.duplicates.length ? (
            <div className="card border-med-edge p-4">
              <h2 className="h2">Someone may have already reported this</h2>
              <p className="mt-1 text-sm text-muted">These open reports are nearby and in the same category. You can follow one instead of filing a new report. Other residents' details are never shown.</p>
              <ul className="mt-3 space-y-2">
                {preview.duplicates.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm">
                    <span><b className="font-mono">{x.ref}</b> · {x.title} · {x.distance_m} m away · {x.status.replace('_', ' ')} · reported {x.submitted_at}</span>
                    <FollowButton id={x.id} onDone={() => { try { localStorage.removeItem(KEY); } catch { /* */ } }} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
        </div>
      ) : null}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 flex items-center justify-between gap-2 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-6px_16px_rgba(11,19,36,0.06)] backdrop-blur sm:mx-0 sm:px-0 sm:shadow-none lg:bottom-0">
        <button type="button" className="btn-secondary" onClick={() => update({ step: Math.max(0, d.step - 1) })} disabled={d.step === 0}>Back</button>
        <span className="hidden text-xs text-muted sm:inline">Draft saved on this device</span>
        {d.step < 4 ? (
          <button type="button" className="btn-primary" disabled={!!blockMsg} title={blockMsg ?? undefined} onClick={() => update({ step: d.step + 1 })}>Continue <Icon name="arrowRight" /></button>
        ) : (
          <button type="button" className="btn-primary" disabled={submitting || compressing > 0 || !preview} onClick={() => submit()} data-testid="submit-report">{submitting ? 'Sending…' : compressing > 0 ? 'Preparing photos…' :preview?.willTriage ? 'Send to triage' : 'Send report'}</button>
        )}
      </div>
      {blockMsg && d.step < 4 ? <p className="text-right text-xs text-muted">{blockMsg}</p> : null}
    </div>
  );
}

function Row({ k, v, edit }: { k: string; v: React.ReactNode; edit: () => void }) {
  return <div className="flex items-start justify-between gap-3 p-3"><div><div className="kicker">{k}</div><div className="mt-0.5">{v}</div></div><button type="button" className="text-xs font-semibold text-action underline" onClick={edit}>Edit</button></div>;
}

function FollowButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');
  if (state === 'done') return <span className="chip border-green-200 bg-ok-soft text-ok">Following: you will get its updates</span>;
  return <button type="button" className="btn-secondary btn-sm" disabled={state === 'busy'} onClick={async () => { setState('busy'); const r = await postJson(`/api/tickets/${id}/follow`, {}); if (r.ok) { setState('done'); onDone(); } else setState(r.message); }}>{state === 'busy' ? '…' : 'Follow this instead'}</button>;
}

function RoutingCard({ preview, onPickCandidate }: { preview: Preview; onPickCandidate: (name: string) => void }) {
  const p = PRIORITY_INFO[preview.priority.priority];
  const loc = preview.location;
  return (
    <div className="card space-y-3 p-4" aria-live="polite" data-testid="routing-card">
      <div className="kicker">We will send this to</div>
      {preview.willTriage ? (
        <Alert tone="warn"><b>Triage queue.</b> {preview.triageReason}</Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <span className="chip border-action bg-action-soft px-3 py-1 text-sm text-action">Ward {loc.wardCode}</span>
          <span>{preview.department.primaryName}</span>
          {preview.department.supportingNames.length ? <span className="text-sm font-normal text-muted">+ support: {preview.department.supportingNames.join(', ')}</span> : null}
        </div>
      )}
      {loc.status === 'ambiguous' && loc.candidates.length ? (
        <div>
          <p className="text-sm">{loc.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">{loc.candidates.map((c) => <button key={c.locality} type="button" className="btn-secondary btn-sm" onClick={() => onPickCandidate(c.locality)}>{c.locality} (Ward {c.ward_code})</button>)}</div>
        </div>
      ) : <p className="text-sm text-muted">{loc.message}</p>}
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${p.cls}`}>
        <Icon name={p.icon} className="mt-0.5 h-4 w-4 shrink-0" />
        <div><b>Suggested priority: {p.label}</b> · {p.due}<div className="text-xs">{preview.priority.reasons.join('; ')}</div></div>
      </div>
      {loc.road ? <p className="text-xs text-muted">Nearest road: {loc.road.road_name} ({loc.road.road_type}){loc.road.under_dlp ? ' · under defect liability: the original contractor repairs at no cost' : ''}</p> : null}
      {loc.nearbyFacilities.length ? <p className="text-xs text-muted">Nearby: {loc.nearbyFacilities.map((f) => `${f.name} (${f.distance_m} m)`).join(', ')}</p> : null}
    </div>
  );
}
