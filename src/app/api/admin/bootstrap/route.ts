import path from 'node:path';
import { NextResponse } from 'next/server';
import { getDb, runMigrations } from '@/lib/db';
import { ingestDataset } from '@/lib/importer';
import { seedDemo } from '@/lib/demo-seed';
import { refreshDerived } from '@/lib/live';
import { ensureAdminFromEnv } from '@/lib/auth-core';

export const maxDuration = 300;

/**
 * One-time setup for a hosted deployment: migrations, import of the bundled dataset (seed-data/),
 * demo accounts and demo tickets. Idempotent. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden', message: 'Bootstrap needs the CRON_SECRET bearer token' }, { status: 403 });
  }
  const t0 = Date.now();
  const db = await getDb();
  const applied = await runMigrations(db, path.join(process.cwd(), 'migrations'));
  const url = new URL(req.url);
  let counts = null;
  if (url.searchParams.get('import') !== '0') {
    const r = await ingestDataset(db, path.join(process.cwd(), 'seed-data'), { origin: 'synthetic_repo', sourceRepo: 'https://github.com/SumeetGDoshi/Claude-Impact-Labs-data-2', commit: '81d22806af98bded38bc15b0e7be248e4fbdfd3b' });
    counts = r.counts;
  }
  const demo = await seedDemo(db, {});
  const derived = await refreshDerived(db, new Date());
  const admin = await ensureAdminFromEnv(db);
  return NextResponse.json({ applied, counts, demo: demo.message, derived, admin, seconds: Math.round((Date.now() - t0) / 1000) });
}
