// Records the 5-minute product story on the live demo: real clicks and typing with a visible cursor,
// captions in sync with the voice-over. DRY=1 runs the same steps without recording (to check every step works).
// Usage: node scripts/video2/record.mjs            -> .data/video2/raw.webm + timeline.json
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.BASE_URL || 'https://civicops-mumbai-demo.vercel.app';
const DRY = !!process.env.DRY;
const OUT = 'D:/hackathon/civicops-mumbai/.data/video2';
const scenes = JSON.parse(fs.readFileSync('scripts/video2/narration.json', 'utf8'));
const durs = JSON.parse(fs.readFileSync(`${OUT}/audio/durations.json`, 'utf8'));
const W = 1440, H = 810, PASSWORD = 'CivicOps@2026';
const PRE = 1000, POST = 1200;   // screen settles before the voice; a beat after it
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const browser = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const logo = 'data:image/png;base64,' + fs.readFileSync('D:/hackathon/video-edit/event-logo-src.png').toString('base64');

// ---------------------------------------------------------------- phone assets (the live site cannot be framed)
const assets = {};
{
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const pp = await pc.newPage();
  await pp.goto(base + '/r/RD0220', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await pp.waitForTimeout(2500);
  await pp.addStyleTag({ content: 'nav[aria-label="Quick links"]{display:none!important}' }).catch(() => {});
  const buf = await pp.screenshot({ fullPage: true });
  const fullH = await pp.evaluate(() => document.documentElement.scrollHeight);
  assets.shot = 'data:image/png;base64,' + buf.toString('base64');
  assets.shotH = Math.max(0, Math.round(fullH * (336 / 390) - 716));
  await pp.goto(base + '/r/RD0220/board', { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await pp.waitForTimeout(2500);
  const q = await pp.locator('svg[aria-label^="QR code"]').first().screenshot().catch(() => null);
  assets.qr = q ? 'data:image/png;base64,' + q.toString('base64') : '';
  await pc.close();
  console.log('phone assets ready', !!assets.qr);
}

// ---------------------------------------------------------------- cursor + caption layer injected into every page
const LAYER = `(() => {
  const ss = { get: (k, d) => { try { return sessionStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  function mk() {
    if (!document.body || document.getElementById('__fc')) return;
    const st = document.createElement('style');
    st.textContent = '@keyframes __rp{from{transform:scale(.35);opacity:1}to{transform:scale(1.7);opacity:0}}';
    document.head && document.head.appendChild(st);
    const c = document.createElement('div'); c.id = '__fc';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M5 2.5l13.5 8.8-6.3 1.3 3.4 7.3-2.9 1.4-3.3-7.4L5 18.6z" fill="#0b1324" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    const p = JSON.parse(ss.get('__fcp', '[720,430]'));
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));transform:translate(' + p[0] + 'px,' + p[1] + 'px)';
    document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id = '__cap'; cap.setAttribute('data-no-translate', '');
    cap.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:1120px;width:max-content;z-index:2147483646;background:rgba(11,19,36,.9);color:#fff;font:600 22px/1.35 Inter,"Segoe UI",sans-serif;padding:10px 22px;border-radius:14px;text-align:center;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.35)';
    const t = ss.get('__cap', ''); cap.textContent = t; cap.style.display = t ? 'block' : 'none';
    document.body.appendChild(cap);
  }
  window.__move = (x, y, ms) => { mk(); const c = document.getElementById('__fc'); if (!c) return; c.style.transition = 'transform ' + ms + 'ms cubic-bezier(.3,.7,.2,1)'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; ss.set('__fcp', JSON.stringify([x, y])); };
  window.__tap = (x, y) => { const r = document.createElement('div'); r.style.cssText = 'position:fixed;left:' + (x - 20) + 'px;top:' + (y - 20) + 'px;width:40px;height:40px;border-radius:50%;border:3px solid #2dd4bf;z-index:2147483646;pointer-events:none;animation:__rp .55s ease-out forwards'; document.body.appendChild(r); setTimeout(() => r.remove(), 650); };
  window.__cap = (t) => { mk(); ss.set('__cap', t || ''); const c = document.getElementById('__cap'); if (!c) return; c.textContent = t || ''; c.style.display = t ? 'block' : 'none'; };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
})();`;

const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  geolocation: { latitude: 19.1366, longitude: 72.8474, accuracy: 15 }, permissions: ['geolocation'],
  ...(DRY ? {} : { recordVideo: { dir: `${OUT}/raw`, size: { width: W, height: H } } }),
});
ctx.setDefaultTimeout(60000);
await ctx.addInitScript(LAYER);
const page = await ctx.newPage();
const t0 = Date.now();

// ---------------------------------------------------------------- helpers
let capTimers = [];
function captions(text, ms) {
  capTimers.forEach(clearTimeout); capTimers = [];
  const parts = text.match(/[^.?!:]+[.?!:]?/g).map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((s, p) => s + p.length, 0);
  let at = PRE;
  for (const p of parts) { capTimers.push(setTimeout(() => page.evaluate((t) => window.__cap && window.__cap(t), p).catch(() => {}), at)); at += (p.length / total) * ms; }
}
async function point(loc, ms = 800) {
  await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })).catch(() => {});
  await sleep(550);
  const bx = await loc.boundingBox().catch(() => null);
  if (!bx) return null;
  const x = bx.x + Math.min(bx.width / 2, 120), y = bx.y + bx.height / 2;
  await page.evaluate(([x, y, ms]) => window.__move && window.__move(x, y, ms), [x, y, ms]).catch(() => {});
  await sleep(ms + 120);
  return { x, y };
}
async function click(loc, pause = 700) {
  const p = await point(loc);
  if (p) await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [p.x, p.y]).catch(() => {});
  await loc.click();
  await sleep(pause);
}
async function type(loc, text) { await click(loc, 150); await loc.pressSequentially(text, { delay: 42 }); await sleep(500); }
async function go(path, wait = 900) { await page.goto(base + path, { waitUntil: 'load' }); await sleep(wait); }
async function login(email) { await ctx.clearCookies(); if (email) await ctx.request.post(`${base}/api/auth/login`, { data: { email, password: PASSWORD } }); }
async function glide(px, ms) { const steps = Math.max(8, Math.floor(ms / 60)); const y0 = await page.evaluate(() => scrollY); for (let i = 1; i <= steps; i++) { await page.evaluate((y) => scrollTo(0, y), y0 + (px * i) / steps).catch(() => {}); await sleep(ms / steps); } }

const CARD = (title, sub, small) => `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(1000px 520px at 82% 8%,#134e4a,transparent),linear-gradient(135deg,#0b1324,#17264a);font-family:Inter,Segoe UI,sans-serif;color:#fff;text-align:center;overflow:hidden}
  .lg{width:150px;height:150px;border-radius:22px;box-shadow:0 20px 50px rgba(0,0,0,.45);animation:u .8s .1s both}
  .k{letter-spacing:.2em;text-transform:uppercase;color:#5eead4;font-weight:800;font-size:16px;margin-top:26px;animation:u .8s .3s both}
  h1{font-size:68px;margin:.25em 0 .18em;font-weight:800;letter-spacing:-.02em;animation:u .8s .45s both}
  p{font-size:27px;color:#cbd5e1;margin:0;animation:u .8s .6s both}
  .l{width:0;height:4px;background:#2dd4bf;margin:30px auto 0;border-radius:4px;animation:g 2.2s .7s ease forwards}
  @keyframes g{to{width:480px}} @keyframes u{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
</style></head><body><div><img class="lg" src="${logo}"><div class="k">${small}</div><h1>${title}</h1><p>${sub}</p><div class="l"></div></div></body></html>`;
const PHONE = (shot, shotH, qr, ms) => `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;gap:70px;background:radial-gradient(900px 500px at 80% 10%,#134e4a,transparent),linear-gradient(135deg,#0b1324,#17264a);font-family:Inter,Segoe UI,sans-serif;color:#fff}
  .ph{width:330px;height:690px;border-radius:50px;padding:11px;background:#0f172a;box-shadow:0 40px 90px rgba(0,0,0,.55),inset 0 0 0 2px #334155;position:relative}
  .ph:before{content:"";position:absolute;top:20px;left:50%;transform:translateX(-50%);width:100px;height:24px;border-radius:20px;background:#0f172a;z-index:3}
  .scr{width:308px;height:668px;border-radius:40px;overflow:hidden;background:#fff}
  .scr img{width:308px;display:block;animation:sc ${ms}ms cubic-bezier(.45,.05,.35,1) forwards}
  @keyframes sc{0%,10%{transform:translateY(0)}85%,100%{transform:translateY(-${Math.round(shotH * 308 / 336)}px)}}
  .side{display:flex;flex-direction:column;gap:20px;max-width:450px}.qr{background:#fff;border-radius:22px;padding:16px;width:max-content}.qr img{width:210px;height:210px;display:block}
  .side b{font-size:40px;line-height:1.1}.side span{font-size:21px;color:#cbd5e1;line-height:1.4}.chip{font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5eead4}
</style></head><body><div class="ph"><div class="scr"><img src="${shot}"></div></div><div class="side"><div class="chip">Road QR · any phone camera</div><div class="qr"><img src="${qr}"></div><b>Scan the QR on any road</b><span>Warranty, money spent, and one tap to report a problem on that exact road.</span></div></body></html>`;

// ---------------------------------------------------------------- the story
let ref = '';
const RUN = {
  intro: async () => { await page.setContent(CARD('CivicOps Mumbai + WardProof', 'From a complaint to a verified fix, and every rupee behind it', 'Claude Community · Impact Lab · Mumbai'), { waitUntil: 'load' }); },
  problem: async (ms) => { await login(null); await go('/', 1200); await glide(1300, ms - 3500); },
  report: async () => {
    await login('asha@civicops.demo');
    await go('/report', 300);
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'load' }); await sleep(900);
    await click(page.getByRole('button', { name: /Waterlogging or flooded road/ }), 700);
    await click(page.getByRole('button', { name: /Knee deep/ }));
    await click(page.getByRole('button', { name: 'Rising' }));
    await click(page.getByRole('button', { name: 'Fully blocked' }));
    await type(page.getByLabel('Describe the problem in your own words'), 'Juhu Tara Road near the church is flooded knee deep, cars are stuck.');
  },
  location: async () => {
    await click(page.getByRole('button', { name: /Continue/ }), 900);
    await click(page.getByRole('button', { name: /Use my location/ }), 600);
    const card = page.getByTestId('routing-card');
    await card.getByText('Ward K/W', { exact: true }).waitFor();
    await sleep(600);
    await point(card.getByText('Ward K/W', { exact: true }), 800); await sleep(2200);
    await point(card.getByText(/Red · Critical/).first(), 800); await sleep(2500);
  },
  submit: async () => {
    await click(page.getByRole('button', { name: /Continue/ }), 800);
    await page.getByTestId('report-photo').setInputFiles(`${OUT}/flood_before.jpg`); await sleep(1500);
    await click(page.getByRole('button', { name: /Continue/ }), 800);
    await click(page.getByTestId('submit-report'), 300);
    const id = page.getByTestId('tracking-id'); await id.waitFor();
    ref = (await id.innerText()).trim(); console.log('ticket', ref);
    await point(id, 800); await sleep(2500);
  },
  assign: async () => {
    await login('admin@civicops.demo');
    await go('/admin', 1200);
    const link = page.getByRole('link', { name: ref }).first();
    await link.waitFor(); await point(link, 700); await sleep(900);
    await click(link, 300); await page.waitForURL(`**/tickets/${ref}`); await sleep(1200);
    let btn = page.getByRole('button', { name: 'Assign officer and contractor' });
    if (!(await btn.isVisible().catch(() => false))) { await click(page.getByText('More actions').first(), 600); btn = page.getByRole('button', { name: 'Assign officer and contractor' }); }
    await click(btn, 700);
    const off = page.locator('#s-officer'); await point(off, 500);
    const offLabel = await off.evaluate((s) => [...s.options].map((o) => o.textContent).find((t) => /Rahul/.test(t)) || s.options[1].textContent);
    await off.selectOption({ label: offLabel }); await sleep(700);
    const con = page.locator('#s-contractor'); await point(con, 500);
    await con.selectOption({ index: 1 }); await sleep(700);
    await click(page.getByRole('button', { name: 'Assign', exact: true }), 1200);
    await page.getByText(/Saved|timeline is updated/i).first().waitFor({ timeout: 20000 }).catch(() => {});
    const who = page.getByTestId('assignee'); await page.reload({ waitUntil: 'load' }); await sleep(900);
    await point(who, 800); await sleep(2800);
  },
  officer: async () => {
    await login('kw.officer@civicops.demo');
    await go('/notifications', 1200);
    const alert = page.getByText(new RegExp(`You were assigned ${ref}`)).first();
    if (await alert.isVisible().catch(() => false)) { await point(alert, 700); await sleep(900); }
    await go(`/tickets/${ref}`, 1000);
    await click(page.getByRole('button', { name: 'Record first action' }), 500);
    await type(page.getByLabel('What was done on site?'), 'Pump deployed at the low point, one lane barricaded');
    await click(page.getByRole('button', { name: 'Save first action' }), 400);
    await page.getByText('Saved. The timeline is updated.').waitFor(); await sleep(500);
    await click(page.getByRole('button', { name: 'Start work' }), 1200);
    await click(page.getByRole('button', { name: /Record: access restored/ }), 400);
    await page.getByText(/Access restored/).first().waitFor(); await sleep(500);
    await click(page.getByRole('radio', { name: 'after' }), 300);
    await page.getByTestId('staff-photo').setInputFiles(`${OUT}/flood_after.jpg`);
    await page.getByText('Uploaded · metadata removed').waitFor(); await sleep(600);
    await click(page.getByRole('button', { name: 'Submit completion for review' }), 400);
    await type(page.getByLabel('Repair note'), 'Inlet desilted, water cleared, both lanes open');
    await click(page.getByRole('button', { name: 'Submit for review' }), 400);
    await page.getByText('Awaiting verification').first().waitFor(); await sleep(800);
  },
  review: async () => {
    await login('admin@civicops.demo');
    await go(`/admin/review/${ref}`, 1500);
    const slider = page.locator('input[type=range]').first();
    if (await slider.isVisible().catch(() => false)) { await click(slider, 200); for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowLeft'); await sleep(90); } for (let i = 0; i < 12; i++) { await page.keyboard.press('ArrowRight'); await sleep(90); } await sleep(400); }
    await click(page.getByLabel('Before and after show the same location'), 250);
    await click(page.getByLabel('The reported problem is no longer visible'), 250);
    await click(page.getByLabel(/Officer's notes match/), 250);
    await type(page.getByLabel(/Reason/), 'Same stretch in both photos; road clear; access restored on record.');
    await click(page.getByTestId('approve'), 300);
    await page.waitForURL(`**/tickets/${ref}`, { waitUntil: 'commit' });
    await page.getByText('Green · Verified resolved').first().waitFor(); await sleep(2200);
  },
  resident: async (ms) => {
    await login('asha@civicops.demo');
    await go(`/tickets/${ref}`, 1000);
    await point(page.getByText('Green · Verified resolved').first(), 600); await sleep(800);
    await glide(700, Math.max(1500, ms - 4500));
  },
  road: async (ms) => { await login(null); await go('/r/RD0220', 1500); await glide(1700, ms - 3000); },
  phone: async () => { await page.setContent(PHONE(assets.shot, assets.shotH, assets.qr, Math.round(durs.phone * 1000) + PRE + POST), { waitUntil: 'load' }); },
  money: async (ms) => {
    await go('/spending/wo/WO25-01590', 1800);
    const billed = page.getByTestId('billed').first();
    if (await billed.isVisible().catch(() => false)) { await point(billed, 800); await sleep(2500); }
    const ref2 = page.getByTestId('reference').first();
    if (await ref2.isVisible().catch(() => false)) { await point(ref2, 800); await sleep(2500); }
    await glide(600, Math.max(2000, ms - 9000));
  },
  question: async (ms) => {
    await go('/spending/cases', 800);
    const c = page.locator('a[href^="/spending/case/"]').first();
    await point(c, 700); await sleep(600);
    const href = await c.getAttribute('href');
    await go(href, 1500); await glide(700, Math.max(2500, ms - 5000));
  },
  live: async (ms) => {
    await go('/live', 2500);
    await sleep(Math.max(1000, ms - 5000));
    const lang = page.getByLabel('Language').first();
    await point(lang, 500); await lang.selectOption('mr'); await sleep(2500);
    await ctx.addCookies([{ name: 'civicops_locale', value: 'en', url: base }]);
  },
  outro: async () => { await page.setContent(CARD('Every complaint has an owner.<br>Every rupee has a reason.', 'civicops-mumbai-demo.vercel.app', 'CivicOps Mumbai + WardProof'), { waitUntil: 'load' }); },
};

const timeline = [];
for (const s of scenes) {
  const start = Date.now();
  const ms = Math.round((durs[s.id] ?? 5) * 1000);
  timeline.push({ id: s.id, startMs: start - t0, voiceMs: start - t0 + PRE });
  captions(s.text, ms);
  try { await RUN[s.id](ms); } catch (e) { console.log('SCENE ERROR', s.id, e.message.split('\n')[0]); }
  await sleep(start + PRE + ms + POST - Date.now());
  console.log(s.id, ((Date.now() - start) / 1000).toFixed(1) + 's', 'narration', (ms / 1000).toFixed(1) + 's');
}
await page.evaluate(() => window.__cap && window.__cap('')).catch(() => {});
await sleep(800);
const video = DRY ? null : page.video();
await ctx.close();
if (video) { fs.copyFileSync(await video.path(), `${OUT}/raw.webm`); fs.writeFileSync(`${OUT}/timeline.json`, JSON.stringify(timeline, null, 1)); }
await browser.close();
console.log((DRY ? 'dry run ' : 'recorded ') + ((Date.now() - t0) / 60000).toFixed(2) + ' min', 'ticket', ref);
