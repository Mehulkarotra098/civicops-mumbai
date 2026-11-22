// Renders the share-preview images (1200x630) from scripts/og/*.html into public/og/*.png.
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const br = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const p = await (await br.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })).newPage();
for (const n of ['main', 'road']) {
  await p.goto(`file:///D:/hackathon/civicops-mumbai/scripts/og/${n}.html`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `D:/hackathon/civicops-mumbai/.data/og-${n}@2x.png` });
}
await br.close();
console.log('rendered');
