// Records the narrated walkthrough: each scene stays on screen exactly as long as its voice-over,
// with burned-in captions. Writes .data/video/raw.webm and .data/video/timeline.json.
// Usage: BASE_URL=https://civicops-mumbai-demo.vercel.app node scripts/video/record.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'https://civicops-mumbai-demo.vercel.app';
const scenes = JSON.parse(fs.readFileSync('scripts/video/narration.json', 'utf8'));
const durs = JSON.parse(fs.readFileSync('.data/video/audio/durations.json', 'utf8'));
const W = 1440, H = 810;
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const browser = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
fs.mkdirSync('.data/video/raw', { recursive: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: '.data/video/raw', size: { width: W, height: H } } });
const page = await ctx.newPage();
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const CARD = (title, sub) => `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 600px at 70% 20%,#134e4a,transparent),linear-gradient(135deg,#0b1324,#17264a);font-family:Inter,Segoe UI,sans-serif;color:#fff;text-align:center}
  .k{letter-spacing:.2em;text-transform:uppercase;color:#5eead4;font-weight:800;font-size:18px}
  h1{font-size:76px;margin:.25em 0 .2em;font-weight:800;letter-spacing:-.02em}
  p{font-size:30px;color:#cbd5e1;margin:0}
  .l{width:0;height:4px;background:#2dd4bf;margin:36px auto 0;border-radius:4px;animation:g 2.4s ease forwards}@keyframes g{to{width:520px}}
</style></head><body><div><div class="k">Claude Impact Lab · Mumbai · 21 Nov 2026</div><h1>${title}</h1><p>${sub}</p><div class="l"></div></div></body></html>`;

const PHONE = (src) => `<!doctype html><html><head><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:64px;background:linear-gradient(135deg,#0b1324,#17264a);font-family:Inter,Segoe UI,sans-serif;color:#fff}
  .ph{width:390px;height:780px;border-radius:48px;padding:14px;background:#111827;box-shadow:0 30px 80px rgba(0,0,0,.5),inset 0 0 0 2px #334155;transform:scale(.92)}
  iframe{width:390px;height:780px;border:0;border-radius:36px;background:#fff}
  .t{max-width:420px}.t b{display:block;font-size:44px;line-height:1.1;margin-bottom:16px}.t span{font-size:22px;color:#cbd5e1}
</style></head><body><div class="ph"><iframe src="${src}"></iframe></div><div class="t"><b>Scan the QR on any road</b><span>Free-repair guarantee, the money spent, and one tap to report a problem on that exact road.</span></div></body></html>`;

async function captions(text, ms) {
  // Sentence-by-sentence captions, timed by sentence length across the scene's voice-over.
  const parts = text.match(/[^.?!:]+[.?!:]?/g).map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((s, p) => s + p.length, 0);
  let at = 0; const plan = parts.map((p) => { const x = { p, at }; at += (p.length / total) * ms; return x; });
  await page.evaluate((plan) => {
    document.getElementById('vo-cap')?.remove();
    const el = document.createElement('div');
    el.id = 'vo-cap'; el.setAttribute('data-no-translate', '');
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1080px;z-index:2147483647;background:rgba(11,19,36,.86);color:#fff;font:600 24px/1.35 Inter,Segoe UI,sans-serif;padding:12px 22px;border-radius:14px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none';
    document.body.appendChild(el);
    for (const s of plan) setTimeout(() => { el.textContent = s.p; }, s.at);
  }, plan);
}

async function glide(fraction, ms) {
  if (!fraction || ms < 1500) return sleep(ms);
  const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight).catch(() => 0);
  const target = h * fraction; const steps = Math.max(10, Math.floor(ms / 120));
  await sleep(ms * 0.15);
  for (let i = 1; i <= steps; i++) { await page.evaluate((y) => scrollTo(0, y), (target * i) / steps).catch(() => {}); await sleep((ms * 0.7) / steps); }
  await sleep(ms * 0.15);
}

let who = null;
const timeline = [];
for (const s of scenes) {
  const start = Date.now();
  const durMs = Math.round((durs[s.id] ?? 5) * 1000) + 700;
  timeline.push({ id: s.id, startMs: start - t0 });
  try {
    if (s.as && s.as !== who) { await ctx.clearCookies(); await ctx.request.post(`${base}/api/auth/login`, { data: { email: s.as, password: 'CivicOps@2026' } }); who = s.as; }
    if (!s.as && who && !s.card && !s.phone) { await ctx.clearCookies(); who = null; }
    if (s.lang) await ctx.addCookies([{ name: 'civicops_locale', value: s.lang, url: base }]);
    if (s.card) { const [t, sub] = s.card.split('|'); await page.setContent(CARD(t, sub), { waitUntil: 'load' }); }
    else if (s.phone) { await page.setContent(PHONE(base + s.phone), { waitUntil: 'load' }); await sleep(2500); }
    else if (s.firstLink) {
      await page.goto(base + (s.from ?? '/ward'), { waitUntil: 'load', timeout: 60000 });
      const href = await page.evaluate((p) => document.querySelector(`a[href^="${p}"]`)?.getAttribute('href'), s.firstLink);
      if (href) await page.goto(base + href, { waitUntil: 'load', timeout: 60000 });
    } else await page.goto(base + s.url, { waitUntil: 'load', timeout: 60000 });
    await sleep(s.card || s.phone ? 200 : 1200);
    await captions(s.text, durMs - (Date.now() - start));
    await glide(s.scroll ?? 0, durMs - (Date.now() - start));
  } catch (e) { console.log('scene error', s.id, e.message); await sleep(durMs - (Date.now() - start)); }
  if (s.lang) await ctx.addCookies([{ name: 'civicops_locale', value: 'en', url: base }]);
  console.log(s.id, ((Date.now() - start) / 1000).toFixed(1) + 's');
}
const video = page.video();
await ctx.close();
fs.copyFileSync(await video.path(), '.data/video/raw.webm');
fs.writeFileSync('.data/video/timeline.json', JSON.stringify(timeline, null, 1));
await browser.close();
console.log('recorded', ((Date.now() - t0) / 60000).toFixed(2), 'min');
