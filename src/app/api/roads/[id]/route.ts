import { NextResponse } from 'next/server';
import { getDb, withSystem } from '@/lib/db';
import { roadProfile } from '@/lib/roads';

export const dynamic = 'force-dynamic';

/** Public profile of one road segment: warranty clock, repairs, flags, complaints and live tickets (no personal data). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const p = await withSystem((q) => roadProfile(q, id), await getDb());
  if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { boundary: _boundary, ...ward } = p.ward;
  return NextResponse.json({ ...p, ward, note: 'Synthetic Claude Impact Lab dataset, not BMC records.' });
}
