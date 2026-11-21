// Usage: node tests/e2e/shot.mjs <email|-> <path> <out.png> [width] [height]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [, , email, path, out, w = '1366', h = '900'] = process.argv;
const exe = process.env.PW_CHROMIUM || (() => {
  const base = `${process.env.LOCALAPPDATA}/ms-playwright`;
  const d = fs.readdirSync(base).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
  return `${base}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe`;
})();
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h } });
const page = await ctx.newPage();
const base = process.env.BASE_URL || 'http://localhost:3000';
if (email !== '-') {
  const r = await page.request.post(`${base}/api/auth/login`, { data: { email, password: 'CivicOps@2026' } });
  if (!r.ok()) throw new Error('login failed ' + r.status());
}
await page.goto(base + path, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('saved', out);
