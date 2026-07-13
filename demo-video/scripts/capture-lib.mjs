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
  threadComposer: '[data-qa="threads_flexpane"] [data-qa="message_input"] .ql-editor',
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
    @keyframes hfring{0%{box-shadow:0 0 0 0 rgba(64,158,255,.75)}100%{box-shadow:0 0 0 26px rgba(64,158,255,0)}}\`;
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

export async function typeHuman(page, selector, text) {
  await clickAt(page, selector);
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
