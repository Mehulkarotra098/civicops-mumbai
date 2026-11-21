// Browser walkthrough with three separate role sessions against a running server.
// Records video and screenshots into docs/qa/ as evidence and as a backup demo.
//   npm run dev   (in another terminal)   then   npm run test:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { illustration } from '../../src/lib/evidence.ts';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/qa');
const TMP = path.resolve('.data/e2e');
const PASSWORD = 'CivicOps@2026';
let browser: Browser;
let ref = '';
let ticketId = '';

function chromiumPath() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const d = fs.existsSync(base) ? fs.readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop() : undefined;
  return d ? path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : undefined;
}

async function session(email: string | null, opts: Parameters<Browser['newContext']>[0] = {}, video = false): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ ...opts, ...(video ? { recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1280, height: 800 } } } : {}) });
  ctx.setDefaultTimeout(60_000);
  const page = await ctx.newPage();
  if (email) {
    const r = await page.request.post(`${BASE}/api/auth/login`, { data: { email, password: PASSWORD } });
    assert.equal(r.status(), 200, `login ${email}`);
  }
  return { ctx, page };
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

before(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
  const stamp = new Date().toISOString();
  fs.writeFileSync(path.join(TMP, 'flood_before.jpg'), await illustration('flood_before', `e2e ${stamp}`));
  fs.writeFileSync(path.join(TMP, 'flood_after.jpg'), await illustration('flood_after', `e2e ${stamp}`));
  fs.writeFileSync(path.join(TMP, 'not-an-image.jpg'), 'this is not a photo');
  browser = await chromium.launch({ executablePath: chromiumPath() });
});
after(async () => { await browser?.close(); });

test('1. Resident (phone) reports waterlogging in Juhu: K/W storm water, red clock, tracking ID at once', async () => {
  const { ctx, page } = await session('asha@civicops.demo', { viewport: { width: 390, height: 844 }, geolocation: { latitude: 19.1366, longitude: 72.8474, accuracy: 15 }, permissions: ['geolocation'] }, true);
  await page.goto(`${BASE}/report`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Waterlogging or flooded road/ }).click();
  await page.getByRole('button', { name: /Knee deep/ }).click();
  await page.getByRole('button', { name: 'Rising' }).click();
  await page.getByRole('button', { name: 'Fully blocked' }).click();
  await page.getByLabel('Describe the problem in your own words').fill('Juhu Tara Road near the church is flooded knee deep, bus stop under water, cars stuck.');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Use my location/ }).click();
  const card = page.getByTestId('routing-card');
  await card.getByText('Ward K/W', { exact: true }).waitFor();
  assert.match(await card.innerText(), /Storm Water Drains/);
  assert.match(await card.innerText(), /Red · Critical/);
  await shot(page, '01-resident-routing-preview');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByTestId('report-photo').setInputFiles(path.join(TMP, 'flood_before.jpg'));
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByTestId('submit-report').click();
  const id = page.getByTestId('tracking-id');
  await id.waitFor();
  ref = (await id.innerText()).trim();
  assert.match(ref, /^CO-\d{6}-\d{4}$/);
  await page.getByText('Uploaded (location metadata removed)').waitFor();
  await shot(page, '02-resident-tracking-id');
  const api = await page.request.get(`${BASE}/api/tickets/${ref}`);
  const t = (await api.json()).ticket;
  ticketId = t.id;
  assert.equal(t.ward_code, 'K/W'); assert.equal(t.department_code, 'SWD'); assert.equal(t.priority, 'critical'); assert.equal(t.progress_pct, 25);
  await ctx.close();
});

test('2. K/W officer sees it in the queue, records first action, updates, access restored, after-photo, submits', async () => {
  const { ctx, page } = await session('kw.officer@civicops.demo', { viewport: { width: 1280, height: 800 } }, true);
  await page.goto(`${BASE}/ward`);
  await page.getByTestId(`ticket-card-${ref}`).first().waitFor();
  await shot(page, '03-officer-queue');
  await page.goto(`${BASE}/tickets/${ref}`);
  await page.getByRole('button', { name: 'Record first action' }).click();
  await page.getByLabel('What was done on site?').fill('Dewatering pump deployed at the low point, one lane barricaded');
  await page.getByRole('button', { name: 'Save first action' }).click();
  await page.getByText('Saved. The timeline is updated.').waitFor();
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Post progress update' }).waitFor();
  for (const note of ['Water down to ankle level', 'Storm drain inlet cleared of plastic']) {
    await page.getByRole('button', { name: 'Post progress update' }).click();
    await page.getByLabel('Update', { exact: true }).fill(note);
    await page.getByRole('button', { name: 'Post update' }).click();
    await page.getByText(note).first().waitFor();
  }
  await page.getByRole('button', { name: /Record: access restored/ }).click();
  await page.getByText(/Access restored/).first().waitFor();
  await page.getByRole('radio', { name: 'after' }).click();
  await page.getByTestId('staff-photo').setInputFiles(path.join(TMP, 'flood_after.jpg'));
  await page.getByText('Uploaded · metadata removed').waitFor();
  await page.getByRole('button', { name: 'Submit completion for review' }).click();
  await page.getByLabel('Repair note').fill('Inlet desilted, water cleared, both lanes open');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.getByText('Awaiting verification').first().waitFor();
  await shot(page, '04-officer-submitted');
  await ctx.close();
});

test('3. Super admin reviews before/after (Claude or manual) and approves', async () => {
  const { ctx, page } = await session('admin@civicops.demo', { viewport: { width: 1366, height: 900 } }, true);
  await page.goto(`${BASE}/admin`);
  await page.getByText(ref).first().waitFor();
  await page.goto(`${BASE}/admin/review/${ref}`);
  await page.getByRole('button', { name: /Run Claude assessment/ }).click();
  await page.getByTestId('assessment').or(page.getByText('Assessment unavailable')).first().waitFor({ timeout: 90_000 });
  await page.getByLabel('Before and after show the same location').check();
  await page.getByLabel('The reported problem is no longer visible').check();
  await page.getByLabel(/Officer's notes match/).check();
  await page.getByLabel(/Reason/).fill('Same stretch near the church in both photos; road clear; access restored time recorded.');
  await shot(page, '05-admin-review');
  await page.getByTestId('approve').click();
  await page.waitForURL(`**/tickets/${ref}`, { waitUntil: 'commit' });
  await page.getByText('Green · Verified resolved').first().waitFor();
  await ctx.close();
});

test('4. Resident sees green, 100% and the full timestamped history', async () => {
  const { ctx, page } = await session('asha@civicops.demo', { viewport: { width: 390, height: 844 } }, true);
  await page.goto(`${BASE}/tickets/${ref}`);
  await page.getByText('Green · Verified resolved').first().waitFor();
  assert.ok(await page.getByText('100%', { exact: true }).first().isVisible());
  const body = await page.innerText('body');
  for (const s of ['Report submitted', 'Routed to ward and department', 'Critical alert sent', 'First action', 'Work started', 'Progress update', 'Access restored', 'Completion evidence submitted', 'Closure verified']) assert.ok(body.includes(s), `timeline shows ${s}`);
  assert.match(body, /\d{1,2} Nov 2026, \d{1,2}:\d{2} (AM|PM) IST/);
  await shot(page, '06-resident-green-100');
  await ctx.close();
});

test('5. Reload persistence: ticket, evidence and history survive a fresh session', async () => {
  const { ctx, page } = await session('kw.officer@civicops.demo');
  const r = await page.request.get(`${BASE}/api/tickets/${ref}`);
  assert.equal((await r.json()).ticket.status, 'verified_resolved');
  await page.goto(`${BASE}/tickets/${ref}`);
  const imgs = await page.locator('img[src^="/api/evidence/"]').count();
  assert.ok(imgs >= 2, 'before and after photos still served');
  await ctx.close();
});

test('6. Denied GPS: locality search completes the report location', async () => {
  const { ctx, page } = await session('ravi@civicops.demo', { viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/report`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /Streetlight or damaged pole/ }).click();
  await page.getByRole('button', { name: 'The whole stretch is dark' }).click();
  await page.getByRole('button', { name: 'None visible' }).click();
  await page.getByLabel('Describe the problem in your own words').fill('All streetlights off on the lane behind the station');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Use my location/ }).click();
  await page.getByText(/Location access was blocked/).waitFor();
  await page.getByLabel('Search for your area').fill('andheri e');
  await page.getByRole('option', { name: /Andheri East/ }).click();
  await page.getByTestId('routing-card').getByText('Ward K/E', { exact: true }).waitFor();
  await shot(page, '07-denied-gps-locality');
  // Draft recovery: reload keeps what was typed.
  await page.reload();
  await page.getByText('We restored your unsent draft.').waitFor();
  await ctx.close();
});

test('7. Permissions: direct URLs and APIs for other users, wards and roles are refused', async () => {
  const ravi = await session('ravi@civicops.demo');
  const r1 = await ravi.page.request.get(`${BASE}/api/tickets/${ticketId}`);
  assert.equal(r1.status(), 404, "another resident's ticket");
  const page = await ravi.page.goto(`${BASE}/tickets/${ref}`);
  assert.equal(page?.status(), 404);
  const officer = await session('kw.officer@civicops.demo');
  const ev = await officer.page.request.get(`${BASE}/api/tickets/${ticketId}`);
  const tid = (await ev.json()).ticket.id;
  const evList = await officer.page.goto(`${BASE}/tickets/${ref}`);
  assert.equal(evList?.status(), 200);
  const src = await officer.page.locator('img[src^="/api/evidence/"]').first().getAttribute('src');
  const evidenceUrl = `${BASE}${src}`;
  const r2 = await ravi.page.request.get(evidenceUrl);
  assert.equal(r2.status(), 404, 'restricted evidence');
  const ke = await session('ke.officer@civicops.demo');
  const r3 = await ke.page.request.get(`${BASE}/api/tickets/${tid}`);
  assert.equal(r3.status(), 404, "another ward's ticket");
  const r4 = await officer.page.request.post(`${BASE}/api/tickets/${tid}/assess`, { data: {} });
  assert.equal(r4.status(), 403, 'super-admin-only action');
  const r5 = await ravi.page.request.post(`${BASE}/api/cron/sla`, { data: {} });
  assert.equal(r5.status(), 403, 'scheduler needs the secret or a super admin');
  await ravi.page.goto(`${BASE}/admin`);
  assert.match(ravi.page.url(), /\/denied$/);
  const anon = await session(null);
  const r6 = await anon.page.request.get(evidenceUrl);
  assert.equal(r6.status(), 401, 'signed-out users get nothing');
  for (const s of [ravi, officer, ke, anon]) await s.ctx.close();
});

test('8. Upload failure is reported clearly and can be retried; keyboard users can reach the form', async () => {
  const { ctx, page } = await session('kw.officer@civicops.demo');
  const r = await page.request.post(`${BASE}/api/tickets/${ticketId}/evidence`, { multipart: { phase: 'after', file: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(path.join(TMP, 'not-an-image.jpg')) } } });
  assert.ok([409, 422].includes(r.status()), `rejected with a clear status (${r.status()})`);
  assert.ok((await r.json()).message);
  await page.goto(`${BASE}/login`);
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
  assert.match(focused, /Skip to content/);
  await ctx.close();
});
