// SLA scheduler for deployments where the web server does not run it in-process
// (for example several serverless instances on hosted Postgres). Calls the protected
// endpoint every INTERVAL seconds; the endpoint is idempotent, so overlaps and retries are safe.
//   CRON_SECRET=... BASE_URL=http://localhost:3000 npm run scheduler
const base = process.env.BASE_URL || 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
const every = Number(process.env.INTERVAL || 60) * 1000;
if (!secret) { console.error('Set CRON_SECRET (same value as the server).'); process.exit(1); }
async function tick() {
  try {
    const r = await fetch(`${base}/api/cron/sla`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
    const j = await r.json();
    console.log(new Date().toISOString(), r.status, `checked ${j.checked ?? '?'} tickets, fired ${j.fired?.length ?? 0}`, (j.fired ?? []).map((f) => `${f.ref}:${f.key}`).join(' '));
  } catch (e) { console.error(new Date().toISOString(), 'scheduler call failed, will retry:', e.message); }
}
await tick();
setInterval(tick, every);
