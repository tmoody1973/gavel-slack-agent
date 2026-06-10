import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from '../../../listeners/actions/alert-buttons.js';
import { primeStore } from '../../../thread-context/index.js';

const row = {
  eventItemId: 490695,
  eventId: 12345,
  matterId: 73861,
  title: 'Resolution relating to a Certificate of Appropriateness',
  eventBodyName: 'HISTORIC PRESERVATION COMMISSION',
};

function makeBoltArgs() {
  const acked = [];
  const ephemerals = [];
  const posted = [];
  return {
    args: {
      ack: async () => acked.push(true),
      body: {
        channel: { id: 'C0B8KS5VCCC' },
        message: { ts: '171.001' },
        actions: [{ value: '490695' }],
      },
      context: { userId: 'U1' },
      client: {
        chat: {
          postEphemeral: async (m) => ephemerals.push(m),
          postMessage: async (m) => posted.push(m),
        },
      },
      logger: { info: () => {}, error: () => {} },
    },
    acked,
    ephemerals,
    posted,
  };
}

const matter = { fileNumber: '260039' };
const history = [
  { date: '2026-05-01T12:53:00', action: 'ASSIGNED TO', body: 'COMMON COUNCIL', result: undefined },
  { date: '2026-06-01T00:00:00', action: 'ADOPTED', body: 'HISTORIC PRESERVATION COMMISSION', result: 'Pass' },
];

test('Watch: acks, adds a watch on the file number, confirms ephemerally', async () => {
  const watches = [];
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async (input) => watches.push(input),
  };
  const { args, acked, ephemerals } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.equal(acked.length, 1);
  assert.deepEqual(watches, [{ channelId: 'C0B8KS5VCCC', entity: 'File #260039' }]);
  assert.match(ephemerals[0].text, /Watching File #260039/);
});

test('Watch: falls back to the row title when there is no matter', async () => {
  const watches = [];
  const deps = {
    getDetectedItem: async () => ({ ...row, matterId: undefined }),
    getMatter: async () => {
      throw new Error('should not be called');
    },
    getMatterHistory: async () => [],
    addWatch: async (input) => watches.push(input),
  };
  const { args } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.equal(watches[0].entity, row.title);
});

test('Watch: failure degrades to an ephemeral error, never a throw', async () => {
  const deps = {
    getDetectedItem: async () => {
      throw new Error('convex down');
    },
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, ephemerals } = makeBoltArgs();
  await makeAlertWatch(deps)(args);
  assert.match(ephemerals[0].text, /something went wrong/i);
});

test('History: posts a timeline as a thread reply under the card', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async () => {},
  };
  const { args, posted } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted[0].channel, 'C0B8KS5VCCC');
  assert.equal(posted[0].thread_ts, '171.001');
  const all = JSON.stringify(posted[0].blocks);
  assert.ok(all.includes('History — File #260039'));
  assert.ok(all.includes('ADOPTED'));
});

test('History: no matter on the row → ephemeral information-unavailable, no thread post', async () => {
  const deps = {
    getDetectedItem: async () => ({ ...row, matterId: undefined }),
    getMatter: async () => matter,
    getMatterHistory: async () => history,
    addWatch: async () => {},
  };
  const { args, posted, ephemerals } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted.length, 0);
  assert.equal(ephemerals.length, 1);
});

test('History: empty history → ephemeral information-unavailable', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, posted, ephemerals } = makeBoltArgs();
  await makeAlertHistory(deps)(args);
  assert.equal(posted.length, 0);
  assert.match(ephemerals[0].text, /history/i);
});

test('Ask Gavel: primes the card thread and posts the invitation reply', async () => {
  const deps = {
    getDetectedItem: async () => row,
    getMatter: async () => matter,
    getMatterHistory: async () => [],
    addWatch: async () => {},
  };
  const { args, posted } = makeBoltArgs();
  await makeAlertAsk(deps)(args);
  assert.equal(posted[0].thread_ts, '171.001');
  assert.match(posted[0].text, /File #260039/);
  const prime = primeStore.getSession('C0B8KS5VCCC', '171.001');
  assert.ok(prime.includes('File #260039'));
  assert.ok(prime.includes(row.title));
});
