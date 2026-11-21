// Throttled deadline sweep (SLA thresholds + accountability-case escalations).
// Triggered after page renders on serverless hosts, at most once a minute per instance.
// Idempotent: unique keys in the database make concurrent or repeated sweeps safe.
import { getDb } from './db';
import { runSlaSweep } from './tickets';
import { runCaseSweep } from './cases';

const g = globalThis as unknown as { __civicopsLastSweep?: number };

export async function maybeSweep() {
  if (process.env.SCHEDULER_INPROCESS !== '0') return; // the long-running server already sweeps every minute
  const now = Date.now();
  if (g.__civicopsLastSweep && now - g.__civicopsLastSweep < 60_000) return;
  g.__civicopsLastSweep = now;
  try {
    const db = await getDb();
    await runSlaSweep(db, new Date());
    await runCaseSweep(db, new Date());
  } catch (e) {
    console.error('[sweep] failed', e);
  }
}
