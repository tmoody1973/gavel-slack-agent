import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishHome } from '../../home/publish.js';

function fakes({ failState = false } = {}) {
  const published = [];
  const client = { views: { publish: async (v) => published.push(v) } };
  const deps = {
    listSubscriptions: async () => {
      if (failState) throw new Error('convex down');
      return [{ channelId: 'C1', committees: [], keywords: ['x'], language: 'en' }];
    },
    listAllWatches: async () => [],
    listUpcoming: async () => [],
    getChannelName: async () => 'general',
  };
  return { published, client, deps, logger: { error: () => {} } };
}

test('publishHome publishes the hybrid view for the user', async () => {
  const { published, client, deps, logger } = fakes();
  await publishHome({ client, userId: 'U1' }, deps, logger);
  assert.equal(published[0].user_id, 'U1');
  assert.match(JSON.stringify(published[0].view), /your civic week/);
});

test('a state failure falls back to the static view — never a blank Home', async () => {
  const { published, client, deps, logger } = fakes({ failState: true });
  await publishHome({ client, userId: 'U1' }, deps, logger);
  assert.equal(published.length, 1);
  assert.match(JSON.stringify(published[0].view), /civic transparency/i);
});

test('even a publish failure never throws', async () => {
  const { deps, logger } = fakes();
  const client = {
    views: {
      publish: async () => {
        throw new Error('slack 500');
      },
    },
  };
  await publishHome({ client, userId: 'U1' }, deps, logger);
  assert.ok(true);
});
