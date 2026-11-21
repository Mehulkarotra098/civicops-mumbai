import { NextResponse } from 'next/server';
import { getDb, withSystem } from '@/lib/db';
import { roadDirectory } from '@/lib/roads';

export const dynamic = 'force-dynamic';

/** Public road directory: warranty state and money signals per segment (synthetic dataset). */
export async function GET() {
  const d = await withSystem((q) => roadDirectory(q), await getDb());
  return NextResponse.json({ ...d, note: 'Synthetic Claude Impact Lab dataset, not BMC records.' });
}
