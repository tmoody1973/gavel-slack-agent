// Per-shot capture. Each run records ONE shot into captures/<shot>.webm.
// A flubbed shot is a re-run of that shot, never a re-record of everything.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  launchCapture, clickAt, clickLocator, typeHuman, waitForStreamDone, finishShot, dismissBanners,
  SEL, TEAM, CHANNELS,
} from './capture-lib.mjs';

const channelUrl = (id) => `https://app.slack.com/client/${TEAM}/${id}`;

async function openChannel(page, id) {
  await page.goto(channelUrl(id));
  await page.waitForSelector(SEL.composer, { timeout: 30000 });
  await dismissBanners(page);
  await page.waitForTimeout(4000); // let history render fully before anything on-camera happens
}

// Open a thread on the most recent alert card. Slack's message-actions toolbar is hover-revealed
// and races: the hover can lapse before the click lands, so retry the hover→click pair.
async function openAlertThread(page) {
  const card = page.locator('[data-qa="virtual-list-item"]', { hasText: 'Conditional use' }).last();
  await card.scrollIntoViewIfNeeded();
  for (let attempt = 1; attempt <= 4; attempt++) {
    await card.hover();
    await page.waitForTimeout(900);
    const replyButton = page.locator(SEL.replyInThread).first();
    const clicked = await clickLocator(page, replyButton).then(() => true).catch(() => false);
    if (clicked) {
      const opened = await page
        .waitForSelector(SEL.threadComposer, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (opened) return;
    }
    console.log(`  thread open attempt ${attempt} missed — retrying`);
    await page.waitForTimeout(800);
  }
  throw new Error('could not open the alert thread after 4 attempts');
}

// Count messages currently rendered in the open thread pane.
const threadMessageCount = (page) => page.locator(`${SEL.threadPane} [data-qa="message_container"]`).count();

// Ask a question in the alert thread and WAIT FOR GAVEL — not merely for the DOM to settle.
//
// Two things this gets right that the obvious version doesn't:
//  1. A bare reply in a channel thread does NOT engage the agent. app.event('message') only runs
//     when a session is primed, and the "💬 Ask Gavel" button is what primes it. Skip the click and
//     the question just sits there unanswered.
//  2. Settling on "thread text stopped changing" returns the instant OUR OWN message renders —
//     long before Gavel starts. Wait for the message COUNT to grow (Gavel's reply arriving), then
//     let the stream settle.
// Wait for Gavel's answer by its CONTENT, not by message count. Slack virtualizes long thread
// lists, so counting rendered [data-qa="message_container"] nodes under-reports once a thread grows
// past a handful of replies — the count never reaches the target and the wait times out even though
// the answer is right there. Every shot therefore names a phrase its real answer must contain.
async function waitForAnswer(page, expectText, timeoutMs = 260000) {
  const needle = expectText.toLowerCase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page.locator(SEL.threadPane).innerText().catch(() => '');
    if (text.toLowerCase().includes(needle)) return;
    await page.waitForTimeout(1500);
  }
  throw new Error(`Gavel's answer never contained "${expectText}" — did the thread get primed?`);
}

async function askInThread(page, question, expectText) {
  await typeHuman(page, SEL.threadComposer, question);
  await page.keyboard.press('Enter');
  await waitForAnswer(page, expectText);   // Gavel runs a multi-step tool loop; s5 is the slowest
  await waitForStreamDone(page, SEL.threadPane); // let the answer finish streaming
  await page.waitForTimeout(3000); // receipts settle
}

// Prime the thread, then open it.
//
// 💬 Ask Gavel registers the session that app.event('message') requires and posts an invitation
// into the thread — but it does NOT open the thread pane client-side (the handler just calls
// chat.postMessage with a thread_ts). So: click to prime, then open the thread the normal way.
// This is the product's real affordance, not a workaround — it's the path a resident takes.
async function primeAlertThread(page) {
  const card = page.locator('[data-qa="virtual-list-item"]', { hasText: 'Conditional use' }).last();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await clickLocator(page, card.locator('button:has-text("Ask Gavel")').first());
  await page.waitForTimeout(3500); // the priming prompt posts into the thread
  await openAlertThread(page);
}

const SHOTS = {
  // ⭐ The alert lands live. Trigger runs as a hidden child process — nothing on screen.
  async s2(page) {
    await openChannel(page, CHANNELS.general);

    // Sync on the trigger's OWN stdout, not on DOM state: it deletes the old card before posting a
    // fresh one, so Slack's virtual-list count goes 1 → 1 and any count-based signal never fires.
    const agentDir = fileURLToPath(new URL('../../agent', import.meta.url));
    const trigger = spawn('node', ['scripts/demo-live-alert.mjs'], { cwd: agentDir });
    // Settle the exit promise NOW — attaching an 'exit' listener after the child has already
    // exited never fires, and the capture would hang until the outer timeout killed it (losing
    // the recording, since finishShot never runs).
    const exited = new Promise((resolve) => trigger.on('exit', resolve));
    const posted = new Promise((resolve, reject) => {
      let buf = '';
      trigger.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        process.stdout.write(chunk);
        if (buf.includes('SWITCH TO SLACK NOW')) resolve();
      });
      trigger.stderr.on('data', (c) => process.stderr.write(c));
      trigger.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`trigger exited ${code}`))));
    });

    await posted;                     // prep (summary + news) is done; the post fires in 5s
    await page.waitForTimeout(9000);  // countdown + the card rendering in-channel — film it land
    const card = page.locator('[data-qa="virtual-list-item"]', { hasText: 'Conditional use' }).last();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    // Reveal the rest of the card (ES section → news → how to be heard) for the zoom cues.
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(4500);
    await exited;
  },

  async s3(page) {
    await openChannel(page, CHANNELS.general);
    await primeAlertThread(page);
    await askInThread(page, "Didn't we already push back on this?", 'community');
  },

  async s4(page) {
    await openChannel(page, CHANNELS.general);
    await primeAlertThread(page);
    await askInThread(page, 'Who owns 5825 W Hope Ave?', 'AFS');
  },

  // ⭐ The live transcript find: Gavel searches the hearing and streams back the quote + ▶ link.
  // We deliberately do NOT click play on the in-Slack clip here. Playwright records no audio, and
  // the money shot IS audio — so the assembly cuts to the real clip MP4 (with its own sound) for
  // playback. Chasing the virtualized <video> node just added a failure mode for nothing.
  async s5(page) {
    await openChannel(page, CHANNELS.general);
    await primeAlertThread(page);
    await askInThread(page, 'What did the Plan Commission actually call it on June 29?', 'computational');
    await page.waitForTimeout(4000); // hold on the quote + timestamp for the zoom cue
  },

  async s6(page) {
    await openChannel(page, CHANNELS.general);
    await typeHuman(page, SEL.composer, '/gavel search "data center"');
    await page.keyboard.press('Enter');
    await page.waitForSelector('text=260142', { timeout: 60000 });
    await page.waitForTimeout(6000);
  },

  // ⭐ Act: Spanish thread answer → comment modal → human edits it → sent. The never-cut beat.
  async s7(page) {
    await openChannel(page, CHANNELS.clarkeSquare);
    await primeAlertThread(page);
    await askInThread(page, '¿Qué significa esto para nuestro barrio?', 'centro de datos');
    await page.keyboard.press('Escape'); // close the thread pane; the CTA lives on the card

    const card = page.locator('[data-qa="virtual-list-item"]', { hasText: 'Conditional use' }).last();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await clickLocator(page, card.locator('button:has-text("Haz oír tu voz")').first());

    // Slack renders more than one [role="dialog"] node; scope to the wizard modal body or a bare
    // [role="dialog"] locator trips strict mode.
    const modal = page.locator('[data-qa="wizard_modal_body"]').first();
    await modal.waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500); // ✨ "Gavel is drafting your comment…" is on screen — hold on it

    // The drafting placeholder is read-only; the textarea only exists once Claude's draft lands.
    const body = modal.locator('textarea').first();
    await body.waitFor({ timeout: 120000 });
    await page.waitForTimeout(2500); // let the draft be readable before we touch it

    await clickLocator(page, page.getByRole('radio', { name: 'En contra' })); // position: Oppose
    await page.waitForTimeout(800);

    await clickLocator(page, body);
    await page.keyboard.press('End');
    await page.keyboard.type(' Gracias por escucharnos.', { delay: 55 }); // human in the loop
    await page.waitForTimeout(1200);

    // input[type="text"], NOT input — the radio buttons are <input type="radio">, so a bare
    // input.first() grabs a radio and the name types straight into the comment body instead.
    await clickLocator(page, modal.locator('input[type="text"]').first()); // "Tu nombre"
    await page.keyboard.type('María López', { delay: 55 });
    await page.waitForTimeout(1500); // the 🧪 demo-mode notice is visible here — zoom cue

    // The submit button lives in the modal FOOTER, a sibling of the body.
    await clickLocator(page, page.locator('button:has-text("Enviar a la ciudad")').first());
    await page.waitForTimeout(7000); // confirmation
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
