// Render the thumbnail concepts to PNG at exact platform sizes.
// YouTube wants 1280x720 (16:9). Devpost's gallery image is 3:2 → 1200x800.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const HTML = fileURLToPath(new URL('./thumb.html', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));

const JOBS = [
  { concept: 'a', cls: 'yt', w: 1280, h: 720, name: 'yt-a-euphemism.png' },
  { concept: 'a', cls: 'dp', w: 1200, h: 800, name: 'devpost-a-euphemism.png' },
  { concept: 'b', cls: 'yt', w: 1280, h: 720, name: 'yt-b-two-records.png' },
  { concept: 'b', cls: 'dp', w: 1200, h: 800, name: 'devpost-b-two-records.png' },
];

const browser = await chromium.launch();
for (const j of JOBS) {
  const page = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 2 });
  await page.goto(`file://${HTML}`);
  await page.evaluate((c) => {
    document.body.className = c.cls;
    document.getElementById('concept-a').style.display = c.concept === 'a' ? 'flex' : 'none';
    document.getElementById('concept-b').style.display = c.concept === 'b' ? 'flex' : 'none';
  }, j);
  await page.waitForTimeout(1800); // webfont + images
  await page.locator(`#concept-${j.concept}`).screenshot({ path: OUT + j.name });
  console.log('→', j.name, `${j.w}x${j.h} @2x`);
  await page.close();
}
await browser.close();
