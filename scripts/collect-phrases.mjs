// Collects every visible English phrase on every page, as every role, so Marathi and Hindi
// translations can cover the whole UI. Usage: BASE_URL=http://localhost:3100 node scripts/collect-phrases.mjs out.json
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'http://localhost:3100';
const out = process.argv[2] || '.data/phrases.json';
const exe = (() => {
  const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
  const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
  return `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe`;
})();

const PUBLIC = ['/', '/login', '/live', '/spending', '/spending/ward/K%2FW', '/spending/wo/WO25-01590', '/spending/cases', '/spending/case', '/wards', '/wards/K%2FW',
  '/accountability', '/accountability/complaints', '/accountability/contractors/CT01', '/accountability/work-orders/WO25-01590', '/denied',
  '/roads', '/r/RD0002', '/r/RD0039', '/r/RD0220', '/r/RD0220/board', '/wards?ward=K%2FW'];
const ROLES = {
  'asha@civicops.demo': ['/my', '/report', '/notifications'],
  'kw.officer@civicops.demo': ['/ward', '/ward?view=table', '/ward/map', '/notifications'],
  'kw.admin@civicops.demo': ['/cases', '/ward'],
  'auditor@civicops.demo': ['/oversight'],
  'admin@civicops.demo': ['/admin', '/admin/review', '/admin/triage', '/admin/config', '/admin/audit', '/admin/data', '/admin/signals', '/ward?status=all'],
};

const browser = await chromium.launch({ executablePath: exe });
const seen = new Map();
async function grab(page, path) {
  try { await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 }); } catch { /* keep what loaded */ }
  // Open every <details> and the first few links to a ticket / case / review so their text is collected too.
  const texts = await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
    const res = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const p = n.parentElement; if (!p || ['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT'].includes(p.tagName)) continue;
      const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) res.push(t);
    }
    document.querySelectorAll('[placeholder],[aria-label],[title],img[alt],option').forEach((el) => {
      for (const a of ['placeholder', 'aria-label', 'title', 'alt']) { const v = el.getAttribute(a); if (v) res.push(v.trim()); }
    });
    return res;
  });
  for (const t of texts) {
    const parts = [t, ...t.split(/\s[·•|→–]\s/).map((x) => x.trim())];
    const m = t.match(/^([^:]{2,60}):\s(.+)$/); if (m) parts.push(m[1]);
    for (const p of parts) {
      if (!p || p.length > 600 || !/[A-Za-z]{2}/.test(p)) continue;
      if (/^(CO|WO|BMC|CT|RD|WP|Q)[-\d]/.test(p) || /@/.test(p) || /^https?:/.test(p)) continue;
      const e = seen.get(p) ?? { n: 0, pages: new Set() }; e.n++; e.pages.add(path); seen.set(p, e);
    }
  }
  return page.evaluate(() => [...document.querySelectorAll('a[href^="/tickets/"],a[href^="/spending/case/"],a[href^="/admin/review/"]')].slice(0, 2).map((a) => a.getAttribute('href')));
}

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  if (email) await page.request.post(`${base}/api/auth/login`, { data: { email, password: 'CivicOps@2026' } });
  return { ctx, page };
}

{
  const { ctx, page } = await session(null);
  for (const p of PUBLIC) { const more = await grab(page, p); for (const m of more) await grab(page, m); }
  await ctx.close();
}
for (const [email, paths] of Object.entries(ROLES)) {
  const { ctx, page } = await session(email);
  for (const p of paths) { const more = await grab(page, p); for (const m of more) await grab(page, m); }
  await ctx.close();
}
await browser.close();
const list = [...seen.entries()].sort((a, b) => b[1].n - a[1].n).map(([text, e]) => ({ text, n: e.n, pages: [...e.pages].slice(0, 3) }));
fs.writeFileSync(out, JSON.stringify(list, null, 1));
console.log(`collected ${list.length} phrases → ${out}`);
