import { pageMeta } from '@/lib/seo';
import Link from 'next/link';
import { Scanner } from './Scanner';

export const metadata = pageMeta('Scan a road', 'Scan the QR on any road site board: see its free-repair guarantee, who must fix defects, every rupee spent, and report a problem on that exact road.', 'road');

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 py-2">
      <div className="text-center">
        <p className="kicker text-action">Road QR</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Scan a road</h1>
        <p className="mt-2 text-muted">Every road segment has a QR on its site board. Scan it to see how long the contractor must still repair it for free, what was spent on it, and to report a problem on that exact road.</p>
      </div>
      <Scanner />
      <p className="text-center text-sm text-muted">No board nearby? <Link href="/roads" className="font-semibold text-action underline">Browse all roads</Link> or try <Link href="/r/RD0220" className="font-semibold text-action underline">Kurla Andheri Road</Link>.</p>
    </div>
  );
}
