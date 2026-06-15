import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeParcelWatch } from '../../../listeners/actions/parcel-buttons.js';

function makeBoltArgs(value = '2000 S 13TH ST') {
  const acked = [];
  const ephemerals = [];
  return {
    args: {
      ack: async () => acked.push(true),
      body: {
        channel: { id: 'C0BAPMK6HE2' },
        message: { ts: '171.001' },
        actions: [{ value }],
      },
      context: { userId: 'U1' },
      client: { chat: { postEphemeral: async (m) => ephemerals.push(m) } },
      logger: { info: () => {}, error: () => {} },
    },
    acked,
    ephemerals,
  };
}

test('Watch: acks, adds a channel-scoped watch on the address, confirms ephemerally', async () => {
  const watches = [];
  const deps = { addWatch: async (input) => watches.push(input) };
  const { args, acked, ephemerals } = makeBoltArgs();
  await makeParcelWatch(deps)(args);
  assert.equal(acked.length, 1);
  assert.deepEqual(watches, [{ channelId: 'C0BAPMK6HE2', entity: '2000 S 13TH ST' }]);
  assert.match(ephemerals[0].text, /2000 S 13TH ST/);
  assert.equal(ephemerals[0].channel, 'C0BAPMK6HE2');
  assert.equal(ephemerals[0].user, 'U1');
});

test('Watch: missing button value degrades to an ephemeral error, no addWatch', async () => {
  const watches = [];
  const deps = { addWatch: async (input) => watches.push(input) };
  const { args, ephemerals } = makeBoltArgs('   ');
  await makeParcelWatch(deps)(args);
  assert.equal(watches.length, 0);
  assert.match(ephemerals[0].text, /something went wrong/i);
});

test('Watch: addWatch failure degrades to an ephemeral error, never a throw', async () => {
  const deps = {
    addWatch: async () => {
      throw new Error('convex down');
    },
  };
  const { args, ephemerals } = makeBoltArgs();
  await makeParcelWatch(deps)(args);
  assert.match(ephemerals[0].text, /something went wrong/i);
});
