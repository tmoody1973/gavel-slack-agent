// Per-shot capture. Each run records ONE shot into captures/<shot>.webm.
// A flubbed shot is a re-run of that shot, never a re-record of everything.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  launchCapture, clickAt, typeHuman, waitForStreamDone, finishShot,
  SEL, TEAM, CHANNELS,
} from './capture-lib.mjs';

const channelUrl = (id) => `https://app.slack.com/client/${TEAM}/${id}`;

async function openChannel(page, id) {
  await page.goto(channelUrl(id));
  await page.waitForSelector(SEL.composer, { timeout: 30000 });
  await page.waitForTimeout(4000); // let history render fully before anything on-camera happens
}

// Open a thread on the most recent alert card (the message with the conditional-use header).
async function openAlertThread(page) {
  const card = page.locator('[data-qa="virtual-list-item"]', { hasText: 'Conditional use' }).last();
  await card.hover();
  await clickAt(page, SEL.replyInThread);
  await page.waitForSelector(SEL.threadComposer, { timeout: 15000 });
}

async function askInThread(page, question) {
  await typeHuman(page, SEL.threadComposer, question);
  await page.keyboard.press('Enter');
  await waitForStreamDone(page, SEL.threadPane);
  await page.waitForTimeout(3000); // receipts settle
}

const SHOTS = {
  // ⭐ The alert lands live. Trigger runs as a hidden child process — nothing on screen.
  async s2(page) {
    await openChannel(page, CHANNELS.general);
    const agentDir = fileURLToPath(new URL('../../agent', import.meta.url));
    const trigger = spawn('node', ['scripts/demo-live-alert.mjs'], { cwd: agentDir, stdio: 'inherit' });
    await page.waitForSelector('[data-qa="virtual-list-item"] >> text=In the local news', { timeout: 180000 });
    await page.waitForTimeout(8000); // linger on the landed card
    await new Promise((r) => trigger.on('exit', r));
  },

  async s3(page) {
    await openChannel(page, CHANNELS.general);
    await openAlertThread(page);
    await askInThread(page, "Didn't we already push back on this?");
  },

  async s4(page) {
    await openChannel(page, CHANNELS.general);
    await openAlertThread(page);
    await askInThread(page, 'Who owns 5825 W Hope Ave?');
  },

  // Live transcript find, then click play on the clip in-channel.
  async s5(page) {
    await openChannel(page, CHANNELS.general);
    await openAlertThread(page);
    await askInThread(page, 'What did the Plan Commission actually call it on June 29?');
    await page.keyboard.press('Escape'); // close thread pane
    const clip = page.locator('video, [data-qa="video_player"]').last();
    await clip.scrollIntoViewIfNeeded();
    await clickAt(page, 'video, [data-qa="video_player"]');
    await page.waitForTimeout(14000); // playback runs; assembly cuts to the source MP4 here
  },

  async s6(page) {
    await openChannel(page, CHANNELS.general);
    await typeHuman(page, SEL.composer, '/gavel search "data center"');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=260142', { timeout: 60000 });
    await page.waitForTimeout(6000);
  },

  // ⭐ Act: Spanish thread answer → modal → edit → send.
  async s7(page) {
    await openChannel(page, CHANNELS.clarkeSquare);
    await openAlertThread(page);
    await askInThread(page, '¿Qué significa esto para nuestro barrio?');
    await clickAt(page, 'button:has-text("Haz oír tu voz")');
    // Wait for the drafting placeholder to swap into the editable draft.
    await page.waitForSelector('textarea, [data-qa="texty_single_line_input"]', { timeout: 90000 });
    await clickAt(page, 'text=En contra'); // position: Oppose
    await clickAt(page, '[data-qa*="wysiwyg"], textarea');
    await page.keyboard.press('End');
    await page.keyboard.type(' Gracias.', { delay: 60 }); // the human-in-the-loop edit
    await typeHuman(page, 'input[type="text"]', 'María López');
    await clickAt(page, 'button:has-text("Enviar a la ciudad")');
    await page.waitForTimeout(6000); // confirmation with 🧪 notice
  },
};

const shot = process.argv[2];
if (!SHOTS[shot]) {
  console.error(`usage: node scripts/capture-shots.mjs <${Object.keys(SHOTS).join('|')}>`);
  process.exit(1);
}
const { ctx, page } = await launchCapture();
try {
  await SHOTS[shot](page);
} finally {
  await finishShot(ctx, page, shot);
}
