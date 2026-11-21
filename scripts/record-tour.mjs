// Records a walkthrough video of the whole interface (desktop, then phone) against a running site.
// Usage: BASE_URL=https://civicops-mumbai-demo.vercel.app node scripts/record-tour.mjs docs/video
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BASE_URL || 'https://civicops-mumbai-demo.vercel.app';
const outDir = process.argv[2] || 'docs/video';
fs.mkdirSync(outDir, { recursive: true });
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const browser = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });

const pause = (p, ms) => p.waitForTimeout(ms);
async function glide(page, total = 1, steps = 40) {
  // Smooth scroll through the page so the viewer sees every section.
  const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const target = Math.max(0, h * total);
  for (let i = 1; i <= steps; i++) { await page.evaluate((y) => scrollTo(0, y), (target * i) / steps); await pause(page, 70); }
  await pause(page, 600);
  await page.evaluate(() => scrollTo({ top: 0 }));
}
async function visit(page, url, { hold = 2500, scroll = 0.9 } = {}) {
  try { await page.goto(base + url, { waitUntil: 'load', timeout: 60000 }); } catch { /* keep going */ }
  await pause(page, hold);
  if (scroll) await glide(page, scroll);
}
async function login(ctx, email) { await ctx.request.post(`${base}/api/auth/login`, { data: { email, password: 'CivicOps@2026' } }); }

async function tour(name, viewport) {
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: outDir, size: viewport }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Public
  await visit(page, '/', { hold: 3500, scroll: 1 });
  await visit(page, '/live', { hold: 6000, scroll: 1 });
  await visit(page, '/wards?ward=K%2FW', { hold: 6000, scroll: 0.6 });
  await visit(page, '/roads', { hold: 3000, scroll: 0.5 });
  await visit(page, '/r/RD0220', { hold: 3500, scroll: 1 });
  await visit(page, '/r/RD0220/board', { hold: 3500, scroll: 0.7 });
  await visit(page, '/scan', { hold: 2500, scroll: 0 });
  await visit(page, '/spending', { hold: 3500, scroll: 1 });
  await visit(page, '/spending/wo/WO25-01590', { hold: 3500, scroll: 1 });
  await visit(page, '/accountability', { hold: 3000, scroll: 0.8 });
  await visit(page, '/login', { hold: 2500, scroll: 0 });
  // Resident
  await login(ctx, 'asha@civicops.demo');
  await visit(page, '/my', { hold: 3000, scroll: 0.8 });
  await visit(page, '/report?category=road_damage&road=RD0158', { hold: 5000, scroll: 0.6 });
  // Officer
  await login(ctx, 'kw.officer@civicops.demo');
  await visit(page, '/ward', { hold: 3500, scroll: 0.7 });
  const ref = await page.evaluate(() => document.querySelector('a[href^="/tickets/"]')?.getAttribute('href'));
  if (ref) await visit(page, ref, { hold: 4000, scroll: 1 });
  await visit(page, '/ward/map', { hold: 5000, scroll: 0 });
  // Super admin
  await login(ctx, 'admin@civicops.demo');
  await visit(page, '/admin', { hold: 3500, scroll: 1 });
  await visit(page, '/admin/review', { hold: 2500, scroll: 0 });
  const rev = await page.evaluate(() => document.querySelector('a[href^="/admin/review/"]')?.getAttribute('href'));
  if (rev) await visit(page, rev, { hold: 4000, scroll: 1 });
  // Auditor and ward office
  await login(ctx, 'auditor@civicops.demo');
  await visit(page, '/oversight', { hold: 3000, scroll: 0.7 });
  // Marathi
  await ctx.addCookies([{ name: 'civicops_locale', value: 'mr', url: base }]);
  await visit(page, '/spending', { hold: 3500, scroll: 0.5 });
  await ctx.addCookies([{ name: 'civicops_locale', value: 'en', url: base }]);
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const dest = path.join(outDir, `civicops-tour-${name}.webm`);
  fs.renameSync(src, dest);
  console.log('saved', dest);
}

await tour('desktop', { width: 1440, height: 810 });
await tour('phone', { width: 390, height: 844 });
await browser.close();
