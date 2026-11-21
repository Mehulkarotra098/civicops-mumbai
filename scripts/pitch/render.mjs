// Renders docs/pitch/deck.html to slide PNGs + a PDF, and writes the speaker notes to notes.json.
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = 'D:/hackathon/civicops-mumbai/docs/pitch';
fs.mkdirSync(`${dir}/slides`, { recursive: true });
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const br = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const p = await (await br.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5 })).newPage();
await p.goto(`file:///${dir}/deck.html?print`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const n = await p.locator('section.s').count();
const notes = [];
for (let k = 0; k < n; k++) {
  const s = p.locator('section.s').nth(k);
  await s.screenshot({ path: `${dir}/slides/slide-${String(k + 1).padStart(2, '0')}.png` });
  notes.push(await s.getAttribute('data-notes') ?? '');
}
fs.writeFileSync(`${dir}/slides/notes.json`, JSON.stringify(notes, null, 1));
await p.addStyleTag({ content: '@page{size:1920px 1080px;margin:0}.s{page-break-after:always;break-after:page}' });
await p.pdf({ path: `${dir}/CivicOps-Mumbai-pitch.pdf`, width: '1920px', height: '1080px', printBackground: true });
await br.close();
console.log('rendered', n, 'slides');
