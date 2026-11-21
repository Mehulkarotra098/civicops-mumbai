import { NextResponse } from 'next/server';
import { getDb, withSystem } from '@/lib/db';
import { loadRefData } from '@/lib/tickets';
import { searchLocalities } from '@/lib/geo';

/** Public gazetteer search (synthetic localities with Marathi/Hindi aliases). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  const ref = await withSystem((tx) => loadRefData(tx), await getDb());
  const hits = searchLocalities(q, ref.localities, 8).map((l) => ({ name: l.name, ward_code: l.ward_code, lat: l.lat, lon: l.lon, aliases: l.aliases }));
  return NextResponse.json({ results: hits });
}
