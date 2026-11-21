// Static, read-only snapshot of the public pages for GitHub Pages.
//   BASE_URL=http://localhost:3000 node scripts/snapshot.mjs out-dir
// Interactive features (reporting, sign-in, case actions) need the full app; the snapshot says so.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(process.argv[2] || '.data/pages');
const MAX = Number(process.env.MAX_PAGES || 140);
const seeds = ['/', '/spending', '/spending/cases', '/spending/wo/WO25-01590', '/accountability', '/accountability/work-orders/WO25-01590',
  '/accountability/complaints', '/accountability/complaints/BMC25-004138', '/wards', '/accountability/contractors/CT07', '/accountability/roads/RD0158'];
const follow = [/^\/spending\/ward\/[^/]+(\/[^/]+)?$/, /^\/spending\/case\/AQ-/, /^\/spending\/wo\/WO/, /^\/wards\/[^/]+(\/[^/]+)?$/, /^\/accountability\/contractors\/CT\d+$/];
const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

const pages = new Map(); // decoded path -> html
const queue = [...seeds];
const seen = new Set(seeds);
const assets = new Set();

function fileFor(p) { return path.join(OUT, ...p.split('/').filter(Boolean), 'index.html'); }
function rel(from, to) {
  const a = from.split('/').filter(Boolean), b = to.split('/').filter(Boolean);
  return ('../'.repeat(a.length) + b.join('/') + (b.length ? '/' : '')) || './';
}

while (queue.length && pages.size < MAX) {
  const batch = queue.splice(0, 6);
  await Promise.all(batch.map(async (p) => {
    const urlPath = p.split('/').map((s, i) => (i > 2 && p.startsWith('/spending/ward/') ? encodeURIComponent(s) : s)).join('/');
    const r = await fetch(BASE + (p.startsWith('/spending/ward/') || p.startsWith('/wards/') ? p.replace(/^(\/(?:spending\/ward|wards)\/)(.+)$/, (_, a, b) => a + encodeURIComponent(b)) : urlPath));
    if (!r.ok) return;
    const html = await r.text();
    pages.set(p, html);
    for (const m of html.matchAll(/href="(\/[^"#?]*)(\?[^"#]*)?"/g)) {
      const target = decodeURIComponent(m[1]).replace(/\/$/, '') || '/';
      if (target.startsWith('/_next/')) continue;
      if (!seen.has(target) && follow.some((re) => re.test(target)) && seen.size < MAX * 2) { seen.add(target); queue.push(target); }
    }
    for (const m of html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)) assets.add(m[1]);
  }));
}

fs.rmSync(OUT, { recursive: true, force: true });
for (const a of assets) {
  const r = await fetch(BASE + a);
  const f = path.join(OUT, a);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
}
const banner = () => `<div style="background:#fef3c7;color:#78350f;font:13px system-ui;padding:8px 16px;text-align:center">Static snapshot of the public pages (${stamp} IST). Reporting, sign-in, questions and reviewer actions need the full app: see <a style="color:#78350f;text-decoration:underline" href="https://github.com/Mehulkarotra098/civicops-mumbai#readme">how to run it</a>.</div>`;
for (const [p, html] of pages) {
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]+rel="(?:preload|modulepreload)"[^>]*>/g, '')
    .replace(/href="(\/_next\/static\/[^"]+\.css)"/g, (_, a) => `href="${rel(p, '/').replace(/\/?$/, '')}${a}"`.replace('href="./', 'href="'))
    .replace(/href="(\/[^"#?]*)(\?[^"#]*)?(#[^"]*)?"/g, (m, a, _q, h) => {
      if (a.startsWith('/_next/')) return m;
      const target = decodeURIComponent(a).replace(/\/$/, '') || '/';
      if (target === '/spending/export.csv') return `href="${rel(p, '/')}wardproof-public-spending.csv"`;
      return pages.has(target) ? `href="${rel(p, target)}${h ?? ''}"` : `href="${rel(p, '/')}not-in-snapshot/"`;
    })
    .replace(/<form\b/g, '<form onsubmit="alert(\'This is a static snapshot. Run the full app to use forms.\');return false"')
    .replace(/<body([^>]*)>/, (m) => `${m}${banner()}`);
  const f = fileFor(p);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, out);
}
const csv = await fetch(BASE + '/spending/export.csv');
fs.writeFileSync(path.join(OUT, 'wardproof-public-spending.csv'), Buffer.from(await csv.arrayBuffer()));
fs.mkdirSync(path.join(OUT, 'not-in-snapshot'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'not-in-snapshot', 'index.html'), `<!doctype html><meta charset="utf-8"><title>Not in snapshot</title><body style="font:16px system-ui;max-width:640px;margin:48px auto;padding:0 16px"><h1>Not included in this static snapshot</h1><p>This page needs the running app (sign-in, live data or search). The snapshot covers the public spending portal, the Link Road trace, ward pages and accountability cases.</p><p><a href="../">Back to the start</a></p>`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`Snapshot: ${pages.size} pages, ${assets.size} stylesheets → ${OUT}`);
