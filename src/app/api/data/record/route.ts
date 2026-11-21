import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ingestRecord } from '@/lib/live';
import { apiError, requireApiUser } from '@/lib/session';

/** Enter one work order (bill) or one complaint by hand; validated and audited like an import. */
export async function POST(req: Request) {
  try {
    await requireApiUser(['super_admin']);
    const b = await req.json();
    const file = b.kind === 'complaint' ? 'complaints.csv' : 'work_orders.csv';
    const record = Object.fromEntries(Object.entries(b.record ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])) as Record<string, string>;
    const r = await ingestRecord(await getDb(), file, record, new Date());
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof Error && /^Fill in|missing column/.test(e.message)) return NextResponse.json({ error: 'invalid', message: e.message }, { status: 400 });
    return apiError(e);
  }
}
