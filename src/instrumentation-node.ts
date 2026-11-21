// Node-only part of the server start hook (kept in its own file so the edge bundle never sees the DB driver).
export async function startScheduler() {
  if (process.env.SCHEDULER_INPROCESS === '0') return;
  const { getDb } = await import('./lib/db');
  const { runSlaSweep } = await import('./lib/tickets');
  const { runCaseSweep } = await import('./lib/cases');
  const g = globalThis as unknown as { __civicopsScheduler?: NodeJS.Timeout };
  if (g.__civicopsScheduler) return;
  const run = async () => {
    try {
      const r = await runSlaSweep(await getDb(), new Date());
      if (r.fired.length) console.log(`[sla] fired ${r.fired.map((f) => `${f.ref}:${f.key}`).join(', ')}`);
      const c = await runCaseSweep(await getDb(), new Date());
      if (c.length) console.log(`[cases] escalated ${c.join(', ')}`);
    } catch (e) {
      console.error('[sla] sweep failed, will retry next minute', e);
    }
  };
  g.__civicopsScheduler = setInterval(run, 60_000);
  setTimeout(run, 5_000);
}
