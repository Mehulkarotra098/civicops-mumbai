// Renders docs/roadmap/roadmap.html to a crisp PNG (3840x2160) for submissions.
import { chromium } from 'playwright';
import fs from 'node:fs';
const b = `${process.env.LOCALAPPDATA}/ms-playwright`;
const d = fs.readdirSync(b).filter((x) => x.startsWith('chromium_headless_shell')).sort().pop();
const br = await chromium.launch({ executablePath: `${b}/${d}/chrome-headless-shell-win64/chrome-headless-shell.exe` });
const p = await (await br.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })).newPage();
await p.goto('file:///D:/hackathon/civicops-mumbai/docs/roadmap/roadmap.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: 'D:/hackathon/civicops-mumbai/docs/roadmap/civicops-roadmap.png' });
await br.close();
console.log('ok');
