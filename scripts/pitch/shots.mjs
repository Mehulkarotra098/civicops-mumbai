// Fresh, crisp screenshots of the live demo for the pitch deck (viewport shots, 2x).
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'https://civicops-mumbai-demo.vercel.app';
const out = 'D:/hackathon/civicops-mumbai/docs/pitch/img';
fs.mkdirSync(out, { recursive: true });
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const br = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const hide = 'nav[aria-label="Quick links"]{display:none!important}';
async function shot(name, path, { w = 1440, h = 900, as = null, scroll = 0, first = null, from = null } = {}) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  if (as) await ctx.request.post(`${base}/api/auth/login`, { data: { email: as, password: 'CivicOps@2026' } });
  const p = await ctx.newPage();
  try {
    if (first) {
      await p.goto(base + from, { waitUntil: 'load', timeout: 90000 });
      const href = await p.evaluate((f) => document.querySelector(`a[href^="${f}"]`)?.getAttribute('href'), first);
      if (href) await p.goto(base + href, { waitUntil: 'load', timeout: 90000 });
    } else await p.goto(base + path, { waitUntil: 'load', timeout: 90000 });
    await p.waitForTimeout(5000);
    await p.addStyleTag({ content: hide }).catch(() => {});
    if (scroll) await p.evaluate((y) => scrollTo(0, y), scroll);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log('ok', name);
  } catch (e) { console.log('FAIL', name, e.message); }
  await ctx.close();
}
await shot('home', '/');
await shot('live', '/live', { scroll: 0 });
await shot('wards', '/wards?ward=K%2FW', { scroll: 180 });
await shot('spending', '/spending');
await shot('wo', '/spending/wo/WO25-01590');
await shot('accountability', '/accountability');
await shot('road-phone', '/r/RD0220', { w: 390, h: 844 });
await shot('board', '/r/RD0220/board', { w: 900, h: 1100 });
await shot('report-phone', '/report?category=waterlogging', { w: 390, h: 844, as: 'asha@civicops.demo' });
await shot('my-phone', '/my', { w: 390, h: 844, as: 'asha@civicops.demo' });
await shot('ticket', null, { as: 'kw.officer@civicops.demo', first: '/tickets/', from: '/ward' });
await shot('admin', '/admin', { as: 'admin@civicops.demo' });
await shot('review', null, { as: 'admin@civicops.demo', first: '/admin/review/', from: '/admin/review' });
await shot('case', null, { first: '/spending/case/', from: '/spending/cases' });
await br.close();
