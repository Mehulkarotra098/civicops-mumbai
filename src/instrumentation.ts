// Runs once when the Next.js server starts. With the local PGlite database the server owns the
// data folder, so the SLA sweep runs in-process every minute (set SCHEDULER_INPROCESS=0 to disable
// and use `npm run scheduler` or a cron job calling /api/cron/sla instead).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./instrumentation-node');
    await startScheduler();
  }
}
