import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleAlertAsk, handleAlertHistory, handleAlertWatch } from '../../../listeners/actions/alert-buttons.js';

function args() {
  const calls = { ack: 0, ephemeral: [], logs: [] };
  return {
    calls,
    arg: {
      ack: async () => {
        calls.ack += 1;
      },
      body: { channel: { id: 'C1' }, message: { ts: '111.222' }, actions: [{ value: '490695' }] },
      context: { userId: 'U1' },
      client: { chat: { postEphemeral: async (m) => calls.ephemeral.push(m) } },
      logger: { info: (m) => calls.logs.push(m), error: (m) => calls.logs.push(m) },
    },
  };
}

for (const [name, handler] of [
  ['watch', handleAlertWatch],
  ['history', handleAlertHistory],
  ['ask', handleAlertAsk],
]) {
  test(`${name} acks, logs, and posts an ephemeral ack`, async () => {
    const { calls, arg } = args();
    await handler(arg);
    assert.equal(calls.ack, 1);
    assert.equal(calls.ephemeral.length, 1);
    assert.equal(calls.ephemeral[0].user, 'U1');
    assert.ok(calls.logs.some((l) => l.includes('490695')));
  });
}
