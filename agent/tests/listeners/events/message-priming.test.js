import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleMessage } from '../../../listeners/events/message.js';
import { primeStore, sessionStore } from '../../../thread-context/index.js';

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
