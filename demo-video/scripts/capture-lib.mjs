// Shared capture plumbing: persistent profile, per-shot recording, a VISIBLE cursor
// (Playwright recordings don't show the OS cursor), and stream-settling waits.
import { chromium } from 'playwright';
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROFILE = fileURLToPath(new URL('../.browser-profile', import.meta.url));
export const CAPTURES = fileURLToPath(new URL('../captures', import.meta.url));
export const TEAM = 'T0B8KS540G4';
export const CHANNELS = { general: 'C0B8KS5VCCC', clarkeSquare: 'C0BAPMK6HE2' };

// Every Slack selector lives here — rehearsal (Task 6 Step 3) fixes them in ONE place.
export const SEL = {
  composer: '[data-qa="message_input"] .ql-editor',
  threadPane: '[data-qa="threads_flexpane"]',
  threadComposer: '[data-qa="threads_flexpane"] .ql-editor',
  messageActions: '[data-qa="message_actions"]',
  replyInThread: '[data-qa="start_thread"]',
  browserContinue: 'text=use Slack in your browser',
};

const CURSOR_INIT = `
  const style = document.createElement('style');
  style.textContent = \`
    #hf-cursor{position:fixed;left:960px;top:540px;width:22px;height:22px;border-radius:50%;
      background:rgba(255,255,255,.9);border:2px solid rgba(20,20,20,.65);
      box-shadow:0 1px 6px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;
      transform:translate(-50%,-50%);transition:left .12s ease-out,top .12s ease-out}
    #hf-cursor.click{animation:hfring .45s ease-out}
    @keyframes hfring{0%{box-shadow:0 0 0 0 rgba(64,158,255,.75)}100%{box-shadow:0 0 0 26px rgba(64,158,255,0)}}
    /* Slack's promo/sandbox chrome — hidden outright. Clicking the X is unreliable and they
       reappear on navigation; on camera they are pure noise. */
    [data-qa="sandbox_banner"],[data-qa="banner"],[data-qa="sidebar_promo"],
    .p-sandbox_banner,.p-ia4_top_nav_banner,[class*="sandbox_banner"]{display:none !important}\`;
  document.addEventListener('DOMContentLoaded', () => {
    document.head.appendChild(style);
    const dot = document.createElement('div'); dot.id = 'hf-cursor'; document.body.appendChild(dot);
  });
`;

export async function launchCapture({ recordDir = CAPTURES } = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: recordDir, size: { width: 1920, height: 1080 } },
  });
  await ctx.addInitScript(CURSOR_INIT);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

async function setCursor(page, x, y, click = false) {
  await page.evaluate(
    ([cx, cy, doClick]) => {
      const dot = document.getElementById('hf-cursor');
      if (!dot) return;
      dot.style.left = cx + 'px';
      dot.style.top = cy + 'px';
      if (doClick) { dot.classList.remove('click'); void dot.offsetWidth; dot.classList.add('click'); }
    },
    [x, y, click],
  );
}

// Slack's promo banners ("Explore AI in Slack", the Slackbot AI-features bar) sit in frame on
// every shot. Dismiss them before recording matters. Best-effort — never fail a capture on chrome.
export async function dismissBanners(page) {
  const closers = [
    '[data-qa="sidebar_promo"] button[aria-label*="lose"]',
    'button[aria-label="Close"]',
    '[data-qa="banner"] button[aria-label*="ismiss"]',
    '[data-qa="banner_close_button"]',
  ];
  for (const sel of closers) {
    for (const btn of await page.locator(sel).all().catch(() => [])) {
      await btn.click({ timeout: 1500 }).catch(() => {});
    }
  }
  await page.waitForTimeout(500);
}

export async function moveTo(page, target) {
  const box = typeof target === 'string' ? await page.locator(target).first().boundingBox() : null;
  const x = box ? box.x + box.width / 2 : target.x;
  const y = box ? box.y + box.height / 2 : target.y;
  await page.mouse.move(x, y, { steps: 18 });
  await setCursor(page, x, y);
  await page.waitForTimeout(250);
  return { x, y };
}

export async function clickAt(page, target) {
  const { x, y } = await moveTo(page, target);
  await setCursor(page, x, y, true);
  await page.mouse.click(x, y);
  await page.waitForTimeout(300);
}

// Click a Locator with Playwright's own actionability (auto-wait, scroll, hover preserved),
// while still driving the visible cursor dot. Required for hover-revealed controls like Slack's
// message-actions toolbar: a synthetic mouse path can drift off the message and hide the toolbar
// before the click lands.
export async function clickLocator(page, locator) {
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await setCursor(page, x, y);
    await page.waitForTimeout(200);
    await setCursor(page, x, y, true);
  }
  await locator.click();
  await page.waitForTimeout(300);
}

// Focus a composer and type. MUST scroll the target into view first: the alert card is tall enough
// to push the thread composer below the fold, and a raw mouse click at an off-viewport coordinate
// silently does nothing — focus stays in the main channel composer and the message posts publicly.
export async function typeHuman(page, selector, text) {
  const target = page.locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await clickLocator(page, target);
  await page.keyboard.type(text, { delay: 45 });
}

export async function waitForStreamDone(page, containerSel, { settleMs = 4000, timeoutMs = 120000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const now = await page.locator(containerSel).innerText().catch(() => '');
    if (now !== last) { last = now; stableSince = Date.now(); }
    else if (Date.now() - stableSince >= settleMs && last.length > 0) return;
    await page.waitForTimeout(1000);
  }
  throw new Error(`stream did not settle within ${timeoutMs}ms for ${containerSel}`);
}

export async function finishShot(ctx, page, outName) {
  const video = page.video();
  await ctx.close(); // flushes the recording
  const src = await video.path();
  await rename(src, `${CAPTURES}/${outName}.webm`);
  console.log(`saved captures/${outName}.webm`);
}
