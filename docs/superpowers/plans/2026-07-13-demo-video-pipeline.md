# Demo Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce `demo-video/render/gavel-demo.mp4` — the ≤3:00 submission video — from ElevenLabs VO (Tarik's clone), Playwright-captured live Slack shots, and a HyperFrames assembly with kinetic type + zoom/pan.

**Architecture:** Three stages driven by measured audio durations: (1) synthesize 10 VO MP3s and measure them, (2) capture 6 Slack shots as separate recordings against the real deployed agent, (3) compose everything in HyperFrames and render. Spec: `docs/superpowers/specs/2026-07-13-demo-video-pipeline-design.md`.

**Tech Stack:** Node ≥22 · ElevenLabs REST API · Playwright (headed Chromium, persistent profile) · ffmpeg/ffprobe · HyperFrames CLI (`npx hyperframes`).

## Global Constraints

- **Deadline is today.** Prefer the working thing over the elegant thing at every fork.
- Final video **≤ 3:00** (`ffprobe` gate at 180s). Segment 6 is the pre-marked cut if over.
- All **four disclosures** are spoken VO lines (they are in the script JSON in Task 3 — do not trim them).
- **No terminal/code/IDE ever visible** in a capture. The alert trigger runs as a hidden child process.
- **No Fly deploys within 15 min of any capture run** (Socket Mode reconnect churn eats replies). Task 1 deploys once, first.
- ElevenLabs voice ID: `bMytOVfoTSi5oJ3DEe8q`. Key: `ELEVENLABS_API_KEY` (already in `~/.claude/.env`; export before running VO).
- Slack: team `T0B8KS540G4`, `#general` = `C0B8KS5VCCC`, bot token in `agent/.env.local` as `SLACK_BOT_TOKEN`.
- Media artifacts (`vo/out/`, `captures/`, `render/`, `.browser-profile/`) are **gitignored**; scripts and composition are committed.
- Fallback rule (pre-agreed): if capture automation has burned **>1 hour total**, stop — Tarik records manually per `docs/DEMO-CAPTURE-PLAN.md` and Tasks 6's outputs are replaced by his files with the same names. Tasks 7–8 are unchanged.
- Capture scripts are verified against live Slack (that *is* their test). Pure logic (VO gen, budget math) gets `node:assert` self-checks.

---

### Task 1: Deploy the modal-label fix and let Socket Mode settle

The `a549aee` fix ("Your address (optional) (optional)") is server-side; SHOT 7 films the modal. Deploy now so churn settles hours before capture.

**Files:** none (deploy only).

**Interfaces:**
- Produces: deployed `gavel-app` running current `main`; a settled Socket Mode connection.

- [ ] **Step 1: Codegen before deploy** (gitignored `_generated` is baked into the image — known gotcha)

```bash
cd /Users/tarikmoody/Documents/Projects/gavel-slack-agent/agent && npx convex codegen
```

- [ ] **Step 2: Deploy**

```bash
# ⚠️ NOT `-a gavel-app` from agent/ — agent/fly.toml is the POLLER config and -a only renames
# the target; it would replace the Bolt agent with supercronic and downsize 4GB→256MB.
cd /Users/tarikmoody/Documents/Projects/gavel-slack-agent && fly deploy -c fly.app.toml --remote-only
```
Expected: deploy completes; machines restart at shared-cpu-2x:4096MB.

- [ ] **Step 3: Verify settled**

```bash
sleep 180 && timeout 20 fly logs -a gavel-app --no-tail 2>&1 | grep -E "Gavel is running|too_many" | tail -5
```
Expected: `Gavel is running!` present; no `too_many_websockets` lines newer than ~2 min after restart.

---

### Task 2: Scaffold `demo-video/`

**Files:**
- Create: `demo-video/package.json`, `demo-video/.gitignore`

**Interfaces:**
- Produces: `demo-video/` with `playwright` installed and Chromium downloaded; dirs `scripts/ vo/ captures/ assembly/ render/`.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/tarikmoody/Documents/Projects/gavel-slack-agent && mkdir -p demo-video/{scripts,vo,captures,assembly,render}
cat > demo-video/package.json <<'EOF'
{ "name": "gavel-demo-video", "private": true, "type": "module",
  "dependencies": { "playwright": "^1.49.0" } }
EOF
cat > demo-video/.gitignore <<'EOF'
node_modules/
vo/out/
captures/
render/
.browser-profile/
snapshots/
EOF
cd demo-video && npm install && npx playwright install chromium
```
Expected: install succeeds; `npx playwright --version` prints a version.

- [ ] **Step 2: Commit**

```bash
git add demo-video/package.json demo-video/.gitignore && git commit -m "chore(demo-video): scaffold pipeline workspace"
```

---

### Task 3: VO — script JSON, generator, budget gate

Ten audio parts (segment 5's VO brackets the clip: `s5a` before, `s5c` after). The four disclosures are inlined as spoken lines — **verbatim below, do not edit while implementing.**

**Files:**
- Create: `demo-video/vo/script.json`, `demo-video/scripts/vo-generate.mjs`

**Interfaces:**
- Produces: `demo-video/vo/out/<id>.mp3` ×10 and `demo-video/vo/out/durations.json` — `{ "s1": 24.8, ... }` (seconds, one decimal). Task 7 consumes `durations.json` as the timeline clock.

- [ ] **Step 1: Write `demo-video/vo/script.json`** (exact content)

```json
[
  { "id": "s1", "text": "City Hall publishes everything. Nobody reads it. The vote happens — you find out after. I know: I sit on Milwaukee's City Plan Commission. This spring, a data center was headed for a vacant Walmart — right next to people's homes. And the city's own filing never called it a data center. It called it a \"computational research facility.\" The neighborhood figured it out anyway. They packed a seven-hour hearing. And two weeks ago, the developer dropped it. They won. But they had to do all of it in the dark. Gavel is so the next block doesn't have to." },
  { "id": "s2", "text": "This is not a chatbot — nobody asked it anything. Gavel watches the city's agenda system. I'm firing this alert manually so it lands on camera; in production it runs on a five-minute cron. It posts in plain English — and in Spanish, because that's who lives on this block. What it is. Why it matters. When the hearing is, and how to speak at it. And it pulls the local reporting right onto the card — residents push back… commission punts… redevelopment drops data center plan. The whole fight, on one card, before you have to go looking for it." },
  { "id": "s3", "text": "And it knows what this neighborhood already said — in their own words — right next to the city's official filing. These neighbor messages are real, documented sentiment from local reporting, posted fresh for this demo, because Slack can't backdate. Gavel queries them live, through Slack's Real-Time Search API — and never stores them. Your neighbors' conversations are not a training set. That's a design decision, and it's the reason this is safe to put in a real community's Slack." },
  { "id": "s4", "text": "Residents asked one question for months: who is actually behind this? Nobody would say. Gavel just answers it — it pulls the property record live. AFS Milwaukee, L.L.C." },
  { "id": "s5a", "text": "And then there's what they called it. Milwaukee publishes video of these meetings — it does not publish transcripts. So what gets said in that room is, in practice, unsearchable. Gavel transcribed the hearing and found the moment — watch it search. It clipped that moment out of the webcast, too. I posted the clip before I hit record; in production, Gavel hands you a timestamped link straight into the video — which is exactly what it just did." },
  { "id": "s5c", "text": "A \"computational research facility.\" You cannot fight a thing that nobody will call by its name. Gavel doesn't need you to know the name." },
  { "id": "s6", "text": "They beat the data center on their block. But on July twentieth, the city writes the rules for data centers everywhere in Milwaukee — file two six zero one four two — on the same agenda as this site. That vote is still coming. Most of the city has no idea." },
  { "id": "s7", "text": "Knowing isn't enough — you have to be able to answer back. A neighbor asks in Spanish; Gavel answers in Spanish. Not translated — written in Spanish. Then it drafts her public comment — her words, her position — ready to file with the city before the hearing. She edits it. She sends it. In this demo it goes to a test inbox — never a real city clerk. A human is always in the loop. That's the whole point: information becomes action." },
  { "id": "s8", "text": "Three memories, one agent. The official record — a custom MCP server over Milwaukee's Legistar and property data. The public spoken record — meeting transcripts and the zoning code. And the community's own memory — live, through Slack's Real-Time Search. It indexes the public record. It queries the private one live, and never stores it. Take Real-Time Search away, and Gavel either goes deaf to its own neighborhood — or it starts warehousing people's messages. That's not a feature I bolted on. It's the reason the architecture is shaped like this." },
  { "id": "s9", "text": "That neighborhood won because a handful of people worked out what a \"computational research facility\" was — and showed up. Most blocks don't get that lucky. They find out after. Milwaukee runs on Legistar — so do three hundred other cities. The Milwaukee Civic MCP server is open source today. I sit on the commission that votes on this. I watch people find out after. Gavel is how they find out before." }
]
```

- [ ] **Step 2: Write `demo-video/scripts/vo-generate.mjs`**

```js
// Synthesize the VO segments with ElevenLabs and measure durations — the timeline's master clock.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VOICE_ID = 'bMytOVfoTSi5oJ3DEe8q';
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error('export ELEVENLABS_API_KEY first (it lives in ~/.claude/.env)');

const root = fileURLToPath(new URL('../vo/', import.meta.url));
const segments = JSON.parse(await readFile(`${root}script.json`, 'utf8'));
await mkdir(`${root}out`, { recursive: true });

const durations = {};
for (const { id, text } of segments) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} — ${await res.text()}`);
  const mp3Path = `${root}out/${id}.mp3`;
  await writeFile(mp3Path, Buffer.from(await res.arrayBuffer()));
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3Path]),
  );
  durations[id] = Math.round(seconds * 10) / 10;
  console.log(`${id}: ${durations[id]}s`);
}
await writeFile(`${root}out/durations.json`, JSON.stringify(durations, null, 2));

const total = Object.values(durations).reduce((a, b) => a + b, 0);
const CLIP_AND_PAUSES = 16; // ~12s clip playback + typographic pause beats
console.log(`VO total: ${total.toFixed(1)}s · projected video: ${(total + CLIP_AND_PAUSES).toFixed(1)}s`);
if (total + CLIP_AND_PAUSES > 180) {
  console.log(`⚠️ OVER 3:00 — cut s6 (−${durations.s6}s) → ${(total + CLIP_AND_PAUSES - durations.s6).toFixed(1)}s`);
}
```

- [ ] **Step 3: Run it** (live API call — this is the test)

```bash
cd demo-video && export $(grep -h '^ELEVENLABS_API_KEY=' ~/.claude/.env) && node scripts/vo-generate.mjs
```
Expected: 10 lines `sN: <seconds>s`, `durations.json` written, projected total printed. **Listen to `s1.mp3` and one other** — verify it sounds like Tarik and pronounces "Gavel" and "Legistar" acceptably. If a word mangles, respell it phonetically in `script.json` for that segment only and re-run (the generator overwrites).

- [ ] **Step 4: Budget decision**

If projected > 180s: plan to drop s6 in assembly (do NOT delete the MP3). Note the decision in the commit message.

- [ ] **Step 5: Commit**

```bash
git add demo-video/vo/script.json demo-video/scripts/vo-generate.mjs && git commit -m "feat(demo-video): VO v5 script (disclosures inlined) + ElevenLabs generator"
```

---

### Task 4: Capture profile login (human step)

**Files:**
- Create: `demo-video/scripts/login.mjs`

**Interfaces:**
- Produces: `demo-video/.browser-profile/` holding a logged-in Slack web session. All capture scripts reuse it via `launchCapture()` (Task 5).

- [ ] **Step 1: Write `demo-video/scripts/login.mjs`**

```js
// One-time bootstrap: opens the persistent profile so Tarik can log into Slack web by hand.
// Re-run any time to verify the session still holds.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const PROFILE = fileURLToPath(new URL('../.browser-profile', import.meta.url));
const GENERAL = 'https://app.slack.com/client/T0B8KS540G4/C0B8KS5VCCC';

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: { width: 1920, height: 1080 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(GENERAL);
console.log('Log into Slack in the window (choose "use Slack in your browser" if prompted).');
console.log('When #general is visible, press Enter here.');
await new Promise((resolve) => process.stdin.once('data', resolve));
const composer = page.locator('[data-qa="message_input"]').first();
console.log((await composer.isVisible()) ? '✅ logged in — composer visible' : '❌ composer NOT visible — selectors need adjusting before capture');
await ctx.close();
process.exit(0);
```

- [ ] **Step 2: HUMAN — Tarik runs it and logs in**

```bash
cd demo-video && node scripts/login.mjs
```
Expected: `✅ logged in — composer visible`. If ❌ but Slack is clearly loaded, note the real composer selector from DevTools — Task 5 centralizes selectors in one place.

- [ ] **Step 3: Verify persistence** — run it again; it must reach ✅ *without* logging in again.

- [ ] **Step 4: Commit**

```bash
git add demo-video/scripts/login.mjs && git commit -m "feat(demo-video): persistent-profile login bootstrap"
```

---

### Task 5: Capture library — cursor overlay, helpers, smoke test

**Files:**
- Create: `demo-video/scripts/capture-lib.mjs`

**Interfaces:**
- Produces (Task 6 consumes):
  - `launchCapture({ recordDir }) → { ctx, page }` — persistent profile, 1920×1080, per-page webm recording into `recordDir`, cursor overlay injected.
  - `SEL` — all Slack selectors in one object (single place to fix after rehearsal).
  - `moveTo(page, selectorOrXY)` / `clickAt(page, selector)` — moves the visible cursor smoothly, click shows a ripple.
  - `typeHuman(page, selector, text)` — focuses composer, types at ~45ms/key.
  - `waitForStreamDone(page, containerSel, { settleMs = 4000, timeoutMs = 120000 })` — resolves when the container's innerText stops changing for `settleMs`.
  - `finishShot(ctx, page, outName)` — closes context, renames the webm to `captures/<outName>.webm`.

- [ ] **Step 1: Write `demo-video/scripts/capture-lib.mjs`**

```js
// Shared capture plumbing: persistent profile, per-shot recording, a VISIBLE cursor
// (Playwright recordings don't show the OS cursor), and stream-settling waits.
import { chromium } from 'playwright';
import { rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROFILE = fileURLToPath(new URL('../.browser-profile', import.meta.url));
export const CAPTURES = fileURLToPath(new URL('../captures', import.meta.url));
export const TEAM = 'T0B8KS540G4';
export const CHANNELS = { general: 'C0B8KS5VCCC' }; // clarke-square id added in Task 6 Step 1

// Every Slack selector lives here — rehearsal (Task 6 Step 2) fixes them in ONE place.
export const SEL = {
  composer: '[data-qa="message_input"] .ql-editor',
  threadPane: '[data-qa="threads_flexpane"]',
  threadComposer: '[data-qa="threads_flexpane"] [data-qa="message_input"] .ql-editor',
  lastMessage: '[data-qa="virtual-list-item"]:last-child',
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
```

- [ ] **Step 2: Smoke test** (this is the task's runnable check)

```bash
cd demo-video && node -e "
import('./scripts/capture-lib.mjs').then(async ({ launchCapture, moveTo, finishShot, TEAM, CHANNELS }) => {
  const { ctx, page } = await launchCapture();
  await page.goto('https://app.slack.com/client/' + TEAM + '/' + CHANNELS.general);
  await page.waitForTimeout(6000);
  await moveTo(page, { x: 960, y: 400 });
  await page.screenshot({ path: 'captures/smoke.png' });
  await finishShot(ctx, page, 'smoke');
});"
```
Expected: `captures/smoke.webm` + `captures/smoke.png` exist. **Read the PNG**: #general visible, alert card visible, white cursor dot visible. Delete both after checking.

- [ ] **Step 3: Commit**

```bash
git add demo-video/scripts/capture-lib.mjs && git commit -m "feat(demo-video): capture library — cursor overlay, stream waits, per-shot recording"
```

---

### Task 6: Shot capture scripts + clip source + webm→mp4

**Files:**
- Create: `demo-video/scripts/capture-shots.mjs`, `demo-video/scripts/fetch-clip.mjs`, `demo-video/scripts/to-mp4.sh`

**Interfaces:**
- Consumes: everything `capture-lib.mjs` exports.
- Produces: `captures/s2.mp4 … s7.mp4` and `captures/clip-source.mp4` (Task 7's inputs).

- [ ] **Step 1: Resolve `#clarke-square` channel id** and paste it into `CHANNELS` in `capture-lib.mjs`:

```bash
cd agent && node -e "
import('@slack/web-api').then(async ({ WebClient }) => {
  (await import('dotenv')).config({ path: '.env.local' });
  const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
  const r = await slack.conversations.list({ team_id: 'T0B8KS540G4', limit: 200 });
  console.log(r.channels.filter(c => /clarke/i.test(c.name)).map(c => c.id + ' #' + c.name));
});"
```

- [ ] **Step 2: Write `demo-video/scripts/capture-shots.mjs`** — one async function per shot, CLI-selectable (`node scripts/capture-shots.mjs s3`). Structure (complete file):

```js
// Per-shot capture. Each run records ONE shot into captures/<shot>.webm.
// A flubbed shot is a re-run of that shot, never a re-record of everything.
import { spawn } from 'node:child_process';
import {
  launchCapture, moveTo, clickAt, typeHuman, waitForStreamDone, finishShot,
  SEL, TEAM, CHANNELS,
} from './capture-lib.mjs';

const channelUrl = (id) => `https://app.slack.com/client/${TEAM}/${id}`;

async function openChannel(page, id) {
  await page.goto(channelUrl(id));
  await page.waitForSelector(SEL.composer, { timeout: 30000 });
  await page.waitForTimeout(4000); // let history render fully before recording matters
}

// Open a thread on the most recent alert card (the message with a header block).
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
    const trigger = spawn('node', ['scripts/demo-live-alert.mjs'], {
      cwd: new URL('../../agent', import.meta.url).pathname, stdio: 'inherit',
    });
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
    await page.waitForSelector('text=Gavel', { timeout: 15000 });
    // Wait for the drafting placeholder to swap into the editable draft.
    await page.waitForSelector('textarea, [data-qa="texty_single_line_input"]', { timeout: 90000 });
    await clickAt(page, 'text=En contra'); // position: Oppose
    const body = page.locator('[data-qa*="wysiwyg"], textarea').first();
    await clickAt(page, '[data-qa*="wysiwyg"], textarea');
    await page.keyboard.press('End');
    await page.keyboard.type(' Gracias.', { delay: 60 }); // the human-in-the-loop edit
    await typeHuman(page, 'input[type="text"]', 'María López');
    await clickAt(page, 'button:has-text("Enviar a la ciudad")');
    await page.waitForTimeout(6000); // confirmation with 🧪 notice
  },
};

const shot = process.argv[2];
if (!SHOTS[shot]) { console.error(`usage: node scripts/capture-shots.mjs <${Object.keys(SHOTS).join('|')}>`); process.exit(1); }
const { ctx, page } = await launchCapture();
try { await SHOTS[shot](page); } finally { await finishShot(ctx, page, shot); }
```

- [ ] **Step 3: REHEARSAL — run `s3` first** (cheapest full-stack shot: thread + typing + streaming):

```bash
cd demo-video && node scripts/capture-shots.mjs s3
```
Expected: `captures/s3.webm`. **Watch it** (open in QuickTime or `/watch`). The selectors in `SEL` and in `SHOTS` were written from Slack's `data-qa` conventions and **will need adjustment** — that is what this step is for. Fix selectors in `capture-lib.mjs`/`capture-shots.mjs` until s3 is clean. ⏱️ **The 1-hour fallback clock runs on this step.**

- [ ] **Step 4: Capture the rest, watching each**

```bash
for s in s2 s4 s5 s6 s7; do node scripts/capture-shots.mjs $s; done
```
Between shots, verify each webm before moving on. s2 note: the trigger deletes the old card and posts fresh — the channel ends demo-ready. s7 note: this SENDS a comment to the test inbox — expected and disclosed.

- [ ] **Step 5: Write `demo-video/scripts/fetch-clip.mjs`** — pull the clip MP4 (with its audio) from Slack for the S5b full-bleed cut:

```js
import { writeFile } from 'node:fs/promises';
import { WebClient } from '@slack/web-api';
import { config } from 'dotenv';
config({ path: new URL('../../agent/.env.local', import.meta.url).pathname });

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const files = await slack.files.list({ channel: 'C0B8KS5VCCC', types: 'videos', count: 5 });
const clip = files.files?.[0];
if (!clip) throw new Error('no video file found in #general');
console.log('found:', clip.name, clip.url_private_download);
const res = await fetch(clip.url_private_download, {
  headers: { authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
});
await writeFile(new URL('../captures/clip-source.mp4', import.meta.url).pathname, Buffer.from(await res.arrayBuffer()));
console.log('saved captures/clip-source.mp4');
```
Run with `cd demo-video && node --experimental-modules scripts/fetch-clip.mjs` — needs `@slack/web-api`; run it from `agent/` instead if module resolution complains: `cd agent && node ../demo-video/scripts/fetch-clip.mjs`.
Verify: `ffprobe captures/clip-source.mp4` shows a video + **audio** stream.

- [ ] **Step 6: Write `demo-video/scripts/to-mp4.sh`** and convert:

```bash
#!/bin/bash
# Playwright records webm; HyperFrames compositions get clean H.264.
set -euo pipefail
cd "$(dirname "$0")/../captures"
for f in s*.webm; do
  ffmpeg -y -i "$f" -c:v libx264 -crf 18 -preset fast -r 30 -an "${f%.webm}.mp4"
done
ls -la s*.mp4
```
Run: `bash demo-video/scripts/to-mp4.sh` → six `sN.mp4` files.

- [ ] **Step 7: Commit**

```bash
git add demo-video/scripts/capture-shots.mjs demo-video/scripts/fetch-clip.mjs demo-video/scripts/to-mp4.sh
git commit -m "feat(demo-video): per-shot Slack capture, clip fetch, mp4 conversion"
```

---

### Task 7: HyperFrames assembly

**Files:**
- Create: `demo-video/assembly/` (HyperFrames project — `index.html` composition + assets)

**Interfaces:**
- Consumes: `vo/out/*.mp3` + `vo/out/durations.json` (Task 3), `captures/s*.mp4` + `clip-source.mp4` (Task 6), `docs/architecture/three-memory-architecture.png`.
- Produces: a composition that `npx hyperframes render` can turn into the final MP4 (Task 8).

- [ ] **Step 1: Load the authoring contract** — read skills `/hyperframes-core` and `/hyperframes-keyframes` (composition `data-*` contract, seek-safe GSAP) before writing any HTML. These are the API; do not author from memory.

- [ ] **Step 2: Scaffold**

```bash
cd demo-video && npx hyperframes init assembly --non-interactive --example minimal
```
(If `minimal` isn't an example name, run `npx hyperframes init --help` / pick the simplest listed example.) Copy assets in: `cp ../docs/architecture/three-memory-architecture.png assembly/assets/` etc., per the scaffold's layout.

- [ ] **Step 3: Author the composition** — one timeline, segment lengths from `durations.json`. The segment contract (treatments from the spec):

| Seg | Source | Treatment | Sync cue |
|---|---|---|---|
| 1 | none | Kinetic type, exact s1 lines; hold-beats after "computational research facility." and "They won." | starts at 0 |
| 2 | s2.mp4 | Full frame → zoom to ES section at "and in Spanish" → zoom to news block at "local reporting" | s2.mp3 |
| 3 | s3.mp4 | Full frame during typing/thinking → slow push-in on the streaming answer → zoom to receipts | s3.mp3 |
| 4 | s4.mp4 | Push-in to "AFS MILWAUKEE LLC" line as the VO names it | s4.mp3 |
| 5a | s5.mp4 (first part) | Full frame on transcript search streaming; zoom to timestamp + ▶ link | s5a.mp3 |
| 5b | clip-source.mp4 | Near-full-bleed, **its own audio**, no VO | fixed ~12s |
| 5c | s5.mp4 (freeze/last frames) | Slow zoom out | s5c.mp3 |
| 6 | s6.mp4 | Zoom to the #260142 result row | s6.mp3 — **omit whole segment if over budget (Task 3 Step 4)** |
| 7 | s7.mp4 | Spanish stream full frame → modal center-zoom → push-in on 🧪 demo-mode notice at "test inbox" → confirmation | s7.mp3 |
| 8 | architecture PNG | Slow pan; highlight rings on ★ MCP + ★ RTS badges, then the compliance bar | s8.mp3 |
| 9 | none | Kinetic type, s9 lines; end card: "Gavel — find out before." + repo URL | s9.mp3 |

Style: dark background matching Slack's dark theme; type in a bold grotesque; accent color from the Gavel gavel-icon purple/blue. No music bed.

- [ ] **Step 4: Static gates + visual smoke**

```bash
cd demo-video/assembly && npx hyperframes lint && npx hyperframes validate && npx hyperframes snapshot --frames 12
```
Expected: lint/validate clean; **read the 12 snapshot PNGs** — every segment shows its content (no unstyled top-left text, no missing heroes).

- [ ] **Step 5: Draft render + watch**

```bash
npx hyperframes render --quality draft --output ../render/draft.mp4 && [ -s ../render/draft.mp4 ] && ffprobe -v error -show_entries format=duration -of csv=p=0 ../render/draft.mp4
```
Use `/watch` on `render/draft.mp4`: check every sync cue in the table above lands (zooms hit as the VO says the words), thinking/streaming visibly plays in s2–s7, duration ≤ 180s. Iterate here — draft renders are cheap.

- [ ] **Step 6: Commit the composition**

```bash
git add demo-video/assembly && git commit -m "feat(demo-video): HyperFrames assembly — kinetic type, zoom/pan, VO + clip audio"
```

---

### Task 8: Final render, verification, hand to Tarik

**Files:** none new.

- [ ] **Step 1: Final render** (user-gated per HyperFrames convention — Tarik has approved by reaching this task; offer `npx hyperframes preview` if he wants Studio first)

```bash
cd demo-video/assembly && npx hyperframes render --quality high --output ../render/gavel-demo.mp4
[ -s ../render/gavel-demo.mp4 ] || echo "RENDER PRODUCED NO OUTPUT"
```

- [ ] **Step 2: Hard gates**

```bash
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 ../render/gavel-demo.mp4); echo "duration: ${d}s"; awk "BEGIN{exit !($d <= 180)}" && echo "✅ ≤3:00" || echo "❌ OVER 3:00 — cut seg 6 and re-render"
```

- [ ] **Step 3: `/watch` the final MP4** against `DEMO-CAPTURE-PLAN.md` PART 3: ≤3:00 · wow (RTS answer) lands by ~1:10 · agent visibly thinking/streaming in every live segment · **all four disclosures audible** (s2 manual trigger · s3 posted fresh · s5a clip pre-posted · s7 test inbox) · no terminal/code/IDE in any frame · S5b clip audio audible.

- [ ] **Step 4: Report + hand off**

```bash
npx hyperframes feedback --rating 5 --comment "gavel demo assembly"
```
Tell Tarik: upload `demo-video/render/gavel-demo.mp4`, then **open the link logged-out in incognito** — if it asks to sign in, it's private and judges can't watch. Upload early; processing takes time.

- [ ] **Step 5: Commit any final tweaks + journal**

```bash
git add -A demo-video docs && git commit -m "feat(demo-video): final render pipeline complete"
```
