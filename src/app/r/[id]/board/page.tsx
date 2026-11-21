// /r/<road id>/board: printable A4 site board with a big QR code to the road's public page.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, withSystem } from '@/lib/db';
import { roadProfile } from '@/lib/roads';
import { formatDateIST } from '@/lib/time';
import { QrCode } from '@/components/QrCode';
import { Icon } from '@/components/icons';
import { PrintButton } from '../../RoadActions';
import { BasisChip, StateChip, siteOrigin } from '../../shared';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Road QR site board · CivicOps Mumbai' };

const PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
@media print {
  header, nav, .no-print { display: none !important; }
  html, body { background: #fff !important; }
  main { padding: 0 !important; max-width: none !important; }
  .board-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: 100% !important; min-height: 0 !important; height: 275mm !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export default async function RoadBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) notFound();
  const [p, origin] = await Promise.all([withSystem((q) => roadProfile(q, id), await getDb()), siteOrigin()]);
  if (!p) notFound();
  const { road, warranty: w } = p;
  const url = `${origin}/r/${road.road_id}`;
  const big = w.state === 'active' || w.state === 'expiring'
    ? <>Free repairs until<br /><span className="text-[#067647]">{formatDateIST(w.expires)}</span></>
    : w.state === 'expired' ? <>Free-repair period ended<br /><span className="text-gray-600">{formatDateIST(w.expires)}</span></>
      : <>Free-repair period<br /><span className="text-gray-600">not on record</span></>;

  return (
    <div className="mx-auto max-w-[210mm]">
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/r/${road.road_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-action underline"><Icon name="arrowRight" className="h-4 w-4 rotate-180" />Back to the road page</Link>
        <div className="flex items-center gap-2"><span className="text-xs text-muted">A4 portrait</span><PrintButton /></div>
      </div>

      <article className="board-sheet mx-auto flex w-full sm:aspect-[210/297] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-2)]">
        <div className="bg-[#0f1b33] px-[6%] py-[4%] text-white">
          <div className="flex items-center justify-between gap-3 text-[clamp(10px,1.6vw,14px)] font-bold uppercase tracking-[0.18em] text-teal-200">
            <span>Road warranty board</span><span className="font-mono tracking-normal">{road.road_id}</span>
          </div>
          <h1 className="mt-[2%] text-[clamp(24px,6vw,52px)] font-extrabold leading-[1.05] tracking-tight">{road.road_name}</h1>
          <p className="mt-1 text-[clamp(12px,2.2vw,20px)] text-indigo-100">Segment {road.segment_no} · Ward {p.ward.code} ({p.ward.name})</p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-[3%] px-[6%] py-[3%] text-center">
          <div className="text-[clamp(22px,5.4vw,46px)] font-extrabold leading-[1.1] tracking-tight text-[#0b1324]">{big}</div>
          <div className="no-print flex flex-wrap justify-center gap-1.5"><StateChip state={w.state} /><BasisChip w={w} /></div>
          <div className="rounded-2xl border-[3px] border-[#0f766e] p-2">
            <QrCode value={url} size={300} className="[&_svg]:h-auto [&_svg]:w-[min(300px,56vw)]" />
          </div>
          <p className="max-w-[30ch] text-[clamp(15px,2.8vw,24px)] font-bold leading-snug text-[#0b1324]">Scan to see the warranty, the money and to report a problem</p>
          <p className="break-all font-mono text-[clamp(9px,1.4vw,12px)] text-gray-500">{url}</p>
        </div>

        <dl className="grid grid-cols-3 border-t-2 border-[#0f766e] text-left text-[clamp(10px,1.7vw,14px)]">
          <div className="border-r border-line px-[4%] py-[3%]"><dt className="font-semibold uppercase tracking-wide text-gray-500">Contractor</dt><dd className="mt-0.5 font-bold leading-tight">{p.contractor?.name ?? 'Not on record'}</dd></div>
          <div className="border-r border-line px-[4%] py-[3%]"><dt className="font-semibold uppercase tracking-wide text-gray-500">Resurfaced</dt><dd className="mt-0.5 font-bold">{formatDateIST(w.start)}<span className="block text-[0.85em] font-medium text-gray-600">{road.surface}{w.years ? ` · ${w.years}-year period` : ''}</span></dd></div>
          <div className="px-[4%] py-[3%]"><dt className="font-semibold uppercase tracking-wide text-gray-500">BMC helpline</dt><dd className="text-[1.9em] font-extrabold leading-none text-[#0f766e]">1916</dd></div>
        </dl>
        <div className="bg-[#f7f6f2] px-[4%] py-[2%] text-center text-[clamp(9px,1.4vw,12px)] text-gray-600">
          CivicOps Mumbai · demo with synthetic data · Warranty basis: {w.basis === 'Dataset flag' ? 'dataset' : w.basis === 'Unknown' ? 'unknown' : 'assumed from surface type'}
        </div>
      </article>
    </div>
  );
}
