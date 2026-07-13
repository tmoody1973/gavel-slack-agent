import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMessage, shouldEngageThread } from '../../../listeners/events/message.js';
import { primeStore, sessionStore } from '../../../thread-context/index.js';

const BOT = 'U0GAVEL';
const gavelPost = { bot_id: 'B1', user: BOT };

test('a reply under one of Gavel\'s own messages engages, even unprimed', () => {
  // The judge/resident path: see the alert card, reply to it. Silence here reads as broken.
  assert.equal(
    shouldEngageThread({ session: null, prime: null, parent: gavelPost, botUserId: BOT }),
    true,
  );
});

test('a reply under a HUMAN message does not engage', () => {
  assert.equal(
    shouldEngageThread({ session: null, prime: null, parent: { user: 'U9' }, botUserId: BOT }),
    false,
  );
});

test("a reply under ANOTHER app's bot message does not engage", () => {
  // Gavel must not get pulled into every other bot's thread in the channel.
  assert.equal(
    shouldEngageThread({ session: null, prime: null, parent: { bot_id: 'B2', user: 'U0OTHER' }, botUserId: BOT }),
    false,
  );
});

test('an existing session or an Ask-Gavel prime engages without needing the parent', () => {
  assert.equal(shouldEngageThread({ session: 'sess_1', prime: null, parent: undefined, botUserId: BOT }), true);
  assert.equal(shouldEngageThread({ session: null, prime: 'CONTEXT: …', parent: undefined, botUserId: BOT }), true);
});

test('an unreadable parent (API failed) does not engage', () => {
  assert.equal(shouldEngageThread({ session: null, prime: null, parent: undefined, botUserId: BOT }), false);
});

test('primeStore stores and expires thread preambles independently of sessions', () => {
  primeStore.setSession('C1', '111.222', 'CONTEXT: File #260039');
  assert.equal(primeStore.getSession('C1', '111.222'), 'CONTEXT: File #260039');
  assert.equal(sessionStore.getSession('C1', '111.222'), null);
});

function makeBoltArgs(event) {
  const appended = [];
  return {
    args: {
      client: {},
      context: { userId: 'U1' },
      event,
      logger: { error: () => {} },
      say: async () => {},
      sayStream: () => ({
        append: async (m) => appended.push(m),
        stop: async () => {},
      }),
      setStatus: async () => {},
    },
    appended,
  };
}

test('an unprimed, sessionless channel thread reply is ignored (early return)', async () => {
  const { args, appended } = makeBoltArgs({
    channel: 'C2',
    ts: '2.0',
    thread_ts: '1.0',
    text: 'what is this?',
    channel_type: 'channel',
  });
  await handleMessage(args);
  assert.equal(appended.length, 0);
});
