#!/usr/bin/env node

// MOO-73 live verification: exercise the three REAL alert-card button handlers
// against real Convex, real Legistar, and real Slack — exactly the deps prod
// wires in listeners/actions/index.js. Only Bolt's click routing is simulated
// (a human click on the deployed app remains the final check) and ephemerals
// are captured instead of posted (they're invisible to verification anyway).
//
// Run: node scripts/moo-73-verify.mjs   (from agent/)

import { WebClient } from '@slack/web-api';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

import { api } from '../convex/_generated/api.js';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from '../listeners/actions/alert-buttons.js';
import { createLegistarClient } from '../poller/legistar.js';

const CHANNEL = process.env.GAVEL_DEMO_CHANNEL || 'C0B8KS5VCCC';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = createLegistarClient({
  fetch: globalThis.fetch,
  client: 'milwaukee',
  userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
});

// The exact deps shape from listeners/actions/index.js
const deps = {
  getDetectedItem: (eventItemId) => convex.query(api.detectedItems.getByEventItem, { eventItemId }),
  getMatter: (matterId) => legistar.getMatter(matterId),
  getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
  addWatch: ({ channelId, entity }) => convex.mutation(api.watches.addWatch, { channelId, entity }),
};

/** Find the most recent alert card (a bot message carrying alert_watch). */
async function findLatestAlertCard() {
  const history = await slack.conversations.history({ channel: CHANNEL, limit: 100 });
  for (const message of history.messages) {
    const actions = (message.blocks ?? []).find((b) => b.type === 'actions');
    const watchButton = actions?.elements?.find((e) => e.action_id === 'alert_watch');
    if (watchButton) return { cardTs: message.ts, eventItemId: watchButton.value };
  }
  throw new Error(`no alert card with buttons found in the last 100 messages of ${CHANNEL}`);
}

function makeArgs({ cardTs, eventItemId }, ephemerals) {
  return {
    ack: async () => process.stdout.write('  ack() '),
    body: { channel: { id: CHANNEL }, message: { ts: cardTs }, actions: [{ value: eventItemId }] },
    context: { userId: 'U_VERIFY' },
    client: {
      chat: {
        postMessage: (m) => slack.chat.postMessage(m),
        postEphemeral: async (m) => {
          ephemerals.push(m);
          return { ok: true };
        },
      },
    },
    logger: {
      info: (m) => console.log(`  log: ${m}`),
      error: (m) => console.error(`  ERR: ${m}`),
    },
  };
}

const card = await findLatestAlertCard();
console.log(`Card under test: ts=${card.cardTs} eventItemId=${card.eventItemId}\n`);

const watchesBefore = await convex.query(api.watches.listWatches, { channelId: CHANNEL });

// --- 1. Watch ---------------------------------------------------------------
console.log('1) 👁 Watch handler');
const watchEphemerals = [];
await makeAlertWatch(deps)(makeArgs(card, watchEphemerals));
console.log(`  ephemeral: ${JSON.stringify(watchEphemerals[0]?.text)}`);
const watchesAfter = await convex.query(api.watches.listWatches, { channelId: CHANNEL });
console.log(`  Convex watches now: ${JSON.stringify(watchesAfter.map((w) => w.entity))}`);

// --- 2. History --------------------------------------------------------------
console.log('\n2) 🕓 History handler');
const historyEphemerals = [];
await makeAlertHistory(deps)(makeArgs(card, historyEphemerals));
if (historyEphemerals.length > 0) {
  console.log(`  ephemeral (no-history path): ${JSON.stringify(historyEphemerals[0].text)}`);
} else {
  const replies = await slack.conversations.replies({ channel: CHANNEL, ts: card.cardTs, limit: 20 });
  const last = replies.messages.at(-1);
  console.log(`  thread reply posted ts=${last.ts}:`);
  console.log(`  ${JSON.stringify(last.blocks, null, 2).split('\n').join('\n  ')}`);
}

// --- 3. Ask Gavel ------------------------------------------------------------
console.log('\n3) 💬 Ask Gavel handler');
const askEphemerals = [];
await makeAlertAsk(deps)(makeArgs(card, askEphemerals));
const askReplies = await slack.conversations.replies({ channel: CHANNEL, ts: card.cardTs, limit: 20 });
const askMessage = askReplies.messages.at(-1);
console.log(`  invitation reply: ${JSON.stringify(askMessage.text)}`);
// The prime lives in THIS process, not prod — a human click on the deployed
// app is the remaining proof for the primed-thread Q&A. Delete the invitation
// so nobody replies into a thread prod hasn't primed.
await slack.chat.delete({ channel: CHANNEL, ts: askMessage.ts });
console.log('  (invitation deleted — prod priming verified by a human click)');

// --- 4. removeWatch cycle (the /gavel unwatch mutation) ----------------------
console.log('\n4) removeWatch (un-stubbed /gavel unwatch path)');
const before = new Set(watchesBefore.map((w) => w.entity));
const addedEntity = watchesAfter.map((w) => w.entity).find((e) => !before.has(e));
if (addedEntity) {
  const removedId = await convex.mutation(api.watches.removeWatch, { channelId: CHANNEL, entity: addedEntity });
  const watchesFinal = await convex.query(api.watches.listWatches, { channelId: CHANNEL });
  console.log(`  removed "${addedEntity}" → ${JSON.stringify(removedId)}`);
  console.log(`  Convex watches now: ${JSON.stringify(watchesFinal.map((w) => w.entity))}`);
} else {
  console.log('  watch already existed before the run — leaving channel state untouched');
}

console.log('\nDone. Remaining human checks: real clicks on the DEPLOYED app (routing) + screenshots.');
