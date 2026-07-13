// The "before" frame: Milwaukee's actual public record for the SAME file Gavel alerts on.
// Not a mockup — the real page. The cold open cuts from this to Gavel's bilingual card.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const PAGES = [
  ['legistar-legislation.png', 'https://milwaukee.legistar.com/Legislation.aspx'],
  ['legistar-calendar.png', 'https://milwaukee.legistar.com/Calendar.aspx'],
];
const browser = await chromium.launch();
for (const [name, url] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(7000);
  const body = await page.locator('body').innerText().catch(() => '');
  const out = fileURLToPath(new URL(`../assembly/assets/${name}`, import.meta.url));
  await page.screenshot({ path: out });
  console.log(`${name}: ${body.length} chars | ${body.slice(0, 60).replace(/\n/g, ' ')}`);
  await page.close();
}
await browser.close();
